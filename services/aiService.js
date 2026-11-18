const { getAIClient, getAIConfig } = require('./aiProvider');

// Providers sometimes wrap JSON in markdown fences, add a short preamble, or
// return content parts instead of one string. Keep the prompt contract strict,
// but make the boundary tolerant so a harmless formatting difference does not
// turn a successful generation into a failed product flow.
const aiContentToText = value => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(aiContentToText).filter(Boolean).join('');
  if (!value || typeof value !== 'object') return '';
  if (typeof value.text === 'string') return value.text;
  if (typeof value.value === 'string') return value.value;
  if (value.message !== undefined && value.message !== null) {
    const message = aiContentToText(value.message);
    if (message) return message;
  }
  if (Array.isArray(value.choices)) {
    const choices = aiContentToText(value.choices);
    if (choices) return choices;
  }
  if (Array.isArray(value.output)) {
    const output = aiContentToText(value.output);
    if (output) return output;
  }
  if (value.content !== undefined && value.content !== null) {
    const content = aiContentToText(value.content);
    if (content) return content;
  }
  if (typeof value.output_text === 'string') return value.output_text;
  if (value.parsed && typeof value.parsed === 'object') return JSON.stringify(value.parsed);
  if (value.json && typeof value.json === 'object') return JSON.stringify(value.json);
  if (value.function_call?.arguments) return aiContentToText(value.function_call.arguments);
  if (Array.isArray(value.tool_calls)) {
    const argumentsText = value.tool_calls.map(call => call?.function?.arguments).filter(Boolean).join('');
    if (argumentsText) return argumentsText;
  }
  // Some reasoning-capable providers place the final answer
  // here when `content` is omitted. The JSON parser can still extract the
  // object from surrounding reasoning; HTML callers only use it as a fallback.
  if (typeof value.reasoning_content === 'string') return value.reasoning_content;
  return '';
};

const balancedJsonCandidates = text => {
  const candidates = [];
  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== '{' && text[start] !== '[') continue;
    const opening = text[start];
    const closing = opening === '{' ? '}' : ']';
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const character = text[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') {
        inString = true;
        continue;
      }
      if (character === opening || (opening === '{' && character === '[') || (opening === '[' && character === '{')) depth += 1;
      else if (character === closing || (opening === '{' && character === ']') || (opening === '[' && character === '}')) depth -= 1;
      if (depth === 0) {
        candidates.push(text.slice(start, index + 1));
        break;
      }
      if (depth < 0) break;
    }
  }
  return candidates;
};

const repairCommonJsonFormatting = value => {
  let output = '';
  let inString = false;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (inString) {
      if (escaped) {
        escaped = false;
        output += character;
      } else if (character === '\\') {
        escaped = true;
        output += character;
      } else if (character === '"') {
        inString = false;
        output += character;
      } else if (character === '\n') {
        output += '\\n';
      } else if (character === '\r') {
        output += '\\r';
      } else if (character === '\t') {
        output += '\\t';
      } else {
        output += character;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
      output += character;
      continue;
    }
    if (character === ',') {
      let next = index + 1;
      while (/\s/.test(value[next] || '')) next += 1;
      if (value[next] === '}' || value[next] === ']') {
        index = next - 1;
        continue;
      }
    }
    output += character;
  }
  return output;
};

const parseAIJson = (value, errorMessage = 'Failed to parse AI response') => {
  const hasResponseEnvelope = value && typeof value === 'object' && !Array.isArray(value) && [
    'text', 'value', 'message', 'choices', 'output', 'content', 'output_text', 'parsed', 'json', 'function_call', 'tool_calls', 'reasoning_content',
  ].some(key => key in value);
  if (value && typeof value === 'object' && !Array.isArray(value) && !hasResponseEnvelope) return value;
  const text = aiContentToText(value).replace(/^\uFEFF/, '').trim();
  if (!text) throw new Error(errorMessage);

  const candidates = [text, ...balancedJsonCandidates(text)];
  for (const candidate of [...new Set(candidates)]) {
    const cleaned = candidate.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    for (const variant of [cleaned, repairCommonJsonFormatting(cleaned)]) {
      try {
        return JSON.parse(variant);
      } catch {
        // Try the next valid JSON boundary or a conservative formatting repair.
      }
    }
  }
  throw new Error(errorMessage);
};

const responseDiagnostics = response => {
  const message = response?.choices?.[0]?.message;
  const content = aiContentToText(message);
  return {
    finishReason: response?.choices?.[0]?.finish_reason || '',
    contentType: Array.isArray(message?.content) ? 'parts' : typeof message?.content,
    contentLength: content.length,
    startsWith: content.slice(0, 32),
    endsWith: content.slice(-32),
  };
};

const getAIConfigForService = () => getAIConfig({ requireKey: false });
const getAIModel = async () => getAIConfigForService().model;

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

const isRetryableAIError = error => {
  const status = Number(error?.status || error?.statusCode || 0);
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  return !status || [408, 409, 425, 429].includes(status) || status >= 500
    || ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'ENETUNREACH', 'UND_ERR_CONNECT_TIMEOUT'].includes(code)
    || /connection|timeout|temporarily unavailable|network/.test(message);
};

