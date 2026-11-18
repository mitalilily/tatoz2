const asyncHandler = require('express-async-handler');
const { processProductImage, processMultipleImages, generateSEOContent, getAIClient, getAIModel } = require('../services/aiService');
const { saveFileToDisk } = require('../middleware/upload');
const crypto = require('crypto');
const path = require('path');
const sharp = require('sharp');
const Settings = require('../models/Settings');
const { startAIUsage } = require('../services/aiUsageService');
const { AI_CREDIT_COSTS, roundCredits } = require('../config/aiCreditCosts');
const connectDB = require('../config/db');
const { beginProgress, updateProgress, completeProgress, failProgress, getProgress } = require('../services/aiProgressService');

const AI_CREDIT_COST = AI_CREDIT_COSTS.productAI;
const VISION_PREVIEW_MAX_BYTES = 4000;

const optimizeImageForVision = async buffer => {
  let lastPreview;
  // The configured Meta vision endpoint may reject larger
  // inline images with a misleading "Connection error". Keep the AI payload
  // compact while preserving the original upload for the product gallery.
  for (const size of [128, 96, 64]) {
    for (const quality of [35, 25, 20]) {
      lastPreview = await sharp(buffer)
        .rotate()
        .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality, chromaSubsampling: '4:2:0' })
        .toBuffer();
      if (lastPreview.length <= VISION_PREVIEW_MAX_BYTES) return lastPreview;
    }
  }
  return lastPreview;
};

// Helper: check and deduct AI credits
async function deductAICredits(res) {
  if (!connectDB.isReady()) {
    res.status(503);
    const error = new Error('Database connection is temporarily unavailable. Please retry in a moment.');
    error.publicCode = 'DATABASE_UNAVAILABLE';
    throw error;
  }

  // Deduct atomically so simultaneous admin requests cannot overwrite one
  // another's balance update.
  let updated;
  try {
    updated = await Settings.findOneAndUpdate(
      { key: 'ai_credits', value: { $gte: AI_CREDIT_COST } },
      { $inc: { value: -AI_CREDIT_COST }, $set: { group: 'ai' } },
      { new: true },
    );
  } catch (error) {
    if (String(error?.code || '').toUpperCase() === 'ENETUNREACH' || /Mongo(Network|ServerSelection|Timeout)|timed out|connect/i.test(String(error?.name || '') + String(error?.message || ''))) {
      res.status(503);
      const safeError = new Error('Database connection is temporarily unavailable. Please retry in a moment.');
      safeError.publicCode = 'DATABASE_UNAVAILABLE';
      throw safeError;
    }
    throw error;
  }
  if (!updated) {
    const credits = Number(await Settings.get('ai_credits', 0));
    res.status(402);
    throw new Error(`Insufficient AI credits. You have ${credits} credits but need ${AI_CREDIT_COST}. Please top up.`);
  }
  return roundCredits(updated.value);
}

