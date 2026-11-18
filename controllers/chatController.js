const asyncHandler = require('express-async-handler');
const Conversation = require('../models/Conversation');
const Settings = require('../models/Settings');
const Product = require('../models/Product');
const { addApprovedProductFilter } = require('../services/productApprovalService');
const Order = require('../models/Order');
const LegalPage = require('../models/LegalPage');
const { getAIClient, getAIModel, createAICompletion } = require('../services/aiService');
const { startAIUsage } = require('../services/aiUsageService');
const { AI_CREDIT_COSTS, roundCredits } = require('../config/aiCreditCosts');
const { getChatbotConfig, matchFaq, escapeRegExp } = require('../services/chatbotConfigService');

const CREDIT_COST = AI_CREDIT_COSTS.customerChatStart;
const MESSAGE_CREDIT_COST = AI_CREDIT_COSTS.customerChatMessage;
const MAX_TOOL_ITERATIONS = 5;
const LEGACY_CATEGORIES = ['shop_assistant', 'order_query', 'payment_query'];
const isChatTestMode = () => process.env.NODE_ENV !== 'production' && process.env.CHAT_TEST_MODE === 'true';

// Sliding-window per-user rate limiter (single-process). Rejects bursty
// clients before any AI spend happens.
const rateLimitStore = new Map();
const STORE_INFO_CACHE_TTL_MS = 30 * 1000;
const storeInfoCache = new Map();
const debitAICredits = async (amount) => {
  const updated = await Settings.findOneAndUpdate(
    { key: 'ai_credits', value: { $gte: Number(amount) } },
    { $inc: { value: -Number(amount) } },
    { new: true },
  );
  return updated ? roundCredits(Number(updated.value) || 0) : null;
};
const checkChatRateLimit = (userId, limitPerMin) => {
  const now = Date.now();
  const windowStart = now - 60 * 1000;
  const key = String(userId);
  const hits = (rateLimitStore.get(key) || []).filter((t) => t > windowStart);
  if (hits.length >= limitPerMin) {
    rateLimitStore.set(key, hits);
    return false;
  }
  hits.push(now);
  rateLimitStore.set(key, hits);
  return true;
};

const withAiTimeout = (promise, ms) => {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error('AI provider timed out. Please try again.');
      err.statusCode = 503;
      err.publicCode = 'AI_PROVIDER_TIMEOUT';
      reject(err);
    }, ms);
    if (timer.unref) timer.unref();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

// ─── System Prompts ────────────────────────────────────────────

const LEGACY_ADDITIONS = {
  shop_assistant: `\n\nHelp users find products, answer questions about the store (shipping, returns, policies), and recommend items based on their needs. Use search_products to find matching products. When presenting products, mention each product by name and price in your text — the system will automatically display rich product cards with images and add-to-cart buttons, so do NOT include image URLs or links in your text. Use get_store_info for policy questions.`,
  order_query: `\n\nHelp users track and understand their orders. Use get_user_orders to list recent orders, get_order_details for specifics, and get_order_tracking for shipping status. Always reference real order numbers and statuses from the data.`,
  payment_query: `\n\nHelp users understand their payment statuses. Use get_payment_status and get_user_payments to look up transaction details. For any refund requests, use escalate_to_admin.`,
  general: `\n\nAnswer general store questions. Use get_store_info for policy, shipping, return, or contact questions. For anything you cannot do, use escalate_to_admin.`,
};

const buildSystemPrompt = (category, config) => {
  // siteName is loaded alongside the cached chatbot config. Avoiding a
  // settings round-trip for every message keeps the AI call as the only
  // network-bound part of a normal answer.
  const siteName = config?.siteName || 'Our Store';
  const base = (config && config.systemBase
    ? config.systemBase
    : `You are a helpful customer support assistant for ${siteName}. Be concise, friendly, and professional. Use the provided tools to look up real data — never make up order numbers, prices, or statuses. If the user asks for something you cannot do (cancel, refund, modify an order, change address, etc.), use the escalate_to_admin tool and explain to the user that their request has been forwarded to the team.`);

  const cat = config && Array.isArray(config.categories)
    ? config.categories.find((c) => c.key === category)
    : null;
  const addition = (cat && cat.prompt) || LEGACY_ADDITIONS[category] || '';

  // Inject admin FAQs so the model answers them consistently. Capped so the
  // prompt stays small and fast.
  let faqBlock = '';
  const faqs = config && Array.isArray(config.faqs)
    ? config.faqs.filter((f) => f && f.enabled !== false && f.question && f.answer).slice(0, 10)
    : [];
  if (faqs.length) {
    faqBlock = '\n\nStore FAQs (answer these directly when asked):\n' + faqs
      .map((f) => `Q: ${String(f.question).slice(0, 150)}\nA: ${String(f.answer).slice(0, 300)}`)
      .join('\n');
  }

  return base + addition + faqBlock;
};