const safeAIError = error => {
  const status = Number(error?.status || error?.statusCode || 0);
  if (isRetryableAIError(error)) {
    const safeError = new Error('AI provider connection failed. Please retry in a moment.');
    safeError.statusCode = 503;
    safeError.publicCode = 'AI_PROVIDER_CONNECTION';
    safeError.cause = error;
    return safeError;
  }
  if (status === 401 || status === 403) {
    const safeError = new Error('AI provider authentication failed. Check the configured API key.');
    safeError.statusCode = 502;
    safeError.publicCode = 'AI_PROVIDER_AUTH';
    safeError.cause = error;
    return safeError;
  }
  if (status >= 400 && status < 500) {
    const safeError = new Error('AI provider rejected this request.');
    safeError.statusCode = 502;
    safeError.publicCode = 'AI_PROVIDER_REQUEST';
    safeError.cause = error;
    return safeError;
  }
  return error;
};

// A provider connection can fail transiently, especially for vision requests.
// Retry once at the service boundary, then return an actionable 503 instead of
// exposing a generic 500/"connection error" to the admin UI.
const createAICompletion = async (client, params, operation = 'AI request') => {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await client.chat.completions.create(params);
    } catch (error) {
      lastError = error;
      if (attempt === 1 || !isRetryableAIError(error)) throw safeAIError(error);
      console.warn(`[ai] ${operation} connection failed; retrying once:`, error.code || error.status || error.message);
      await sleep(350);
    }
  }

  throw safeAIError(lastError);
};

const normalizeProductAnalysis = analysis => {
  if (!analysis || typeof analysis !== 'object' || Array.isArray(analysis)) {
    throw new Error('AI image analysis did not return an object');
  }

  const productType = String(analysis.productType || '').trim();
  if (!productType || /^(unknown product|unknown|unidentified product|product)$/i.test(productType)) {
    throw new Error('AI image analysis did not identify the product');
  }

  const confidence = Number(analysis.confidenceScore);
  const normalizedConfidence = Number.isFinite(confidence)
    ? Math.max(0, Math.min(100, confidence > 0 && confidence <= 1 ? confidence * 100 : confidence))
    : 30;
  const priceValue = analysis.estimatedPriceRangeUSD;
  let estimatedPriceRangeUSD = priceValue;
  if (typeof priceValue === 'string') {
    const amounts = priceValue.match(/[0-9]+(?:\.[0-9]+)?/g)?.map(Number) || [];
    if (amounts.length >= 2) estimatedPriceRangeUSD = { min: amounts[0], max: amounts[1] };
  }

  return {
    ...analysis,
    productType,
    brand: analysis.brand && !/^unknown|null$/i.test(String(analysis.brand).trim()) ? String(analysis.brand).trim() : null,
    colors: Array.isArray(analysis.colors) ? analysis.colors.filter(Boolean).map(String) : [],
    features: Array.isArray(analysis.features) ? analysis.features.filter(Boolean).map(String) : [],
    category: String(analysis.category || 'General').trim() || 'General',
    subCategory: String(analysis.subCategory || '').trim(),
    confidenceScore: Math.round(normalizedConfidence),
    estimatedPriceRangeUSD,
    qualityIssues: Array.isArray(analysis.qualityIssues) ? analysis.qualityIssues.filter(Boolean).map(String) : [],
  };
};

const analyzeProductImage = async (imageUrl, imageBase64 = null) => {
  const client = await getAIClient();
  const model = await getAIModel();
  const imageContent = imageBase64
    ? { type: 'input_image', image_url: `data:image/jpeg;base64,${imageBase64}` }
    : { type: 'input_image', image_url: imageUrl };
  const prompt = `You are an expert e-commerce product analyst. Analyze the product image carefully and identify the specific product, not a generic placeholder. Return a JSON object with this structure:
{
  "productType": "specific product name",
  "brand": "brand name or null",
  "colors": ["array of colors detected"],
  "material": "material type or null",
  "category": "suggested main category",
  "subCategory": "suggested sub-category",
  "features": ["list of key features visible"],
  "targetAudience": "men/women/kids/unisex/general",
  "style": "style description",
  "condition": "new/used/refurbished",
  "estimatedPriceRangeUSD": {"min": number, "max": number},
  "confidenceScore": number between 0-100,
  "qualityIssues": ["any image quality problems"],
  "additionalNotes": "any other relevant observations"
}
Return ONLY valid JSON, with no markdown fences, no explanation, and no generic "Unknown Product" unless the image is genuinely unreadable.`;
  const request = extraPrompt => createAICompletion(client, {
    model,
    messages: [{
      role: 'user',
      content: [
        { type: 'input_text', text: `${prompt}${extraPrompt || ''}` },
        imageContent,
      ],
    }],
    response_format: { type: 'json_object' },
    max_tokens: 2200,
  }, 'Product image analysis');

  let lastError;
  for (const retryPrompt of ['', '\nRETRY: use the visible shape, packaging, label, material, and context to name the most specific product possible. Return one compact JSON object now.']) {
    try {
      const visionResponse = await request(retryPrompt);
      return normalizeProductAnalysis(parseAIJson(visionResponse.choices?.[0]?.message, 'Failed to parse AI image analysis'));
    } catch (error) {
      lastError = error;
      console.warn('[ai] Product image analysis response was unusable; retrying:', error.message);
    }
  }

  const error = new Error('Meta AI could not analyse the product image. Please use a clearer image and retry.');
  error.statusCode = 502;
  error.publicCode = 'AI_IMAGE_ANALYSIS_INVALID';
  error.cause = lastError;
  throw error;
};

