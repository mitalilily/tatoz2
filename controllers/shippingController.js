const asyncHandler = require('express-async-handler');
const Order = require('../models/Order');
const shippingManager = require('../services/shipping/shippingManager');
const { catalog } = require('../services/integrations/providerRegistry');
const { getActiveProvider: getSelectedProvider } = require('../services/providerSelectionService');
const {
  calculateCartShippingInputs,
  configuredServiceability,
  quoteShipping,
} = require('../services/shipping/quoteService');

// @desc    Get active shipping provider info
// @route   GET /api/shipping/provider
const getActiveProvider = asyncHandler(async (req, res) => {
  const providerId = await getSelectedProvider('shipping');
  if (!providerId) return res.json({ success: true, provider: { id: null, displayName: 'Manual order processing', enabled: false, mode: 'manual' } });
  if (!await shippingManager.isEnabled(req.tenant?._id)) return res.json({ success: true, provider: { id: providerId, displayName: catalog[providerId]?.name || providerId, enabled: false } });
  res.json({
    success: true,
    provider: { id: providerId, displayName: catalog[providerId]?.name || providerId, enabled: true },
  });
});

// @desc    Get shipping rates for a pincode/weight
// @route   POST /api/shipping/rates
const getRates = asyncHandler(async (req, res) => {
  const { pickupPincode, deliveryPincode, weight, declaredValue, cod } = req.body;
  if (!deliveryPincode || !weight) {
    res.status(400);
    throw new Error('deliveryPincode and weight are required');
  }
  const provider = await getSelectedProvider('shipping');
  if (!provider) return res.json({ success: true, rates: [], provider: null, mode: 'manual', message: 'No shipping provider is active; orders will be processed manually.' });
  const rates = await shippingManager.getRates({ tenantId: req.tenant?._id, provider, pickupPincode, deliveryPincode, weight, declaredValue, cod });
  res.json({ success: true, rates, provider });
});

// @desc    Get the tenant's server-calculated checkout shipping quote
// @route   POST /api/shipping/quote
const getQuote = asyncHandler(async (req, res) => {
  const { items, shippingAddress, paymentMethod, discount, couponFreeShipping } = req.body || {};
  if (!shippingAddress || typeof shippingAddress !== 'object' || !/^\d{6}$/.test(String(shippingAddress.pincode || '').replace(/\D/g, ''))) {
    res.status(400);
    throw new Error('A valid 6-digit delivery pincode is required');
  }
  const inputs = await calculateCartShippingInputs({
    items: Array.isArray(items) ? items : [],
    tenantId: req.tenant?._id,
  });
  const numericDiscount = Number(discount || 0);
  if (!Number.isFinite(numericDiscount) || numericDiscount < 0) {
    res.status(400);
    throw new Error('Invalid shipping quote discount');
  }
  try {
    const quote = await quoteShipping({
      tenantId: req.tenant?._id,
      shippingAddress: { ...shippingAddress, pincode: String(shippingAddress.pincode).replace(/\D/g, '') },
      subtotal: inputs.subtotal,
      discount: numericDiscount,
      weight: inputs.weight,
      paymentMethod,
      couponFreeShipping: couponFreeShipping === true,
    });
    return res.json({ success: true, authoritative: true, quote, inputs });
  } catch (error) {
    // A quote lookup is a read operation. An address that is outside the
    // configured delivery rules is a valid business response, not an
    // application failure, so return it as a serviceability result instead
    // of creating a noisy browser 422 while the shopper edits their address.
    if (['SHIPPING_PINCODE_UNSERVICEABLE', 'SHIPPING_METHOD_UNAVAILABLE'].includes(error.publicCode)) {
      return res.json({
        success: true,
        authoritative: true,
        quote: {
          source: 'configured',
          serviceable: false,
          shippingCost: 0,
          shippingMethod: '',
          serviceLevel: '',
          zone: null,
          rate: null,
          subtotal: inputs.subtotal,
          discount: numericDiscount,
          discountedSubtotal: Math.max(0, Number(inputs.subtotal || 0) - numericDiscount),
          weight: inputs.weight,
          currency: 'INR',
          error: error.message,
        },
        inputs,
      });
    }
    throw error;
  }
});