async function refundAICredits(amount = AI_CREDIT_COST) {
  await Settings.findOneAndUpdate(
    { key: 'ai_credits' },
    { $inc: { value: amount }, $set: { group: 'ai' } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
}

// @desc    Analyze one or more product images and auto-generate listing fields
// @route   POST /api/admin/ai/analyze-image
const analyzeProductImage = asyncHandler(async (req, res) => {
  const files = req.files?.length ? req.files : (req.file ? [req.file] : []);
  if (!files.length) {
    res.status(400);
    throw new Error('At least one image file is required');
  }

  const analysisId = String(req.body?.analysisId || req.get('x-ai-analysis-id') || crypto.randomUUID());
  beginProgress(analysisId);
  updateProgress(analysisId, 12, 'received', 'Images received');
  const model = await getAIModel();
  const usage = startAIUsage(req, { feature: 'product_ai', action: 'analyze_product_images', credits: AI_CREDIT_COST, model, metadata: { imageCount: files.length } });
  let remainingCredits;
  let creditsCharged = false;
  try {
    remainingCredits = await deductAICredits(res);
    creditsCharged = true;
    usage.charge(AI_CREDIT_COST);

    // Save all images to disk
    let savedFiles = [];
    try {
      savedFiles = await Promise.all(files.map(f => {
        const ext = path.extname(f.originalname) || '.jpg';
        return saveFileToDisk(f.buffer, { ext, originalname: f.originalname, mimetype: f.mimetype });
      }));
    } catch (err) {
      await refundAICredits();
      creditsCharged = false;
      usage.refund(AI_CREDIT_COST);
      throw err;
    }
    updateProgress(analysisId, 32, 'uploaded', 'Images uploaded securely');

    const imageUrls = savedFiles.map(f => f.url);
    // Keep the original files for the gallery, but send provider-safe previews
    // to the vision model so image uploads do not fail as "Connection error".
    const imagesBase64 = await Promise.all(files.map(async file => {
      try {
        const preview = await optimizeImageForVision(file.buffer);
        return preview.toString('base64');
      } catch (error) {
        console.warn('[ai] Image preview optimization skipped:', error.message);
        return file.buffer.toString('base64');
      }
    }));
    updateProgress(analysisId, 40, 'prepared', 'Vision previews prepared');

    const result = await processMultipleImages(imagesBase64, imageUrls, req.body?.additionalContext || '', {
      onProgress: ({ progress, stage, message }) => updateProgress(analysisId, progress, stage, message),
    });
    updateProgress(analysisId, 98, 'finalising', 'Listing fields validated');
    await usage.finish({ extraMetadata: { savedImageCount: savedFiles.length, hasAdditionalContext: Boolean(req.body?.additionalContext) } });
    completeProgress(analysisId);

    res.json({
      success: true,
      analysisId,
      images: savedFiles.map(f => ({ url: f.url, filename: f.filename })),
      // keep single-image compat fields
      imageUrl: savedFiles[0]?.url,
      imagePublicId: savedFiles[0]?.filename,
      analysis: result.imageAnalysis,
      content: result.productContent,
      combined: result.combined,
      aiCredits: remainingCredits,
    });
  } catch (err) {
    failProgress(analysisId, err.message || 'Analysis failed');
    if (creditsCharged) {
      await refundAICredits();
      usage.refund(AI_CREDIT_COST);
    }
    await usage.finish({ status: res.statusCode === 402 ? 'rejected' : 'failed', error: err.message });
    throw err;
  }
});

// @desc    Read live progress for an admin product-analysis request
// @route   GET /api/admin/ai/analyze-progress/:id
const getAnalyzeProgress = asyncHandler(async (req, res) => {
  const entry = getProgress(String(req.params.id || ''));
  if (!entry) {
    res.status(404);
    throw new Error('AI analysis progress was not found or has expired');
  }
  res.json({ success: true, ...entry });
});

// @desc    Regenerate product content (without re-uploading image)
// @route   POST /api/admin/ai/regenerate
const regenerateContent = asyncHandler(async (req, res) => {
  const { imageUrl, additionalContext } = req.body;
  if (!imageUrl) { res.status(400); throw new Error('Image URL is required'); }

  const model = await getAIModel();
  const usage = startAIUsage(req, { feature: 'product_ai', action: 'regenerate_product_content', credits: AI_CREDIT_COST, model, metadata: { hasImageUrl: true, hasAdditionalContext: Boolean(additionalContext) } });
  let creditsCharged = false;
  try {
    const remainingCredits = await deductAICredits(res);
    creditsCharged = true;
    usage.charge(AI_CREDIT_COST);
    const { analyzeProductImage: analyzeImg, generateProductContent } = require('../services/aiService');
    const imageAnalysis = await analyzeImg(imageUrl);
    const productContent = await generateProductContent(imageAnalysis, additionalContext);
    await usage.finish();
    res.json({ success: true, analysis: imageAnalysis, content: productContent, aiCredits: remainingCredits });
  } catch (err) {
    if (creditsCharged) {
      await refundAICredits();
      usage.refund(AI_CREDIT_COST);
    }
    await usage.finish({ status: res.statusCode === 402 ? 'rejected' : 'failed', error: err.message });
    throw err;
  }
});

// @desc    Generate SEO content for existing product
// @route   POST /api/admin/ai/generate-seo
const generateSEO = asyncHandler(async (req, res) => {
  const { title, description, category } = req.body;
  if (!title || !description) { res.status(400); throw new Error('Title and description required'); }

  const model = await getAIModel();
  const usage = startAIUsage(req, { feature: 'product_ai', action: 'generate_product_seo', credits: AI_CREDIT_COST, model, metadata: { category: String(category || '').slice(0, 80), descriptionLength: description.length } });
  let creditsCharged = false;
  try {
    const remainingCredits = await deductAICredits(res);
    creditsCharged = true;
    usage.charge(AI_CREDIT_COST);
    const seo = await generateSEOContent(title, description, category);
    await usage.finish();
    res.json({ success: true, seo, aiCredits: remainingCredits });
  } catch (err) {
    if (creditsCharged) {
      await refundAICredits();
      usage.refund(AI_CREDIT_COST);
    }
    await usage.finish({ status: res.statusCode === 402 ? 'rejected' : 'failed', error: err.message });
    throw err;
  }
});



// @desc    Get AI credits balance
// @route   GET /api/admin/ai/credits
const getAICredits = asyncHandler(async (req, res) => {
  const credits = Number(await Settings.get('ai_credits', 0));
  res.json({ success: true, credits, costPerUse: AI_CREDIT_COST });
});

module.exports = { analyzeProductImage, getAnalyzeProgress, regenerateContent, generateSEO, getAICredits };