// The configured provider accepts one inline image per vision request. Analyse
// each preview separately, then merge the visual facts locally instead of
// sending a multi-image payload that the provider drops as a connection error.
const analyzeMultipleImages = async (imagesBase64Array, options = {}) => {
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
  const analyses = new Array(imagesBase64Array.length);
  const failures = [];
  let completed = 0;
  const queue = [...imagesBase64Array.entries()];
  onProgress({ progress: 42, stage: 'analysing', message: 'Analysing product angles' });
  const worker = async () => {
    while (queue.length) {
      const [index, imageBase64] = queue.shift();
      try {
        analyses[index] = await analyzeProductImage(null, imageBase64);
      } catch (error) {
        failures.push(error);
        console.warn('[ai] One product image could not be analysed:', error.message);
      } finally {
        completed += 1;
        onProgress({
          progress: 42 + Math.round((completed / imagesBase64Array.length) * 25),
          stage: 'analysing',
          message: `Analysed ${completed} of ${imagesBase64Array.length} product image${imagesBase64Array.length === 1 ? '' : 's'}`,
        });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, imagesBase64Array.length) }, worker));

  const successfulAnalyses = analyses.filter(Boolean);
  if (!successfulAnalyses.length) throw failures[0] || new Error('Failed to analyse product image');

  const unique = values => [...new Set(values.flatMap(value => Array.isArray(value) ? value : [value]).filter(Boolean).map(String))];
  const firstAvailable = key => successfulAnalyses.map(analysis => analysis[key]).find(value => value && value !== 'null');
  const prices = successfulAnalyses.map(analysis => analysis.estimatedPriceRangeUSD).filter(value => value && Number.isFinite(Number(value.min)) && Number.isFinite(Number(value.max)));
  const confidenceScores = successfulAnalyses.map(analysis => Number(analysis.confidenceScore)).filter(Number.isFinite);

  return {
    productType: firstAvailable('productType') || successfulAnalyses[0].productType || 'Product',
    brand: firstAvailable('brand') || null,
    colors: unique(successfulAnalyses.map(analysis => analysis.colors)),
    material: firstAvailable('material') || null,
    category: firstAvailable('category') || 'General',
    subCategory: firstAvailable('subCategory') || '',
    features: unique(successfulAnalyses.map(analysis => analysis.features)),
    targetAudience: firstAvailable('targetAudience') || 'general',
    style: firstAvailable('style') || '',
    condition: firstAvailable('condition') || 'new',
    estimatedPriceRangeUSD: prices.length ? {
      min: Math.min(...prices.map(value => Number(value.min))),
      max: Math.max(...prices.map(value => Number(value.max))),
    } : undefined,
    confidenceScore: confidenceScores.length ? Math.round(confidenceScores.reduce((sum, value) => sum + value, 0) / confidenceScores.length) : 30,
    qualityIssues: unique(successfulAnalyses.map(analysis => analysis.qualityIssues)),
    imageDescriptions: successfulAnalyses.map((analysis, index) => analysis.additionalNotes || `${analysis.productType || 'Product'} view ${index + 1}`),
    additionalNotes: unique(successfulAnalyses.map(analysis => analysis.additionalNotes)).join(' '),
  };
};

const buildFallbackProductContent = (imageAnalysis = {}) => {
  const productType = String(imageAnalysis.productType || 'Product').trim();
  const brand = imageAnalysis.brand && imageAnalysis.brand !== 'null' ? String(imageAnalysis.brand).trim() : '';
  const category = String(imageAnalysis.category || 'General').trim();
  const subCategory = String(imageAnalysis.subCategory || '').trim();
  const colors = Array.isArray(imageAnalysis.colors) ? imageAnalysis.colors.filter(Boolean).map(String) : [];
  const features = Array.isArray(imageAnalysis.features) ? imageAnalysis.features.filter(Boolean).map(String) : [];
  const material = imageAnalysis.material && imageAnalysis.material !== 'null' ? String(imageAnalysis.material).trim() : '';
  const title = [brand, productType].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().slice(0, 70) || 'New Product';
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'new-product';
  const bulletPoints = (features.length ? features : [
    `Distinctive ${productType.toLowerCase()} design`,
    colors.length ? `Available in ${colors.join(', ')}` : 'Designed for everyday use',
    material ? `Made with ${material}` : 'Quality-focused construction',
    'Carefully reviewed from the supplied product image',
  ]).slice(0, 5);
  const keywords = [...new Set([productType, brand, category, subCategory, ...colors].filter(Boolean))].slice(0, 10);
  const description = `<h2>${title}</h2><p>${title} is a thoughtfully presented addition to the ${category.toLowerCase()} collection.</p><h3>Key details</h3><ul>${bulletPoints.map(point => `<li>${point}</li>`).join('')}</ul>`;
  return {
    title,
    shortDescription: `${title} for the ${category.toLowerCase()} collection.`.slice(0, 150),
    description,
    bulletPoints,
    tags: keywords,
    seo: {
      metaTitle: title.slice(0, 60),
      metaDescription: `${title} for the ${category.toLowerCase()} collection.`.slice(0, 160),
      keywords,
      altText: `${title} product image`.slice(0, 160),
      slug,
      canonical: `/products/${slug}`,
      focusKeyword: productType,
      robots: 'index, follow',
      ogTitle: title.slice(0, 70),
      ogDescription: `${title} for the ${category.toLowerCase()} collection.`.slice(0, 160),
      ogImage: '',
    },
    cro: {
      promotionalMessage: `Explore the ${title} and bring a considered ${category.toLowerCase()} choice to your everyday routine.`,
      reasonsTitle: "Why you'll love it",
      reasonsToBuy: bulletPoints.slice(0, 4),
      benefits: bulletPoints.slice(0, 4),
      etaText: 'Delivery options are shown at checkout.',
      faqs: [{ question: `What makes this ${productType.toLowerCase()} a good choice?`, answer: `Its visible design and features make it a considered option in the ${category.toLowerCase()} collection.` }],
      customRating: { enabled: false, value: 5, reviewCount: 0, summary: '' },
      socialProof: { enabled: false, period: '24h', count: 0, min: 0, max: 0, customLabel: '' },
      stockDisplay: { enabled: false, value: 0, min: 0, max: 0 },
      soldDisplay: { enabled: false, count: 0, min: 0, max: 0, label: 'sold recently' },
      visitorDisplay: { enabled: false, count: 0, min: 0, max: 0 },
    },
    brand: brand || null,
    category,
    subCategory,
    attributes: { color: colors, material, features: bulletPoints },
  };
};

