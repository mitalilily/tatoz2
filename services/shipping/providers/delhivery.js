const httpRequest = require('../../../utils/httpRequest');

const API_ROOTS = Object.freeze({
  sandbox: 'https://staging-express.delhivery.com',
  production: 'https://track.delhivery.com',
});

const normalizedEnvironment = environment => String(environment || 'sandbox').toLowerCase() === 'production' ? 'production' : 'sandbox';
const apiRoot = environment => API_ROOTS[normalizedEnvironment(environment)];
const text = value => String(value ?? '').trim();
const required = (value, label) => {
  if (!text(value)) throw new Error(`${label} is required`);
  return text(value);
};

const authHeaders = config => ({ Authorization: `Token ${required(config.api_key, 'Delhivery API key')}` });
const formData = value => `format=json&data=${encodeURIComponent(JSON.stringify(value))}`;
const pin = (value, label) => {
  const normalized = text(value).replace(/\D/g, '');
  if (!/^\d{6}$/.test(normalized)) throw new Error(`${label} must be a valid 6-digit pincode`);
  return normalized;
};
const grams = (weight, unit = 'kg') => {
  const value = Number(weight);
  if (!Number.isFinite(value) || value <= 0) return 500;
  return Math.max(1, Math.round(String(unit).toLowerCase() === 'g' ? value : value * 1000));
};
const addressLine = address => [address?.street, address?.street2, address?.landmark].filter(Boolean).join(', ').slice(0, 256);

const testConnection = async config => {
  const testPincode = pin(config.test_pincode || '110001', 'Delhivery test pincode');
  const response = await httpRequest({
    url: `${apiRoot(config.environment)}/c/api/pin-codes/json/?filter_codes=${encodeURIComponent(testPincode)}`,
    headers: authHeaders(config),
    timeout: 12000,
  });
  if (!response.data || !Array.isArray(response.data.delivery_codes)) throw new Error('Delhivery returned an unexpected serviceability response');
  return { success: true, message: `Delhivery ${normalizedEnvironment(config.environment)} API key is valid` };
};

const checkServiceability = async ({ deliveryPincode }, config) => {
  const response = await httpRequest({
    url: `${apiRoot(config.environment)}/c/api/pin-codes/json/?filter_codes=${encodeURIComponent(pin(deliveryPincode, 'Delivery pincode'))}`,
    headers: authHeaders(config),
    timeout: 12000,
  });
  return response.data?.delivery_codes || [];
};

const getRates = async ({ pickupPincode, deliveryPincode, weight, declaredValue = 0, cod = 0 }, config) => {
  const serviceability = await checkServiceability({ deliveryPincode }, config);
  if (!serviceability.length) return [];
  const origin = pin(pickupPincode || config.pickup_pincode, 'Pickup pincode');
  const destination = pin(deliveryPincode, 'Delivery pincode');
  const query = new URLSearchParams({
    md: config.billing_mode || 'E',
    cgm: String(grams(weight, config.weight_unit)),
    o_pin: origin,
    d_pin: destination,
    ss: 'Delivered',
    pt: cod ? 'COD' : 'Pre-paid',
    cod: cod ? String(Number(declaredValue) || 0) : '0',
  });
  const response = await httpRequest({
    url: `${apiRoot(config.environment)}/api/kinko/v1/invoice/charges/.json?${query.toString()}`,
    headers: authHeaders(config),
    timeout: 12000,
  });
  const data = response.data || {};
  const amount = Number(data.total_amount ?? data.gross_amount ?? data.total ?? 0);
  return [{ provider: 'delhivery', name: 'Delhivery', freight: Number.isFinite(amount) ? amount : 0, cod: Number(data.cod ?? 0), estimatedDays: data.estimated_days || data.etd || null, raw: data }];
};

