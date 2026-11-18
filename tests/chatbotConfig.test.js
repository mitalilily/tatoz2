const {
  normalizeChatbotConfig,
  matchFaq,
  escapeRegExp,
  toPublicConfig,
} = require('../services/chatbotConfigService');

describe('chatbot config normalization', () => {
  test('defaults apply on empty input', () => {
    const config = normalizeChatbotConfig({});
    expect(config.enabled).toBe(true);
    expect(config.botName).toBe('AI Assistant');
    expect(config.categories).toHaveLength(3);
    expect(config.maxHistory).toBe(20);
    expect(config.productsLimit).toBe(5);
    expect(config.rateLimitPerMin).toBe(20);
    expect(config.maxOutputTokens).toBe(600);
  });

  test('invalid color and limits fall back to safe values', () => {
    const config = normalizeChatbotConfig({
      primaryColor: 'not-a-color',
      maxHistory: 500,
      productsLimit: -3,
      rateLimitPerMin: 1000,
      maxOutputTokens: 5000,
    });
    expect(config.primaryColor).toBe('#0f172a');
    expect(config.maxHistory).toBe(50);
    expect(config.productsLimit).toBe(1);
    expect(config.rateLimitPerMin).toBe(120);
    expect(config.maxOutputTokens).toBe(1200);
  });

  test('bad categories are dropped, at least defaults remain', () => {
    const config = normalizeChatbotConfig({ categories: [{}, null, 'x'] });
    expect(config.categories).toHaveLength(3);
  });

  test('custom category keeps its toolset', () => {
    const config = normalizeChatbotConfig({
      categories: [
        { key: 'warranty_help', label: 'Warranty', toolset: 'general', greeting: 'Hi!' },
      ],
    });
    expect(config.categories).toHaveLength(1);
    expect(config.categories[0].key).toBe('warranty_help');
    expect(config.categories[0].toolset).toBe('general');
  });

  test('public config never exposes system prompts', () => {
    const config = normalizeChatbotConfig({
      systemBase: 'SECRET-INSTRUCTIONS',
      categories: [{ key: 'a', label: 'A', prompt: 'SECRET-CAT' }],
    });
    const pub = toPublicConfig(config);
    expect(JSON.stringify(pub)).not.toMatch(/SECRET/);
    expect(pub.categories[0]).not.toHaveProperty('prompt');
    expect(pub).not.toHaveProperty('systemBase');
  });
});

describe('faq fast-path matcher', () => {
  const faqs = [
    { question: 'What is the delivery time?', answer: '2-4 days', enabled: true },
    { question: 'How do I return a product?', answer: '7-day returns', enabled: true },
    { question: 'Disabled question here', answer: 'never', enabled: false },
  ];

  test('exact question matches instantly', () => {
    expect(matchFaq('What is the delivery time?', faqs)?.answer).toBe('2-4 days');
  });

  test('natural phrasing matches by word overlap', () => {
    expect(matchFaq('how can I return this product please?', faqs)?.answer).toBe('7-day returns');
  });

  test('disabled faqs never match', () => {
    expect(matchFaq('Disabled question here', faqs)).toBeNull();
  });

  test('unrelated messages do not match', () => {
    expect(matchFaq('I want to buy red shoes under 999', faqs)).toBeNull();
    expect(matchFaq('hi', faqs)).toBeNull();
  });
});

describe('regex escaping for product search', () => {
  test('special characters are neutralized', () => {
    const re = new RegExp(escapeRegExp('shirt (men) *+?'), 'i');
    expect(re.test('shirt (men) *+?')).toBe(true);
    expect(() => new RegExp(escapeRegExp('unclosed (('))).not.toThrow();
  });
});
