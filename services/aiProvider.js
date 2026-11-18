const DEFAULT_META_BASE_URL = 'https://api.meta.ai/v1';
const DEFAULT_META_MODEL = 'muse-spark-1.3-contributor';

let client = null;
let clientSignature = '';

const providerError = (message, statusCode = 503, publicCode = 'AI_PROVIDER_NOT_CONFIGURED') => {
  const error = new Error(message);
  error.status = statusCode;
  error.statusCode = statusCode;
  error.publicCode = publicCode;
  return error;
};

const getAIConfig = ({ requireKey = true } = {}) => {
  const provider = String(process.env.AI_PROVIDER || 'meta').trim().toLowerCase();
  if (provider !== 'meta') {
    throw providerError(`Unsupported AI provider "${provider}". Configure AI_PROVIDER=meta.`, 503, 'AI_PROVIDER_UNSUPPORTED');
  }

  const apiKey = String(process.env.MODEL_API_KEY || '').trim();
  if (requireKey && !apiKey) {
    throw providerError('Meta AI is not configured. Set MODEL_API_KEY in the server .env.', 503, 'AI_PROVIDER_NOT_CONFIGURED');
  }

  return {
    provider: 'meta',
    apiKey,
    baseURL: String(process.env.META_AI_BASE_URL || DEFAULT_META_BASE_URL).trim().replace(/\/$/, ''),
    model: String(process.env.META_AI_MODEL || DEFAULT_META_MODEL).trim(),
    reasoningEffort: String(process.env.META_AI_REASONING_EFFORT || 'low').trim().toLowerCase(),
  };
};

const contentParts = content => {
  if (typeof content === 'string') return [{ type: 'input_text', text: content }];
  if (!Array.isArray(content)) return [];

  return content.flatMap(part => {
    if (typeof part === 'string') return [{ type: 'input_text', text: part }];
    if (!part || typeof part !== 'object') return [];
    if (part.type === 'text' || part.type === 'input_text' || part.type === 'output_text') {
      return [{ type: part.type === 'output_text' ? 'output_text' : 'input_text', text: String(part.text || '') }];
    }
    if (part.type === 'image_url' || part.type === 'input_image') {
      const imageUrl = typeof part.image_url === 'string' ? part.image_url : part.image_url?.url;
      return imageUrl ? [{ type: 'input_image', image_url: imageUrl }] : [];
    }
    if (part.type === 'refusal' && part.refusal) return [{ type: 'input_text', text: String(part.refusal) }];
    return [];
  }).filter(part => part.text || part.image_url);
};

const normalizeInput = messages => (Array.isArray(messages) ? messages : []).flatMap(message => {
  if (!message || typeof message !== 'object') return [];
  const role = String(message.role || 'user').toLowerCase();

  if (role === 'tool') {
    return [{
      type: 'function_call_output',
      call_id: String(message.tool_call_id || message.call_id || ''),
      output: typeof message.content === 'string' ? message.content : JSON.stringify(message.content ?? ''),
    }];
  }

  if (role === 'assistant' && Array.isArray(message.tool_calls) && message.tool_calls.length) {
    const text = contentParts(message.content).map(part => part.type === 'input_text' ? { ...part, type: 'output_text' } : part);
    const calls = message.tool_calls.map(call => ({
      type: 'function_call',
      call_id: String(call.id || call.call_id || ''),
      name: String(call.function?.name || call.name || ''),
      arguments: typeof call.function?.arguments === 'string'
        ? call.function.arguments
        : JSON.stringify(call.function?.arguments || {}),
    })).filter(call => call.call_id && call.name);
    return [
      ...(text.length ? [{ role: 'assistant', content: text }] : []),
      ...calls,
    ];
  }

  const parts = role === 'assistant'
    ? contentParts(message.content).map(part => part.type === 'input_text' ? { ...part, type: 'output_text' } : part)
    : contentParts(message.content);
  return [{
    role: ['system', 'developer', 'user', 'assistant'].includes(role) ? role : 'user',
    content: parts.length ? parts : [{ type: 'input_text', text: '' }],
  }];
});

const normalizeTools = tools => (Array.isArray(tools) ? tools : []).flatMap(tool => {
  if (!tool || typeof tool !== 'object' || tool.type !== 'function') return [];
  const fn = tool.function || tool;
  if (!fn.name) return [];
  return [{
    type: 'function',
    name: String(fn.name),
    description: fn.description ? String(fn.description) : undefined,
    parameters: fn.parameters || { type: 'object', properties: {} },
    ...(fn.strict !== undefined ? { strict: Boolean(fn.strict) } : {}),
  }];
});