const createShipment = async (orderData, config) => {
  const address = orderData.address || {};
  const customerName = required(orderData.customerName || address.fullName, 'Customer name');
  const deliveryPin = pin(address.pincode, 'Delivery pincode');
  const client = required(config.client_name, 'Delhivery client name');
  const pickupLocation = required(config.pickup_location, 'Delhivery pickup location');
  const sellerGst = required(config.seller_gst_tin, 'Delhivery seller GSTIN');
  const hsnCode = required(config.hsn_code, 'Delhivery HSN code');
  const shipment = {
    name: customerName,
    add: required(addressLine(address), 'Customer address'),
    city: required(address.city, 'Customer city'),
    state: required(address.state, 'Customer state'),
    country: address.country || 'India',
    pin: deliveryPin,
    phone: required(address.phone, 'Customer phone'),
    order: required(orderData.orderId, 'Order ID'),
    payment_mode: orderData.paymentMethod === 'cod' ? 'COD' : 'Pre-paid',
    products_desc: (orderData.items || []).map(item => `${item.title || item.name || 'Item'} x${item.quantity || 1}`).join(', ').slice(0, 256),
    total_amount: Number(orderData.total || 0),
    weight: grams(orderData.weight, config.weight_unit),
    shipment_length: Number(orderData.length || 10),
    shipment_width: Number(orderData.breadth || orderData.width || 10),
    shipment_height: Number(orderData.height || 10),
    seller_name: config.seller_name || client,
    seller_add: config.seller_address || pickupLocation,
    seller_pin: pin(config.pickup_pincode, 'Pickup pincode'),
    client,
    pickup_location: { name: pickupLocation },
    seller_gst_tin: sellerGst,
    hsn_code: hsnCode,
    invoice_reference: orderData.orderId,
  };
  const response = await httpRequest({
    url: `${apiRoot(config.environment)}/api/cmu/create.json`,
    method: 'POST',
    headers: { ...authHeaders(config), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formData({ shipments: [shipment] }),
    timeout: 20000,
  });
  const data = response.data || {};
  const item = data.packages?.[0] || data.shipments?.[0] || {};
  const waybill = item.waybill || item.awb || data.waybill || data.awb;
  if (!waybill) {
    const message = data.rmk || data.message || data.error || 'Delhivery did not return a waybill';
    const error = new Error(String(message));
    error.response = data;
    throw error;
  }
  return { orderId: orderData.orderId, shipmentId: item.refnum || item.order || orderData.orderId, waybill: String(waybill), awbNumber: String(waybill), awbCode: String(waybill), courierName: 'Delhivery', status: item.status || 'Manifested', raw: data };
};

const trackShipment = async (trackingNumber, config) => {
  const waybill = required(trackingNumber, 'Delhivery waybill');
  const query = new URLSearchParams({ waybill, verbose: 'true' });
  const response = await httpRequest({ url: `${apiRoot(config.environment)}/api/v1/packages/json/?${query.toString()}`, headers: { ...authHeaders(config), Accept: 'application/json' }, timeout: 15000 });
  const data = response.data || {};
  const shipment = data.ShipmentData?.[0]?.Shipment || data.Shipment || data.shipment || {};
  const status = shipment.Status?.Status || shipment.status || data.status;
  return { awb: waybill, status, location: shipment.Status?.StatusLocation || shipment.location, history: shipment.Scans || shipment.scans || [], raw: data };
};

const cancelShipment = async (trackingNumber, config) => {
  const waybill = required(trackingNumber, 'Delhivery waybill');
  const response = await httpRequest({ url: `${apiRoot(config.environment)}/api/p/edit`, method: 'POST', headers: authHeaders(config), body: { waybill, cancellation: 'true' }, timeout: 15000 });
  return response.data;
};

module.exports = { id: 'delhivery', displayName: 'Delhivery', activation: 'active', contractMethods: ['getRates', 'createShipment', 'trackShipment', 'cancelShipment', 'testConnection'], testConnection, checkServiceability, getRates, createShipment, trackShipment, cancelShipment };