// ─── Tool Definitions ──────────────────────────────────────────

const SHOP_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_products',
      description: 'Search for products by keyword, category, or price range',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search keyword' },
          category: { type: 'string', description: 'Category name to filter by' },
          minPrice: { type: 'number', description: 'Minimum price' },
          maxPrice: { type: 'number', description: 'Maximum price' },
          limit: { type: 'number', description: 'Max results (default 5)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_product_details',
      description: 'Get full details of a specific product by its slug',
      parameters: {
        type: 'object',
        properties: { slug: { type: 'string', description: 'Product slug' } },
        required: ['slug'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_store_info',
      description: 'Get store information like shipping policy, return policy, contact info',
      parameters: {
        type: 'object',
        properties: {
          topic: { type: 'string', enum: ['shipping', 'returns', 'contact', 'general'], description: 'Info topic' },
        },
        required: ['topic'],
      },
    },
  },
];

const ORDER_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_user_orders',
      description: 'Get the current user\'s recent orders',
      parameters: {
        type: 'object',
        properties: { limit: { type: 'number', description: 'Max orders to return (default 5)' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_order_details',
      description: 'Get full details of a specific order by order number',
      parameters: {
        type: 'object',
        properties: { orderNumber: { type: 'string', description: 'Order number (e.g. ORD-12345)' } },
        required: ['orderNumber'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_order_tracking',
      description: 'Get shipping tracking info for an order',
      parameters: {
        type: 'object',
        properties: { orderNumber: { type: 'string', description: 'Order number' } },
        required: ['orderNumber'],
      },
    },
  },
];

const PAYMENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_payment_status',
      description: 'Get payment details for a specific order',
      parameters: {
        type: 'object',
        properties: { orderNumber: { type: 'string', description: 'Order number' } },
        required: ['orderNumber'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_user_payments',
      description: 'Get the user\'s recent payment transactions',
      parameters: {
        type: 'object',
        properties: { limit: { type: 'number', description: 'Max results (default 5)' } },
      },
    },
  },
];

const ESCALATE_TOOL = {
  type: 'function',
  function: {
    name: 'escalate_to_admin',
    description: 'Escalate the conversation to a human admin. Use when the user needs an action you cannot perform (cancellation, refund, order modification, etc.)',
    parameters: {
      type: 'object',
      properties: { reason: { type: 'string', description: 'Brief reason for escalation' } },
      required: ['reason'],
    },
  },
};

const GENERAL_TOOLS = [
  SHOP_TOOLS[2], // get_store_info only
  ESCALATE_TOOL,
];

const TOOLS_BY_CATEGORY = {
  shop_assistant: [...SHOP_TOOLS, ESCALATE_TOOL],
  order_query: [...ORDER_TOOLS, ESCALATE_TOOL],
  payment_query: [...PAYMENT_TOOLS, ESCALATE_TOOL],
  general: [...GENERAL_TOOLS],
};

// Admin-defined categories carry a toolset; unknown keys fall back safely.
const resolveToolsForCategory = (category, config) => {
  const cat = config && Array.isArray(config.categories)
    ? config.categories.find((c) => c.key === category)
    : null;
  const toolset = (cat && cat.toolset) || (TOOLS_BY_CATEGORY[category] ? category : 'general');
  return TOOLS_BY_CATEGORY[toolset] || TOOLS_BY_CATEGORY.general;
};

// ─── Tool Implementations ──────────────────────────────────────

const toolHandlers = {
  search_products: async (args, _userId, tenantId, config) => {
    const filter = { isActive: true, ...(tenantId ? { tenant: tenantId } : {}) };
    addApprovedProductFilter(filter);
    if (args.minPrice || args.maxPrice) {
      filter.price = {};
      if (args.minPrice) filter.price.$gte = args.minPrice;
      if (args.maxPrice) filter.price.$lte = args.maxPrice;
    }
    const safeQuery = escapeRegExp(String(args.query || '').slice(0, 100));
    const queryRe = safeQuery ? new RegExp(safeQuery, 'i') : null;
    const maxResults = Math.min(Number(args.limit) || 5, (config && config.productsLimit) || 5, 10);
    const products = await Product.find(filter)
      .or(queryRe ? [
        { title: queryRe },
        { tags: queryRe },
      ] : [])
      .select('_id title price comparePrice discount slug thumbnail images variants stock sku')
      .limit(maxResults)
      .lean();
    return products.map(p => ({
      _id: String(p._id),
      title: p.title,
      price: p.price,
      discount: p.discount,
      comparePrice: p.comparePrice,
      finalPrice: p.price,
      slug: p.slug,
      thumbnail: p.thumbnail,
      images: p.images,
      variants: p.variants,
      stock: p.stock,
      sku: p.sku,
    }));
  },

  get_product_details: async (args, _userId, tenantId) => {
    const productFilter = {
      slug: args.slug,
      isActive: true,
      ...(tenantId ? { tenant: tenantId } : {}),
    };
    addApprovedProductFilter(productFilter);
    const p = await Product.findOne(productFilter)
      .select('_id title slug sku price comparePrice discount description stock images thumbnail variants attributes tags')
      .lean();
    if (!p) return { error: 'Product not found' };
    return {
      _id: String(p._id),
      title: p.title,
      slug: p.slug,
      sku: p.sku,
      price: p.price,
      discount: p.discount,
      comparePrice: p.comparePrice,
      finalPrice: p.price,
      description: p.description?.substring(0, 500),
      inStock: p.stock > 0,
      stock: p.stock,
      images: p.images,
      thumbnail: p.thumbnail,
      variants: p.variants,
      attributes: p.attributes,
      tags: p.tags,
    };
  },

  get_store_info: async (args, _userId, tenantId) => {
    const topic = ['shipping', 'returns', 'contact', 'general'].includes(args?.topic) ? args.topic : 'general';
    const cacheKey = `${String(tenantId || 'global')}:${topic}`;
    const cached = storeInfoCache.get(cacheKey);
    if (cached?.promise) return cached.promise;
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const promise = (async () => {
      if (topic === 'contact') {
        const [contact, siteName] = await Promise.all([
          Settings.get('site_contact', {}),
          Settings.get('site_name', 'Our Store'),
        ]);
        return { siteName, ...contact };
      }
      if (topic === 'shipping') {
        const [cost, freeThreshold, currency] = await Promise.all([
          Settings.get('standard_shipping_cost', 49),
          Settings.get('free_shipping_threshold', 999),
          Settings.get('currency_symbol', '₹'),
        ]);
        return { shippingCost: `${currency}${cost}`, freeShippingAbove: `${currency}${freeThreshold}` };
      }
      if (topic === 'returns') {
        const page = await LegalPage.findOne({ slug: 'return-policy' }).select('content').lean();
        return { policy: page?.content?.substring(0, 1000) || 'Return policy not available. Please contact support.' };
      }
      const [siteName, tagline] = await Promise.all([
        Settings.get('site_name', 'Our Store'),
        Settings.get('site_tagline', ''),
      ]);
      return { siteName, tagline };
    })().then(value => {
      storeInfoCache.set(cacheKey, { value, expiresAt: Date.now() + STORE_INFO_CACHE_TTL_MS });
      return value;
    }).catch(error => {
      storeInfoCache.delete(cacheKey);
      throw error;
    });
    storeInfoCache.set(cacheKey, { promise });
    return promise;
  },

  get_user_orders: async (args, userId, tenantId) => {
    const orders = await Order.find({ user: userId, ...(tenantId ? { tenant: tenantId } : {}) })
      .select('orderNumber orderStatus paymentStatus total items createdAt')
      .sort({ createdAt: -1 })
      .limit(args.limit || 5)
      .lean();
    return orders.map(o => ({
      orderNumber: o.orderNumber,
      status: o.orderStatus,
      paymentStatus: o.paymentStatus,
      total: o.total,
      itemCount: o.items?.length || 0,
      date: o.createdAt,
    }));
  },

  get_order_details: async (args, userId, tenantId) => {
    const o = await Order.findOne({ orderNumber: args.orderNumber, user: userId, ...(tenantId ? { tenant: tenantId } : {}) })
      .select('orderNumber orderStatus paymentStatus paymentMethod items shippingAddress total subtotal shippingCost tax discount statusHistory createdAt estimatedDelivery')
      .lean();
    if (!o) return { error: 'Order not found' };
    return {
      orderNumber: o.orderNumber,
      status: o.orderStatus,
      paymentStatus: o.paymentStatus,
      paymentMethod: o.paymentMethod,
      items: o.items?.map(i => ({ title: i.title, price: i.price, quantity: i.quantity })),
      shippingAddress: o.shippingAddress,
      subtotal: o.subtotal,
      shippingCost: o.shippingCost,
      tax: o.tax,
      discount: o.discount,
      total: o.total,
      date: o.createdAt,
      estimatedDelivery: o.estimatedDelivery,
      statusHistory: o.statusHistory?.slice(-5),
    };
  },

  get_order_tracking: async (args, userId, tenantId) => {
    const o = await Order.findOne({ orderNumber: args.orderNumber, user: userId, ...(tenantId ? { tenant: tenantId } : {}) })
      .select('orderNumber orderStatus awbCode courierName shiprocketStatus trackingNumber estimatedDelivery')
      .lean();
    if (!o) return { error: 'Order not found' };
    return {
      orderNumber: o.orderNumber,
      status: o.orderStatus,
      awbCode: o.awbCode || null,
      courier: o.courierName || null,
      shiprocketStatus: o.shiprocketStatus || null,
      trackingNumber: o.trackingNumber || null,
      estimatedDelivery: o.estimatedDelivery || null,
    };
  },

  get_payment_status: async (args, userId, tenantId) => {
    const o = await Order.findOne({ orderNumber: args.orderNumber, user: userId, ...(tenantId ? { tenant: tenantId } : {}) })
      .select('orderNumber paymentMethod paymentStatus paymentId total createdAt')
      .lean();
    if (!o) return { error: 'Order not found' };
    return {
      orderNumber: o.orderNumber,
      paymentMethod: o.paymentMethod,
      paymentStatus: o.paymentStatus,
      transactionId: o.paymentId || null,
      amount: o.total,
      date: o.createdAt,
    };
  },

  get_user_payments: async (args, userId, tenantId) => {
    const orders = await Order.find({ user: userId, ...(tenantId ? { tenant: tenantId } : {}) })
      .select('orderNumber paymentMethod paymentStatus paymentId total createdAt')
      .sort({ createdAt: -1 })
      .limit(args.limit || 5)
      .lean();
    return orders.map(o => ({
      orderNumber: o.orderNumber,
      paymentMethod: o.paymentMethod,
      paymentStatus: o.paymentStatus,
      transactionId: o.paymentId || null,
      amount: o.total,
      date: o.createdAt,
    }));
  },
};

const FAST_STORE_INTENTS = [
  { topic: 'returns', pattern: /\b(return(?:s)? policy|return window|exchange policy|can i (?:return|exchange)|how (?:do|can) i (?:return|exchange))\b/i },
  { topic: 'shipping', pattern: /\b(ship|shipping|delivery|deliver|arrive|dispatch)\b/i },
  { topic: 'contact', pattern: /\b(contact|phone|email|address|reach)\b/i },
];

const stripMarkup = value => String(value || '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&nbsp;/gi, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const extractPrice = (text, pattern) => {
  const match = String(text || '').match(pattern);
  return match ? Number(String(match[1]).replace(/,/g, '')) : undefined;
};

const extractProductQuery = text => String(text || '')
  .replace(/\b(please|can you|could you|would you|help me|i am|i'm|im|i need|i want|looking for|find|search for|search|show me|show|do you have|recommend|suggest|buy|get)\b/gi, ' ')
  .replace(/\b(under|below|less than|up to|upto|within|over|above|more than)\s*(?:rs\.?|inr|₹|\$)?\s*[\d,]+/gi, ' ')
  .replace(/[?!.,]+$/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 100);

// Common deterministic intents avoid an unnecessary model -> tool -> model
// round-trip. The data still comes from the same tenant-scoped tools, so this
// fast path cannot invent prices, stock, orders, or policies.
const getFastChatReply = async (category, text, userId, tenantId, config) => {
  const normalized = String(text || '').trim();
  const lower = normalized.toLowerCase();

  if (['shop_assistant', 'general'].includes(category)) {
    const storeIntent = FAST_STORE_INTENTS.find(intent => intent.pattern.test(normalized));
    if (storeIntent && !(/\b(order|track|tracking|payment|transaction)\b/i.test(normalized) && category !== 'general')) {
      const info = await toolHandlers.get_store_info({ topic: storeIntent.topic }, userId, tenantId, config);
      if (storeIntent.topic === 'shipping') {
        return `Shipping is ${info.shippingCost}. Orders above ${info.freeShippingAbove} qualify for free shipping.`;
      }
      if (storeIntent.topic === 'returns') {
        return `Our return policy: ${stripMarkup(info.policy).slice(0, 900)}`;
      }
      const contactDetails = [info.email, info.phone, info.address].filter(Boolean).join(' · ');
      return contactDetails
        ? `You can contact ${info.siteName || 'our store'} at ${contactDetails}.`
        : `Please contact ${info.siteName || 'our support team'} through the support page.`;
    }
  }

  const supportRequest = /\b(refund|return|exchange|order|track|tracking|payment|shipping|delivery|contact)\b/i.test(normalized);
  if (category === 'shop_assistant' && !supportRequest && /\b(find|search|show|looking|recommend|suggest|have|buy|need|want)\b/i.test(normalized)) {
    const query = extractProductQuery(normalized);
    if (query.length >= 3) {
      const products = await toolHandlers.search_products({
        query,
        minPrice: extractPrice(normalized, /\b(?:over|above|more than)\s*(?:rs\.?|inr|₹|\$)?\s*([\d,]+)/i),
        maxPrice: extractPrice(normalized, /\b(?:under|below|less than|up to|upto|within)\s*(?:rs\.?|inr|₹|\$)?\s*([\d,]+)/i),
        limit: config?.productsLimit || 5,
      }, userId, tenantId, config);
      return {
        reply: products.length
          ? `I found ${products.length} matching product${products.length === 1 ? '' : 's'} for you.`
          : `I couldn't find a matching product for “${query}”. Try a different keyword or budget.`,
        products,
      };
    }
  }

  if (category === 'order_query' && /\b(order|track|tracking|delivery|shipped|status)\b/i.test(normalized)) {
    const orderNumber = normalized.match(/\b[A-Z]{2,}(?:-[A-Z0-9]+)+\b/i)?.[0];
    const orders = orderNumber
      ? [await toolHandlers.get_order_details({ orderNumber }, userId, tenantId)]
      : await toolHandlers.get_user_orders({ limit: 3 }, userId, tenantId);
    const validOrders = orders.filter(order => order && !order.error);
    if (!validOrders.length) return 'I couldn’t find an order for your account. Please check the order number and try again.';
    const latest = validOrders[0];
    return orderNumber
      ? `Order ${latest.orderNumber} is currently ${latest.status || 'being processed'}${latest.paymentStatus ? ` and payment is ${latest.paymentStatus}.` : '.'}`
      : `Your latest order is ${latest.orderNumber}, currently ${latest.status || 'being processed'}.`;
  }

  if (category === 'payment_query' && !/\b(refund|chargeback|cancel)\b/i.test(lower) && /\b(payment|paid|transaction|charge|failed)\b/i.test(lower)) {
    const payments = await toolHandlers.get_user_payments({ limit: 3 }, userId, tenantId);
    if (!payments.length) return 'I couldn’t find any payment records for your account.';
    const latest = payments[0];
    return `Your latest payment for ${latest.orderNumber} is ${latest.paymentStatus || 'being processed'}${latest.amount != null ? ` for ₹${latest.amount}.` : '.'}`;
  }

  return null;
};

// ─── Function Calling Loop ─────────────────────────────────────

const runFunctionCallingLoop = async (client, model, messages, tools, userId, tenantId, conversation, config) => {
  let iterations = 0;
  let escalated = false;
  let escalationReason = '';
  const collectedProducts = [];
  const tokenUsage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  const aiTimeoutMs = (config && config.aiTimeoutMs) || 25000;
  const maxOutputTokens = (config && config.maxOutputTokens) || 600;

  while (iterations < MAX_TOOL_ITERATIONS) {
    iterations++;

    // createAICompletion retries one transient failure; the race caps total wait.
    const response = await withAiTimeout(createAICompletion(client, {
      model,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      parallel_tool_calls: true,
      max_output_tokens: maxOutputTokens,
    }, 'Customer chat'), aiTimeoutMs);
    tokenUsage.prompt_tokens += Number(response.usage?.prompt_tokens || 0);
    tokenUsage.completion_tokens += Number(response.usage?.completion_tokens || 0);
    tokenUsage.total_tokens += Number(response.usage?.total_tokens || 0);

    const choice = response.choices[0];

    if (choice.finish_reason === 'tool_calls' || choice.message.tool_calls?.length) {
      // Add assistant message with tool calls
      messages.push(choice.message);

      const executeToolCall = async (toolCall) => {
        const fnName = toolCall.function.name;
        let fnArgs;
        try {
          fnArgs = JSON.parse(toolCall.function.arguments || '{}');
        } catch {
          return { toolCall, result: { error: `Invalid arguments for ${fnName}` } };
        }

        let result;
        if (fnName === 'escalate_to_admin') {
          escalated = true;
          escalationReason = fnArgs.reason || 'User request requires admin attention';
          conversation.status = 'escalated';
          conversation.escalation = {
            reason: escalationReason,
            createdAt: new Date(),
          };
          result = { success: true, message: 'Escalated to admin team. They will review and respond.' };
        } else if (toolHandlers[fnName]) {
          try {
            result = await toolHandlers[fnName](fnArgs, userId, tenantId, config);
            // Collect products from search/detail tools
            if (fnName === 'search_products' && Array.isArray(result)) {
              collectedProducts.push(...result);
            } else if (fnName === 'get_product_details' && result && result.title) {
              collectedProducts.push(result);
            }
          } catch (err) {
            result = { error: `Failed to execute ${fnName}: ${err.message}` };
          }
        } else {
          result = { error: `Unknown function: ${fnName}` };
        }

        return { toolCall, result };
      };

      // Independent lookups (for example, multiple order/payment tools) run
      // together. The tool-result messages are appended in provider order so
      // the conversation format remains deterministic.
      const toolResults = await Promise.all(choice.message.tool_calls.map(executeToolCall));
      for (const { toolCall, result } of toolResults) {
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }
      continue;
    }

    // Text response — we're done
    // Deduplicate collected products by slug
    const seen = new Set();
    const products = collectedProducts.filter(p => {
      if (!p.slug || seen.has(p.slug)) return false;
      seen.add(p.slug);
      return true;
    });
    return { reply: choice.message.content, escalated, escalationReason, products, usage: tokenUsage };
  }

  return { reply: 'I apologize, but I had trouble processing your request. Could you please try rephrasing?', escalated, escalationReason, products: [], usage: tokenUsage };
};

// ─── Controllers ───────────────────────────────────────────────

// @desc    Start a new chat conversation
// @route   POST /api/chat/start
const startConversation = asyncHandler(async (req, res) => {
  const config = await getChatbotConfig();
  if (config.enabled === false) {
    res.status(403);
    throw new Error('Chat assistant is currently disabled.');
  }
  const { category } = req.body;
  const catConfig = (config.categories || []).find((c) => c.key === category && c.enabled !== false);
  if (!category || !catConfig) {
    res.status(400);
    throw new Error('Invalid category. Please choose an available chat category.');
  }
  if (!checkChatRateLimit(req.user._id, config.rateLimitPerMin || 20)) {
    res.status(429);
    throw new Error('You are sending messages too quickly. Please wait a moment and try again.');
  }

  if (isChatTestMode()) {
    const greeting = 'Hello! This is the isolated customer-chat test assistant.';
    const conversation = await Conversation.create({
      tenant: req.tenant._id,
      user: req.user._id,
      category,
      messages: [{ role: 'assistant', content: greeting }],
    });
    return res.status(201).json({
      success: true,
      conversationId: conversation._id,
      greeting,
    });
  }

  // Admin-configured greetings answer instantly with zero AI cost.
  const staticGreeting = (catConfig.greeting || '').trim();
  if (staticGreeting) {
    const conversation = await Conversation.create({
      tenant: req.tenant._id,
      user: req.user._id,
      category,
      messages: [{ role: 'assistant', content: staticGreeting }],
      creditsCost: 0,
    });
    return res.status(201).json({
      success: true,
      conversationId: conversation._id,
      greeting: staticGreeting,
      source: 'static',
    });
  }

  // No static greeting — fall back to one AI-generated greeting (charged).
  const model = await getAIModel();
  const usage = startAIUsage(req, { feature: 'chat', action: 'start_customer_chat', credits: CREDIT_COST, model, metadata: { category } });
  const remainingCredits = await debitAICredits(CREDIT_COST);
  if (remainingCredits === null) {
    res.status(402);
    await usage.finish({ status: 'rejected', error: `Insufficient AI credits. Need ${CREDIT_COST}` });
    throw new Error('Insufficient AI credits. Please try again later.');
  }

  usage.charge(CREDIT_COST);

  try {
    const systemPrompt = buildSystemPrompt(category, config);
    const client = await getAIClient();

    const greetingResponse = await withAiTimeout(createAICompletion(client, {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Hello, I need help.' },
      ],
      max_output_tokens: 180,
    }, 'Customer chat greeting'), config.aiTimeoutMs || 25000);

    const greeting = greetingResponse.choices[0].message.content;
    void usage.finish({ usage: greetingResponse.usage }).catch(() => {});

    const conversation = await Conversation.create({
      tenant: req.tenant._id,
      user: req.user._id,
      category,
      messages: [
        { role: 'assistant', content: greeting },
      ],
    });

    // Dispatch credit update event
    res.status(201).json({
      success: true,
      conversationId: conversation._id,
      greeting,
      source: 'ai',
      aiCredits: remainingCredits,
    });
  } catch (err) {
    // Refund credits on failure
    const current = await Settings.get('ai_credits', 0);
    await Settings.set('ai_credits', roundCredits(current + CREDIT_COST), 'ai');
    usage.refund(CREDIT_COST);
    await usage.finish({ status: 'failed', error: err.message });
    throw err;
  }
});

// @desc    Send a message in a conversation
// @route   POST /api/chat/:id/message
const sendMessage = asyncHandler(async (req, res) => {
  const config = await getChatbotConfig();
  if (config.enabled === false) {
    res.status(403);
    throw new Error('Chat assistant is currently disabled.');
  }
  const { message } = req.body;
  const text = String(message || '').trim();
  const maxLen = (config && config.maxMessageLength) || 1000;
  if (!text) {
    res.status(400);
    throw new Error('Message is required');
  }
  if (text.length > maxLen) {
    res.status(400);
    throw new Error(`Message is too long. Please keep it under ${maxLen} characters.`);
  }
  if (!checkChatRateLimit(req.user._id, config.rateLimitPerMin || 20)) {
    res.status(429);
    throw new Error('You are sending messages too quickly. Please wait a moment and try again.');
  }

  const conversation = await Conversation.findOne({
    _id: req.params.id,
    user: req.user._id,
    tenant: req.tenant._id,
  });

  if (!conversation) {
    res.status(404);
    throw new Error('Conversation not found');
  }

  if (conversation.status !== 'active') {
    res.status(400);
    throw new Error(`Conversation is ${conversation.status}. Please start a new chat.`);
  }

  // Add user message
  conversation.messages.push({ role: 'user', content: text });

  if (isChatTestMode()) {
    const products = conversation.category === 'shop_assistant'
      ? await toolHandlers.search_products({ query: text, limit: 5 }, req.user._id, req.tenant._id, config)
      : [];
    const reply = products.length
      ? `I found ${products.length} matching product${products.length === 1 ? '' : 's'}.`
      : 'No matching products were found in this isolated tenant.';
    conversation.messages.push({ role: 'assistant', content: reply });
    await conversation.save();
    return res.json({
      success: true,
      reply,
      escalated: false,
      products,
    });
  }

  // FAQ fast-path: instant answer, zero AI cost.
  const faqHit = matchFaq(text, config.faqs);
  if (faqHit) {
    conversation.messages.push({ role: 'assistant', content: faqHit.answer });
    await conversation.save();
    return res.json({
      success: true,
      reply: faqHit.answer,
      escalated: false,
      products: [],
      source: 'faq',
    });
  }

  // Deterministic common intents avoid an unnecessary provider round-trip for
  // store policy, catalog, order-status, and payment questions.
  try {
    const fastReply = await getFastChatReply(
      conversation.category,
      text,
      req.user._id,
      req.tenant._id,
      config,
    );
    if (fastReply) {
      const reply = typeof fastReply === 'string' ? fastReply : fastReply.reply;
      const products = typeof fastReply === 'string' ? [] : (fastReply.products || []);
      conversation.messages.push({ role: 'assistant', content: reply });
      await conversation.save();
      return res.json({
        success: true,
        reply,
        escalated: false,
        products: config.showProductCards !== false ? products : [],
        source: 'fast',
      });
    }
  } catch (error) {
    // A fast DB lookup must never make chat less reliable; use the AI path.
    console.warn('[chat] fast-path unavailable; using AI fallback:', error.message);
  }

  // Build the model context — only the recent window keeps prompts small/fast.
  const systemPrompt = buildSystemPrompt(conversation.category, config);
  const historyWindow = (config && config.maxHistory) || 20;
  const recentMessages = conversation.messages.slice(-historyWindow).map(m => ({ role: m.role, content: m.content }));
  const modelMessages = [
    { role: 'system', content: systemPrompt },
    ...recentMessages,
  ];

  const tools = resolveToolsForCategory(conversation.category, config);
  const model = await getAIModel();
  const usage = startAIUsage(req, { feature: 'chat', action: 'send_customer_message', credits: MESSAGE_CREDIT_COST, model, metadata: { category: conversation.category, toolCount: tools.length } });
  const remainingCredits = await debitAICredits(MESSAGE_CREDIT_COST);
  if (remainingCredits === null) {
    const credits = Number(await Settings.get('ai_credits', 0));
    res.status(402);
    await usage.finish({ status: 'rejected', error: `Insufficient AI credits. Need ${MESSAGE_CREDIT_COST}` });
    throw new Error(`Insufficient AI credits. You have ${credits} credits but need ${MESSAGE_CREDIT_COST}. Please top up.`);
  }
  usage.charge(MESSAGE_CREDIT_COST);
  let reply;
  let escalated;
  let products;
  try {
    const client = await getAIClient();
    const result = await runFunctionCallingLoop(client, model, modelMessages, tools, req.user._id, req.tenant._id, conversation, config);
    ({ reply, escalated, products } = result);
    // Usage telemetry is deliberately off the response's critical path. Its
    // own service is best-effort and already protects successful chat replies.
    void usage.finish({ usage: result.usage }).catch(() => {});
  } catch (err) {
    const current = Number(await Settings.get('ai_credits', 0));
    await Settings.set('ai_credits', roundCredits(current + MESSAGE_CREDIT_COST), 'ai');
    usage.refund(MESSAGE_CREDIT_COST);
    await usage.finish({ status: 'failed', error: err.message });
    throw err;
  }

  // Add assistant reply
  conversation.messages.push({ role: 'assistant', content: reply });
  await conversation.save();

  const showProducts = config.showProductCards !== false;
  res.json({
    success: true,
    reply,
    escalated,
    products: showProducts ? (products || []) : [],
    aiCredits: remainingCredits,
  });
});

// @desc    List my conversations (for resume/history)
// @route   GET /api/chat/history
const getHistory = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const filter = { user: req.user._id, tenant: req.tenant._id };
  const [conversations, total] = await Promise.all([
    Conversation.find(filter)
      .select('category status messages createdAt updatedAt')
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Conversation.countDocuments(filter),
  ]);
  res.json({
    success: true,
    conversations: conversations.map((c) => ({
      _id: c._id,
      category: c.category,
      status: c.status,
      messageCount: c.messages?.length || 0,
      lastMessage: c.messages?.length ? c.messages[c.messages.length - 1].content.slice(0, 160) : '',
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

// @desc    Get one of my conversations (for resume)
// @route   GET /api/chat/:id
const getMyConversation = asyncHandler(async (req, res) => {
  const conversation = await Conversation.findOne({
    _id: req.params.id,
    user: req.user._id,
    tenant: req.tenant._id,
  }).lean();
  if (!conversation) {
    res.status(404);
    throw new Error('Conversation not found');
  }
  res.json({ success: true, conversation });
});

module.exports = { startConversation, sendMessage, getHistory, getMyConversation, checkChatRateLimit, rateLimitStore };