const buildResponsesPayload = (params, config) => {
  const payload = {
    model: String(params.model || config.model),
    input: Array.isArray(params.input) ? params.input : normalizeInput(params.messages),
    stream: false,
  };

  if (params.tools) payload.tools = normalizeTools(params.tools);
  if (params.tool_choice !== undefined) payload.tool_choice = params.tool_choice;
  if (params.parallel_tool_calls !== undefined) payload.parallel_tool_calls = params.parallel_tool_calls;
  if (params.temperature !== undefined) payload.temperature = params.temperature;
  if (params.top_p !== undefined) payload.top_p = params.top_p;
  if (params.max_output_tokens !== undefined) payload.max_output_tokens = params.max_output_tokens;
  else if (params.max_tokens !== undefined) payload.max_output_tokens = params.max_tokens;
  if (params.reasoning !== undefined) payload.reasoning = params.reasoning;
  else if (config.reasoningEffort) payload.reasoning = { effort: config.reasoningEffort };

  // The Responses API uses `text.format` for structured output. The prompts
  // remain the source of truth for this model, but preserve JSON mode when a
  // caller explicitly asks for it.
  if (params.response_format?.type === 'json_object') {
    payload.text = { format: { type: 'json_object' } };
  } else if (params.text) {
    payload.text = params.text;
  }

  return payload;
};

const readProviderResponse = async response => {
  const rawText = await response.text();
  let body;
  try {
    body = rawText ? JSON.parse(rawText) : {};
  } catch {
    body = { error: { message: rawText.slice(0, 500) } };
  }
  if (!response.ok) {
    const message = body?.error?.message || body?.message || `Meta AI request failed with HTTP ${response.status}`;
    const error = new Error(String(message));
    error.status = response.status;
    error.statusCode = response.status;
    error.providerResponse = body;
    throw error;
  }
  return body;
};

const extractText = response => {
  if (typeof response?.output_text === 'string') return response.output_text;
  const output = Array.isArray(response?.output) ? response.output : [];
  return output.flatMap(item => {
    if (item?.type === 'message' && Array.isArray(item.content)) {
      return item.content.flatMap(part => part?.text ? [String(part.text)] : []);
    }
    if (item?.type === 'output_text' || item?.type === 'text') return item.text ? [String(item.text)] : [];
    return [];
  }).join('');
};

const extractToolCalls = response => {
  const output = Array.isArray(response?.output) ? response.output : [];
  return output.filter(item => item?.type === 'function_call' || item?.type === 'tool_call').map((call, index) => ({
    id: String(call.call_id || call.id || `call_${index + 1}`),
    type: 'function',
    function: {
      name: String(call.name || call.function?.name || ''),
      arguments: typeof call.arguments === 'string'
        ? call.arguments
        : JSON.stringify(call.arguments || call.function?.arguments || {}),
    },
  })).filter(call => call.function.name);
};

const toCompatibilityResponse = (response, requestedModel) => {
  const text = extractText(response);
  const toolCalls = extractToolCalls(response);
  const usage = response?.usage || {};
  const normalizedUsage = {
    ...usage,
    prompt_tokens: Number(usage.prompt_tokens ?? usage.input_tokens ?? 0),
    completion_tokens: Number(usage.completion_tokens ?? usage.output_tokens ?? 0),
    total_tokens: Number(usage.total_tokens ?? usage.total ?? 0),
    input_tokens: Number(usage.input_tokens ?? usage.prompt_tokens ?? 0),
    output_tokens: Number(usage.output_tokens ?? usage.completion_tokens ?? 0),
  };
  return {
    ...response,
    model: response?.model || requestedModel,
    output_text: text,
    usage: normalizedUsage,
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: text,
        ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
      },
      finish_reason: toolCalls.length ? 'tool_calls' : (response?.status === 'incomplete' ? 'length' : 'stop'),
    }],
  };
};

const createMetaResponse = async params => {
  const config = getAIConfig();
  const payload = buildResponsesPayload(params, config);
  const response = await fetch(`${config.baseURL}/responses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  return readProviderResponse(response);
};

const getAIClient = async () => {
  const config = getAIConfig();
  const signature = [config.apiKey, config.baseURL].join('|');
  if (!client || clientSignature !== signature) {
    client = {
      responses: {
        create: createMetaResponse,
      },
      chat: {
        completions: {
          create: async params => toCompatibilityResponse(await createMetaResponse(params), params.model || config.model),
        },
      },
    };
    clientSignature = signature;
  }
  return client;
};

module.exports = {
  DEFAULT_META_BASE_URL,
  DEFAULT_META_MODEL,
  getAIConfig,
  getAIClient,
  normalizeInput,
  normalizeTools,
  buildResponsesPayload,
  extractText,
  extractToolCalls,
  toCompatibilityResponse,
};