// Keep generated HTML bounded and safe for the product editor. The storefront
// still sanitizes rendered HTML; this boundary removes executable content and
// prevents a provider from returning a full HTML document or huge payload.
const sanitizeGeneratedHtml = value => {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/<!doctype[^>]*>/gi, '')
    .replace(/<\/?(?:html|head|body)[^>]*>/gi, '')
    .trim()
    .slice(0, 30000);
};

const normalizeGeneratedProductContent = (content = {}) => {
  if (!content || typeof content !== 'object' || Array.isArray(content)) return content;
  const normalized = { ...content };
  if (normalized.description) normalized.description = sanitizeGeneratedHtml(normalized.description);
  if (normalized.schema && typeof normalized.schema === 'object' && !Array.isArray(normalized.schema)) {
    normalized.schema = { ...normalized.schema };
    if (normalized.schema.description) normalized.schema.description = sanitizeGeneratedHtml(normalized.schema.description).replace(/<[^>]+>/g, ' ');
  }
  if (normalized.cro && typeof normalized.cro === 'object') {
    normalized.cro = { ...normalized.cro };
    ['promotionalMessage', 'reasonsTitle', 'etaText'].forEach(key => {
      if (normalized.cro[key]) normalized.cro[key] = String(normalized.cro[key]).replace(/<[^>]*>/g, '').trim();
    });
  }
  return normalized;
};

const generateProductContent = async (imageAnalysis, additionalContext = '') => {
  const client = await getAIClient();
  const model = await getAIModel();

  const prompt = `You are an expert e-commerce copywriter and SEO specialist. Based on this product analysis:
${JSON.stringify(imageAnalysis, null, 2)}
${additionalContext ? `Additional context: ${additionalContext}` : ''}

Generate compact but complete product listing content and return as JSON. The
description must be a ready-to-review product detail description in safe,
semantic HTML. Include CRO copy and complete on-page SEO metadata. Never invent
technical specifications that are not supported by the image analysis or the
additional context. Use concise copy so the response is fast.
{
  "title": "SEO optimized product title (50-70 chars)",
  "shortDescription": "2-3 sentence hook (max 150 chars)",
  "description": "Safe semantic HTML only: 2-4 short sections using h2, h3, p, ul, li, strong and em. No markdown, scripts, styles, inline event handlers, claims without evidence, or full HTML document.",
  "bulletPoints": ["feature 1", "feature 2", "feature 3", "feature 4", "feature 5"],
  "tags": ["tag1", "tag2", ... up to 10 relevant tags],
  "seo": {
    "metaTitle": "SEO meta title (50-60 chars)",
    "metaDescription": "SEO meta description (150-160 chars)",
    "keywords": ["keyword1", "keyword2", ... up to 10 keywords],
    "altText": "descriptive alt text for product image",
    "slug": "url-friendly-slug",
    "canonical": "relative canonical path such as /products/example-product",
    "focusKeyword": "primary search phrase",
    "robots": "index, follow",
    "ogTitle": "social sharing title",
    "ogDescription": "social sharing description",
    "ogImage": ""
  },
  "cro": {
    "promotionalMessage": "truthful benefit-led message under 180 characters",
    "reasonsTitle": "Why you'll love it",
    "reasonsToBuy": ["specific reason 1", "specific reason 2", "specific reason 3", "specific reason 4"],
    "benefits": ["customer benefit 1", "customer benefit 2", "customer benefit 3", "customer benefit 4"],
    "etaText": "Delivery message without inventing a date",
    "faqs": [{"question": "Relevant customer question", "answer": "Evidence-based answer"}],
    "customRating": {"enabled": false, "value": 5, "reviewCount": 0, "summary": ""},
    "socialProof": {"enabled": false, "period": "24h", "count": 0, "min": 0, "max": 0, "customLabel": ""},
    "stockDisplay": {"enabled": false, "value": 0, "min": 0, "max": 0},
    "soldDisplay": {"enabled": false, "count": 0, "min": 0, "max": 0, "label": "sold recently"},
    "visitorDisplay": {"enabled": false, "count": 0, "min": 0, "max": 0}
  },
  "suggestedPrice": number,
  "brand": "brand name or null",
  "category": "main category",
  "subCategory": "sub category",
  "attributes": {
    "color": ["colors"],
    "material": "material",
    "features": ["key features"]
  }
}
Return ONLY the JSON, no extra text.`;

  const request = (content, options = {}) => createAICompletion(client, {
    model,
    messages: [{ role: 'user', content }],
    response_format: { type: 'json_object' },
    max_tokens: options.maxTokens || 3600,
    temperature: options.temperature ?? 0.3,
  }, 'Product listing generation');

  let response;
  try {
    response = await request(prompt);
    return normalizeGeneratedProductContent(parseAIJson(response.choices?.[0]?.message, 'Failed to parse AI-generated content'));
  } catch (firstError) {
    if (firstError?.publicCode === 'AI_PROVIDER_CONNECTION') {
      console.warn('[ai] Product listing provider unavailable; using local analysis fallback:', firstError.message);
      return normalizeGeneratedProductContent(buildFallbackProductContent(imageAnalysis));
    }
    console.warn('[ai] Product content response was not valid JSON; retrying:', responseDiagnostics(response), firstError.message);
    try {
      const retryPrompt = `${prompt}\n\nIMPORTANT RETRY RULES: Return one compact, valid JSON object only. Do not use markdown fences, comments, trailing commas, or line breaks inside quoted values. Keep bulletPoints, tags, and keywords to five items each.`;
      const retryResponse = await request(retryPrompt, { maxTokens: 2400, temperature: 0.1 });
      return normalizeGeneratedProductContent(parseAIJson(retryResponse.choices?.[0]?.message, 'Failed to parse AI-generated content'));
    } catch (retryError) {
      console.warn('[ai] Product content retry failed; using analysis fallback:', retryError.message);
      return normalizeGeneratedProductContent(buildFallbackProductContent(imageAnalysis));
    }
  }
};