// @desc    Create a shipment for an order
// @route   POST /api/shipping/create
const createShipment = asyncHandler(async (req, res) => {
  const { orderId } = req.body;
  if (!orderId) { res.status(400); throw new Error('orderId is required'); }

  const order = await Order.findOne({ _id: orderId, ...(req.tenant ? { tenant: req.tenant._id } : {}) }).populate('items.product', 'title sku weight');
  if (!order) { res.status(404); throw new Error('Order not found'); }

  const shipmentData = {
    orderId: order._id.toString(),
    customerName: order.shippingAddress.fullName,
    customerEmail: req.user?.email,
    address: order.shippingAddress,
    items: order.items.map(i => ({
      title: i.title,
      sku: i.sku,
      quantity: i.quantity,
      price: i.price,
    })),
    total: order.total,
    paymentMethod: order.paymentMethod,
    weight: req.body.weight || 0.5,
    length: req.body.length,
    breadth: req.body.breadth,
    height: req.body.height,
  };

  const provider = await getSelectedProvider('shipping');
  if (!provider) {
    const error = new Error('No shipping provider is active. Orders will be processed manually.');
    error.statusCode = 409;
    error.publicCode = 'SHIPPING_PROVIDER_INACTIVE';
    throw error;
  }
  const result = await shippingManager.createShipment(shipmentData, { tenantId: req.tenant?._id, provider });

  // Save tracking info on order
  const trackingId = result.awbCode || result.waybill || result.awbNumber;
  const orderUpdate = {
    trackingNumber: trackingId,
    orderStatus: 'shipped',
  };
  if (result.shipmentId) orderUpdate.shiprocketShipmentId = result.shipmentId;
  if (result.orderId) orderUpdate.shiprocketOrderId = result.orderId;
  if (result.awbCode) orderUpdate.awbCode = result.awbCode;
  if (result.courierName) orderUpdate.courierName = result.courierName;
  if (result.status) orderUpdate.shiprocketStatus = result.status;
  orderUpdate.shippingProvider = provider;
  orderUpdate.shippingExternalOrderId = result.orderId;
  orderUpdate.shippingExternalShipmentId = result.shipmentId;
  orderUpdate.shippingStatus = result.status || 'created';
  orderUpdate.shippingLastSync = new Date();
  await Order.findOneAndUpdate({ _id: orderId, ...(req.tenant ? { tenant: req.tenant._id } : {}) }, orderUpdate);

  res.json({ success: true, shipment: result, trackingId });
});

// @desc    Track a shipment
// @route   GET /api/shipping/track/:trackingId
const trackShipment = asyncHandler(async (req, res) => {
  const { trackingId } = req.params;
  const provider = await getSelectedProvider('shipping');
  if (!provider) {
    const error = new Error('No shipping provider is active. Orders will be processed manually.');
    error.statusCode = 409;
    error.publicCode = 'SHIPPING_PROVIDER_INACTIVE';
    throw error;
  }
  const result = await shippingManager.trackShipment(trackingId, { tenantId: req.tenant?._id, provider });
  res.json({ success: true, tracking: result });
});

// @desc    Check delivery availability & estimated days for a pincode
// @route   POST /api/shipping/check-delivery
const checkDelivery = asyncHandler(async (req, res) => {
  const { pincode } = req.body;
  if (!pincode || pincode.length !== 6) {
    res.status(400);
    throw new Error('Valid 6-digit pincode is required');
  }

  const configured = await configuredServiceability({
    tenantId: req.tenant?._id,
    address: { pincode, country: req.body.country || 'India', state: req.body.state || '', city: req.body.city || '' },
    paymentMethod: req.body.paymentMethod || 'prepaid',
  });
  if (configured) {
    const fastest = configured.methods.reduce((best, method) => !best || method.estimatedMinDays < best.estimatedMinDays ? method : best, null);
    return res.json({
      success: true,
      deliverable: configured.serviceable,
      estimatedDays: fastest?.estimatedMinDays ?? null,
      methods: configured.methods,
      zone: configured.zone,
      source: 'configured',
    });
  }

  const provider = await getSelectedProvider('shipping');
  if (!provider) {
    // Fallback: assume deliverable with generic estimate
    return res.json({ success: true, deliverable: true, estimatedDays: 5, courier: null, provider: null, mode: 'manual' });
  }

  if (!await shippingManager.isEnabled(req.tenant?._id)) {
    return res.json({ success: true, deliverable: true, estimatedDays: 5, courier: null, provider, mode: 'manual' });
  }
  const shippingConfig = await shippingManager.getConfig(provider, req.tenant?._id);
  const pickupPincode = shippingConfig.default_pickup_pin || shippingConfig.pickup_pincode || '201014';
  try {
    const rates = await shippingManager.getRates({
      tenantId: req.tenant?._id,
      provider,
      pickupPincode,
      deliveryPincode: pincode,
      weight: 0.5,
      declaredValue: 500,
      cod: 0,
    });

    if (!rates || rates.length === 0) {
      return res.json({ success: true, deliverable: false, estimatedDays: null });
    }

    // Parse estimated days — Shiprocket returns etd as "YYYY-MM-DD" or a number
    const parsed = rates.map(r => {
      let days = r.estimatedDays;
      // If it's a date string like "2026-04-20", calculate days from now
      if (typeof days === 'string' && days.includes('-')) {
        const etd = new Date(days);
        const now = new Date();
        days = Math.ceil((etd - now) / (1000 * 60 * 60 * 24));
        if (days < 1) days = 3;
      } else {
        days = parseInt(days, 10) || 7;
      }
      return { ...r, estimatedDays: days };
    });
    const fastest = parsed.reduce((best, r) => (r.estimatedDays < best.estimatedDays ? r : best), parsed[0]);
    return res.json({
      success: true,
      deliverable: true,
      estimatedDays: fastest.estimatedDays,
    });
  } catch (err) {
    // If serviceability check fails, return generic estimate
    return res.json({ success: true, deliverable: true, estimatedDays: 5, courier: null });
  }
});

module.exports = { getActiveProvider, getRates, getQuote, createShipment, trackShipment, checkDelivery };
