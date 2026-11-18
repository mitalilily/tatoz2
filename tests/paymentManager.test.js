jest.mock('../services/payment/gateways/cashfree', () => ({ id: 'cashfree' }));
jest.mock('../services/payment/gateways/stripe', () => ({ id: 'stripe' }));
jest.mock('../services/payment/gateways/razorpay', () => ({
  id: 'razorpay',
  displayName: 'Razorpay',
  getPublicConfig: config => ({ key_id: config.key_id }),
  createOrder: jest.fn().mockResolvedValue({
    id: 'order_test_deepdive',
    externalOrderId: 'order_test_deepdive',
    amount: 100,
    currency: 'INR',
  }),
}));
jest.mock('../models/Settings', () => ({ get: jest.fn(), set: jest.fn() }));
jest.mock('../services/integrationService', () => ({ getProviderConfig: jest.fn() }));
jest.mock('../services/tenantIntegrationService', () => ({ configFor: jest.fn() }));
jest.mock('../services/providerSelectionService', () => ({
  getActiveProviders: jest.fn(),
  getActiveProvider: jest.fn(),
  assertProvider: jest.fn(),
}));
jest.mock('../services/integrations/registerBuiltins', () => ({}));

const razorpay = require('../services/payment/gateways/razorpay');
const tenantIntegrationService = require('../services/tenantIntegrationService');
const { getActiveProviders } = require('../services/providerSelectionService');
const paymentManager = require('../services/payment/paymentManager');

describe('payment manager gateway contracts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getActiveProviders.mockResolvedValue(['razorpay']);
    tenantIntegrationService.configFor.mockResolvedValue({
      enabled: true,
      key_id: 'rzp_test_deepdive',
      key_secret: 'test-secret',
      environment: 'sandbox',
    });
  });

  test('passes resolved Razorpay credentials into the adapter', async () => {
    const result = await paymentManager.createOrder('razorpay', {
      amount: 1,
      orderId: 'local-order',
      currency: 'INR',
      tenantId: 'tenant-id',
    });

    expect(result.externalOrderId).toBe('order_test_deepdive');
    expect(razorpay.createOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 1,
        orderId: 'local-order',
        config: expect.objectContaining({ key_id: 'rzp_test_deepdive', key_secret: 'test-secret' }),
      }),
      expect.objectContaining({ key_id: 'rzp_test_deepdive', key_secret: 'test-secret' }),
    );
  });
});