// Generate a product catalogue HTML page styled to match the product's own color theme

const generateProductCatalogueHTML = async (imageAnalysis, imageUrls = [], additionalContext = '') => {
  const client = await getAIClient();
  const model = await getAIModel();

  const primaryImg = imageUrls[0] || '';
  const galleryImgs = imageUrls.slice(1);

  const prompt = `You are a senior UI designer at a luxury branding agency. You build editorial product catalogue pages that look like they belong in Vogue, Apple.com, or a premium D2C brand's website. Your pages are KNOWN for rich layered gradients, ambient glows, glassmorphism depth, and magazine-quality typography.

Product Analysis:
${JSON.stringify(imageAnalysis, null, 2)}
${additionalContext ? `Additional context: ${additionalContext}` : ''}

Real product image URLs — use EXACTLY as provided, do NOT make up URLs:
Primary: ${primaryImg}
${galleryImgs.length ? galleryImgs.map((u, i) => `Gallery ${i + 1}: ${u}`).join('\n') : '(no additional images)'}

OUTPUT: Complete self-contained HTML (<!DOCTYPE html> to </html>). All CSS inline in <style>, all JS inline in <script>. ZERO external dependencies — no CDNs, no Google Fonts, nothing external.

████████████████████████████████████████████
██  VISUAL DESIGN SYSTEM — READ FIRST    ██
████████████████████████████████████████████

This is the MOST IMPORTANT section. The page must be visually STUNNING — not flat, not boring, not a basic dark page with white text. It must have DEPTH, LAYERS, and RICHNESS.

STEP 1 — COLOR EXTRACTION (from product packaging):
Look at imageAnalysis colors, category, style. Extract the ACTUAL brand colors from the packaging. Then set:

:root {
  --bg-start: /* deepest shade of brand's dominant color */;
  --bg-end: /* slightly different hue of the dominant color for gradient */;
  --surface: /* brand color lightened 15%, with 0.6 opacity */;
  --surface-hover: /* brand color lightened 25%, with 0.7 opacity */;
  --accent: /* brand's most vivid secondary color (gold, teal, coral, etc.) */;
  --accent-light: /* accent at 40% lightness boost */;
  --accent2: /* third color from packaging */;
  --text: /* cream/white if dark bg, dark brown/charcoal if light bg */;
  --text-secondary: /* text at 65% opacity */;
  --glow: /* accent at 30% opacity */;
  --glow-strong: /* accent at 50% opacity */;
  --glass-bg: /* rgba version of surface with 0.12 opacity */;
  --glass-border: /* rgba white or accent at 0.1 opacity */;
}

CORRECT EXAMPLES:
- Ocean perfume (blue bottle, beach): --bg-start: #0A1628, --bg-end: #0F2847, --accent: #3B9EC9 (ocean blue), --accent-light: #6BC5E8, --accent2: #C9A96E (sand gold)
- Rajbhog Chana Sattu (maroon pack, gold logo): --bg-start: #3A0A12, --bg-end: #5C1420, --accent: #D4A843 (gold), --accent-light: #F0CC6B, --accent2: #4CAF50
- Luxury watch (black/silver): --bg-start: #0D0D0D, --bg-end: #1A1A2E, --accent: #C0C0C0 (silver), --accent-light: #E8E8E8

❌ NEVER use a flat single-color background. ALWAYS use a gradient.
❌ NEVER use plain border: 1px solid gray. ALWAYS use glassmorphism borders.
❌ NEVER leave cards without backdrop-filter blur. ALWAYS use glass effects.

STEP 2 — MANDATORY BACKGROUND (copy this exactly, just change colors):
The page background must be a LAYERED gradient — not flat:

body {
  background: linear-gradient(165deg, var(--bg-start) 0%, var(--bg-end) 50%, var(--bg-start) 100%);
  background-attachment: fixed;
}

body::before {
  content: '';
  position: fixed;
  top: -50%;
  left: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(ellipse at 30% 20%, var(--glow) 0%, transparent 50%),
              radial-gradient(ellipse at 70% 60%, rgba(var(--accent-rgb), 0.08) 0%, transparent 40%),
              radial-gradient(ellipse at 50% 80%, rgba(var(--accent-rgb), 0.05) 0%, transparent 45%);
  z-index: -1;
  pointer-events: none;
  animation: ambientShift 12s ease-in-out infinite alternate;
}

@keyframes ambientShift {
  0% { transform: translate(0, 0) scale(1); }
  100% { transform: translate(-2%, -1%) scale(1.03); }
}

STEP 3 — MANDATORY GLASSMORPHISM for all cards/panels:
Every card, chip, panel, table container must use this pattern:

.glass-card {
  background: linear-gradient(135deg, var(--glass-bg) 0%, rgba(255,255,255,0.03) 100%);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid var(--glass-border);
  box-shadow: 0 4px 24px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.05);
  border-radius: 16px;
}

.glass-card:hover {
  background: linear-gradient(135deg, var(--surface-hover) 0%, rgba(255,255,255,0.05) 100%);
  border-color: var(--accent);
  box-shadow: 0 8px 32px var(--glow), 0 0 0 1px var(--accent), inset 0 1px 0 rgba(255,255,255,0.08);
  transform: translateY(-4px);
}

STEP 4 — MANDATORY ACCENT GRADIENT TEXT for all section titles and pull-quotes:

.gradient-text {
  background: linear-gradient(135deg, var(--accent) 0%, var(--accent-light) 50%, var(--accent) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

STEP 5 — MANDATORY DECORATIVE ELEMENTS:
- Every section divider: height: 1px, background: linear-gradient(90deg, transparent 0%, var(--accent) 50%, transparent 100%), max-width: 120px, margin: 0 auto
- Product image glow: box-shadow: 0 0 60px var(--glow-strong), 0 20px 40px rgba(0,0,0,0.3)
- Floating orbs/blobs behind content: absolute positioned divs with border-radius: 50%, background: radial-gradient of accent color at low opacity, filter: blur(60px), animation: float
- At least 2 decorative gradient orbs on the page (one near header, one near features)

STEP 6 — ACCENT-COLORED BORDERS AND GLOWS EVERYWHERE:
- Category badges: background: linear-gradient(135deg, var(--accent), var(--accent-light)), NOT a flat color
- Number badges: background: linear-gradient(135deg, var(--accent), var(--accent-light))
- Table left borders: border-left: 3px solid var(--accent)
- Highlight chips: on hover, box-shadow: 0 0 20px var(--glow)
- Active/focus states: ring of accent color glow

████████████████████████████████████████████
██  CATALOGUE SECTIONS (build ALL 7)      ██
████████████████████████████████████████████

1. PRODUCT HEADER PANEL
   - Small uppercase tracking label: "— PRODUCT_NAME —" in var(--accent), font-size: 0.72rem, letter-spacing: 0.15em
   - Product name: clamp(2rem, 5vw, 3.2rem), font-weight: 800, color: var(--text), letter-spacing: -0.02em
   - If product has Hindi/regional name: show above English name in 1.2rem
   - Category badge: gradient background (accent → accent-light), uppercase, 0.68rem, border-radius: 50px, padding: 5px 16px, font-weight: 600
   - Tagline: italic, var(--text-secondary), 1rem
   - 2-sentence elevator pitch below tagline
   - Product image: max-width: 220px, max-height: 220px, object-fit: contain
   - Image container: position relative, with a gradient glow pseudo-element behind it (absolute, blur 40px, accent color at 35% opacity, border-radius: 50%)
   - Floating animation on image: translateY(-5px) to translateY(5px), 3.5s ease-in-out infinite
   - DECORATIVE: a large blurred gradient orb (200px×200px, accent at 12% opacity, blur 80px) positioned behind and slightly below the image
   - Layout: flex column, centered, text-align: center, padding: 56px 24px 40px

2. KEY HIGHLIGHTS STRIP
   - Centered flex row, 4–5 chips, gap: 12px, flex-wrap: wrap
   - Each chip uses .glass-card styles + padding: 14px 20px
   - Content: emoji (1.3rem) + bold label (0.82rem, --text) + subtitle (0.7rem, --text-secondary) below
   - Staggered IntersectionObserver fade-in, 80ms delay per chip
   - Generate contextually relevant chips — e.g. for perfume: "💎 Luxury Collection — Exquisite Craftsmanship", "🌊 Ocean Fresh — Aquatic Top Notes", "⏳ Long-lasting — 8+ Hour Performance", "🎁 Gift Ready — Premium Packaging"

3. PRODUCT STORY BLOCK (content-heavy)
   - Section label: "— PRODUCT STORY —" centered, accent color, uppercase, 0.72rem, letter-spacing: 0.12em
   - Pull-quote: .gradient-text, clamp(1.4rem, 3vw, 2rem), font-weight: 700, font-style: italic, text-align: center, margin-bottom: 24px
   - Write 3–4 FULL paragraphs (each 4–6 sentences) covering:
     P1: Product introduction — what it is, its heritage, its brand's philosophy, why it exists
     P2: Craftsmanship — how it's made, ingredients/materials, quality process, what makes it premium
     P3: Experience — sensory description (how it feels/tastes/smells/looks in use), the emotional benefit
     P4: Positioning — who it's for, when to use it, the lifestyle it represents
   - Between paragraphs: gradient divider line
   - Mid-section callout box: .glass-card with border-left: 3px solid var(--accent), padding: 18px 24px
     Contains a highlighted stat/claim in bold 1.1rem (e.g. "Lasts 8+ hours" or "100% Natural Ingredients")
   - Text: 0.92rem, line-height: 1.8, --text-secondary, max-width: 640px, margin: 0 auto

4. FEATURES & BENEFITS GRID (6 cards, content-heavy)
   - Section label: "— FEATURES & BENEFITS —"
   - grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)), gap: 16px
   - Each card: .glass-card + padding: 22px
   - Card content: emoji (1.5rem), bold title (0.94rem, --text, font-weight: 600), 2–3 sentence description (0.84rem, --text-secondary, line-height: 1.6)
   - Generate 6 deeply relevant feature cards based on the product type — each description must be 2–3 sentences, NOT one-liners
   - Staggered scroll reveal: 100ms × index delay
   - DECORATIVE: a subtle gradient orb (150px, accent at 8% opacity, blur 60px) floating behind the grid

5. HOW TO USE / SERVING SUGGESTIONS
   - Section label: "— HOW TO ENJOY —" or "— WAYS TO USE —"
   - Container: .glass-card, padding: 32px 28px
   - 5 numbered items, each with:
     Number badge: 28px circle, background: linear-gradient(135deg, var(--accent), var(--accent-light)), color: white, font-weight: 700, font-size: 0.8rem
     Bold title (0.92rem) + 2-sentence description (0.84rem, --text-secondary)
   - Layout: each item flex row, gap: 16px, margin-bottom: 18px
   - Scroll animation: slideInLeft with 120ms stagger

6. SPECIFICATIONS TABLE (10+ rows)
   - Section label: "— SPECIFICATIONS —"
   - Container: .glass-card, overflow: hidden, padding: 0
   - Rows: padding: 13px 20px, display: flex, justify-content: space-between
   - Alternating: odd rows get slightly different rgba background
   - Property: font-weight: 600, 0.8rem, uppercase, letter-spacing: 0.05em, .gradient-text (accent colored)
   - Value: 0.84rem, --text-secondary, text-align: right
   - Left border: 3px solid var(--accent) on every row
   - Generate 10–12 rows with specs inferred from product type

7. BRAND TRUST FOOTER
   - Section: flex row, centered, gap: 28px, flex-wrap: wrap, padding: 32px 20px
   - Container: .glass-card, padding: 28px
   - 4 trust signals, each: flex column, align-items: center
     Emoji (1.5rem) with pulseGlow animation (scale 1→1.06→1, 2s infinite)
     Bold label (0.78rem, --text, uppercase, letter-spacing: 0.06em)
     Subtitle (0.68rem, --text-secondary)
   - Generate relevant trust signals (e.g. for perfume: "🧪 Dermatologist Tested", "🇮🇹 Made in Italy", "🚫 No Animal Testing", "✨ Premium Grade")

████████████████████████████████████████████
██  CSS RULES                             ██
████████████████████████████████████████████
- All colors as CSS custom properties in :root
- Also define --accent-rgb as comma-separated RGB values for use in rgba() functions
- @keyframes: float, fadeInUp, slideInLeft, ambientShift, pulseGlow, shimmer
- Font: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif
- Responsive: auto-fit/minmax grids, @media (max-width: 768px) stacks everything
- html { scroll-behavior: smooth }
- NO vh/vw units except inside clamp()
- Sections: max-width: 840px, margin: 0 auto, padding: 0 24px, margin-bottom: 48px
- html, body: margin: 0, height: auto, overflow-x: hidden
- NO CTA buttons, NO "Add to Cart", NO "Buy Now", NO pricing buttons, NO sticky navs, NO modals, NO testimonials

████████████████████████████████████████████
██  JS RULES                              ██
████████████████████████████████████████████
- IntersectionObserver (threshold: 0.12): adds 'visible' class
- DOMContentLoaded: stagger .catalogue-section visibility, 150ms × index
- Parallax on header image: scroll × 0.06, capped ±30px, via requestAnimationFrame
- Optional: mouse-move parallax on decorative orbs (subtle, orb translates ±10px based on cursor position)

████████████████████████████████████████████
██  IMAGE RULES                           ██
████████████████████████████████████████████
- ONLY use exact URLs provided — never invent
- All <img>: loading="lazy", object-fit: contain, border-radius: 12px
- Max 220px in any dimension
- Glow shadow: box-shadow: 0 0 50px var(--glow-strong), 0 16px 32px rgba(0,0,0,0.25)
- Alt text from product name

████████████████████████████████████████████
██  QUALITY CHECKLIST — VERIFY BEFORE OUTPUT
████████████████████████████████████████████
✅ body background is a multi-stop GRADIENT, not flat color
✅ body::before has ambient radial gradient orbs
✅ At least 2 decorative blurred gradient orbs on the page
✅ ALL cards use glassmorphism (backdrop-filter + glass border + layered shadow)
✅ All section titles use .gradient-text (accent gradient on text)
✅ Product image has a glowing halo behind it
✅ Category badge has gradient background
✅ Number badges have gradient background
✅ Table has accent left-border on every row
✅ Hover states have glow box-shadows
✅ Page bg color matches brand/product — NOT generic navy, NOT generic black
✅ Story section has 3–4 full paragraphs (each 4+ sentences)
✅ Feature cards have 2–3 sentence descriptions each
✅ Specs table has 10+ rows
✅ The page looks premium, layered, and editorial — NOT like a basic dark template

Return ONLY the HTML. Start with <!DOCTYPE html>. No markdown, no fences, no explanation.`;


  const response = await createAICompletion(client, {
    model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 16000,
    temperature: 0.7,
  }, 'Product catalogue generation');

  let html = aiContentToText(response.choices?.[0]?.message).trim();
  if (!html) throw new Error('Failed to generate AI catalogue content');
  html = html.replace(/^```html\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
  return html;
};

// Generate the complete listing payload from multiple images, including the
// reviewable HTML description, CRO controls, and SEO metadata.
const processMultipleImages = async (imagesBase64Array, _imageUrls = [], additionalContext = '', options = {}) => {
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
  const imageAnalysis = await analyzeMultipleImages(imagesBase64Array, { onProgress });
  onProgress({ progress: 72, stage: 'drafting', message: 'Drafting description, CRO and SEO fields' });
  const productContent = normalizeGeneratedProductContent(await generateProductContent(imageAnalysis, additionalContext));
  onProgress({ progress: 94, stage: 'finalising', message: 'Running final listing checks' });

  return {
    imageAnalysis,
    productContent,
    combined: {
      ...productContent,
      aiGenerated: true,
      aiConfidenceScore: imageAnalysis.confidenceScore || 75,
      aiRawData: { imageAnalysis, productContent },
    },
  };
};

const generateSEOContent = async (title, description, category) => {
  const client = await getAIClient();
  const model = await getAIModel();
  const safeTitle = String(title || '').slice(0, 200);
  const safeCategory = String(category || 'product').slice(0, 80);
  const safeDescription = String(description || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
  const request = (retry = false) => createAICompletion(client, {
    model,
    messages: [
      { role: 'system', content: 'You generate e-commerce SEO metadata. Return exactly one valid JSON object, with no markdown, prose, scripts, or comments.' },
      {
        role: 'user',
        content: `${retry ? 'RETRY: The previous response was not valid JSON. Return the compact object now.\n' : ''}Generate SEO optimization for this ${safeCategory}:
<title>${safeTitle}</title>
<description>${safeDescription}</description>

Return only this JSON shape:
{"metaTitle":"optimized meta title","metaDescription":"optimized meta description","keywords":["keyword1","keyword2","keyword3"],"altText":"image alt text","slug":"url-slug","seoScore":number,"suggestions":["suggestion"]}`,
      },
    ],
    response_format: { type: 'json_object' },
    max_tokens: retry ? 1200 : 1000,
    temperature: retry ? 0.1 : 0.25,
  }, retry ? 'Product SEO generation retry' : 'Product SEO generation');

  let response = await request();
  try {
    return parseAIJson(response, 'Failed to parse AI-generated SEO content');
  } catch (parseError) {
    console.warn('[ai] Item SEO response was not valid JSON; retrying compact response');
    response = await request(true);
    return parseAIJson(response, parseError.message);
  }
};

const processProductImage = async (imageUrl, imageBase64 = null) => {
  const imageAnalysis = await analyzeProductImage(imageUrl, imageBase64);
  const productContent = await generateProductContent(imageAnalysis);

  return {
    imageAnalysis,
    productContent: normalizeGeneratedProductContent(productContent),
    combined: {
      ...normalizeGeneratedProductContent(productContent),
      aiGenerated: true,
      aiConfidenceScore: imageAnalysis.confidenceScore || 75,
      aiRawData: { imageAnalysis, productContent },
    }
  };
};

const generateBlogPost = async (topic) => {
  const client = await getAIClient();
  const model = await getAIModel();

  const response = await createAICompletion(client, {
    model,
    messages: [
      {
        role: 'system',
        content: 'You are an expert blog writer and SEO specialist. You write engaging, well-structured, and SEO-optimized blog posts. Always return valid JSON only.',
      },
      {
        role: 'user',
        content: `Write a complete, publish-ready blog post on the topic: "${topic}"

Return a JSON object with this exact structure:
{
  "title": "Compelling, SEO-friendly blog title (50-70 characters)",
  "content": "Full HTML blog post content (1000-1500 words). Use proper HTML tags: <h2>, <h3> for subheadings, <p> for paragraphs, <ul>/<ol> for lists, <strong>/<em> for emphasis, <blockquote> for quotes. Make it engaging, informative, and well-structured with multiple sections.",
  "excerpt": "A compelling summary of the post in 1-2 sentences (under 160 characters)",
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "seo": {
    "metaTitle": "SEO meta title (50-60 characters)",
    "metaDescription": "SEO meta description (140-160 characters)",
    "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"]
  },
  "isFeatured": false,
  "allowComments": true
}

Return ONLY the JSON, no extra text or markdown fences.`,
      },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 4000,
    temperature: 0.7,
  }, 'Blog generation');

  return parseAIJson(response.choices?.[0]?.message, 'Failed to parse AI-generated blog content');
};

module.exports = { analyzeProductImage, analyzeMultipleImages, generateProductContent, buildFallbackProductContent, generateProductCatalogueHTML, generateSEOContent, processProductImage, processMultipleImages, getAIClient, getAIConfig: getAIConfigForService, getAIModel, generateBlogPost, parseAIJson, createAICompletion };
