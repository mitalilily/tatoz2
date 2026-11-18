const httpRequest = require('../../../utils/httpRequest');

const text = value => String(value ?? '').trim();
const baseUrl = config => text(config.base_url || 'https://shipment.xpressbees.com').replace(/\/$/, '');
const apiUrl = (config, path) => `${baseUrl(config)}/api/${String(path).replace(/^\//, '')}`;
const required = (value, label) => {
  if (!text(value)) throw new Error(`${label} is required`);
  return text(value);
};

let tokenCache = new Map();

const getToken = async config => {
  const key = `${baseUrl(config)}:${text(config.email)}`;
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.token;
  const response = await httpRequest({ url: apiUrl(config, 'users/login'), method: 'POST', body: { email: required(config.email, 'XpressBees account email'), password: required(config.password, 'XpressBees account password') }, timeout: 15000 });
  const token = response.data?.token || response.data?.data?.token;
  if (!token) throw new Error('XpressBees login response did not contain a token');
  tokenCache.set(key, { token, expiresAt: Date.now() + 8 * 60 * 60 * 1000 });
  return token;
};

const headers = async config => ({ Authorization: `Bearer ${await getToken(config)}` });
const address = (value = {}, fallbackName = '') => ({
  name: value.fullName || value.name || fallbackName,
  address: value.street || value.address || '',
  address_2: value.street2 || value.address_2 || '',
  city: value.city || '', state: value.state || '', pincode: value.pincode || value.pin || '', phone: value.phone || '',
});

const testConnection = async config => {
  const response = await httpRequest({ url: apiUrl(config, 'courier'), headers: await headers(config), timeout: 15000 });
  if (response.data === undefined) throw new Error('XpressBees returned an empty courier response');
  return { success: true, message: 'XpressBees credentials are valid' };
};

const getRates = async ({ pickupPincode, deliveryPincode, weight, length, breadth, height, declaredValue = 0, cod = 0 }, config) => {
  const response = await httpRequest({
    url: apiUrl(config, 'courier/serviceability'), method: 'POST', headers: await headers(config),
    body: {
      origin: required(pickupPincode, 'Pickup pincode'), destination: required(deliveryPincode, 'Delivery pincode'),
      payment_type: cod ? 'cod' : 'prepaid', order_amount: Number(declaredValue || 0), weight: Math.max(1, Math.round(Number(weight || 0.5) * 1000)),
      length: Number(length || 10), breadth: Number(breadth || 10), height: Number(height || 10),
    }, timeout: 15000,
  });
  const data = response.data?.data || response.data;
  const rows = Array.isArray(data) ? data : data?.couriers || data?.available_courier_companies || [data];
  return rows.filter(Boolean).map(row => ({ provider: 'xpressbees', name: row.courier_name || row.name || 'XpressBees', courierId: row.courier_id || row.id, freight: Number(row.total || row.freight || row.shipping_charges || 0), cod: Number(row.cod_charges || row.cod || 0), estimatedDays: row.estimated_days || row.etd || null, raw: row }));
};

const createShipment = async (orderData, config) => {
  const destination = address(orderData.address, orderData.customerName);
  const pickup = { ...address({ ...config, fullName: config.pickup_contact_name || config.name, street: config.pickup_address, pincode: config.pickup_pincode, phone: config.pickup_phone }, config.pickup_contact_name || config.name), warehouse_name: required(config.pickup_warehouse || config.pickup_location, 'XpressBees pickup warehouse') };
  const items = (orderData.items || []).map(item => ({ name: item.title || item.name || 'Item', qty: Number(item.quantity || 1), price: Number(item.price || 0), sku: item.sku || item.title || 'ITEM' }));
  const response = await httpRequest({
    url: apiUrl(config, 'shipments2'), method: 'POST', headers: await headers(config),
    body: {
      order_number: required(orderData.orderId, 'Order ID'), shipping_charges: Number(orderData.shippingCost || 0), discount: Number(orderData.discount || 0), cod_charges: orderData.paymentMethod === 'cod' ? Number(orderData.codCharges || 0) : 0,
      payment_type: orderData.paymentMethod === 'cod' ? 'cod' : 'prepaid', order_amount: Number(orderData.total || 0), package_weight: Math.max(1, Math.round(Number(orderData.weight || 0.5) * 1000)), package_length: Number(orderData.length || 10), package_breadth: Number(orderData.breadth || 10), package_height: Number(orderData.height || 10),
      request_auto_pickup: Boolean(config.request_auto_pickup !== false), consignee: destination, pickup, order_items: items, ...(orderData.courierId ? { courier_id: orderData.courierId } : {}), collectable_amount: orderData.paymentMethod === 'cod' ? Number(orderData.total || 0) : 0,
    }, timeout: 20000,
  });
  const data = response.data?.data || response.data;
  const awbCode = data?.awb_number || data?.awb || data?.waybill;
  if (!awbCode) { const error = new Error(data?.message || 'XpressBees did not return an AWB number'); error.response = response.data; throw error; }
  return { orderId: data.order_id || orderData.orderId, shipmentId: data.shipment_id || data.id, awbCode: String(awbCode), awbNumber: String(awbCode), courierName: data.courier_name || 'XpressBees', status: data.status || 'created', label: data.label, raw: response.data };
};

const trackShipment = async (trackingNumber, config) => {
  const awb = required(trackingNumber, 'XpressBees AWB number');
  const response = await httpRequest({ url: apiUrl(config, `shipments2/track/${encodeURIComponent(awb)}`), headers: await headers(config), timeout: 15000 });
  const data = response.data?.data || response.data;
  return { awb, status: data?.status || data?.current_status, location: data?.location, history: data?.history || data?.scans || data?.tracking || [], raw: response.data };
};

const cancelShipment = async (trackingNumber, config) => {
  const awb = required(trackingNumber, 'XpressBees AWB number');
  const response = await httpRequest({ url: apiUrl(config, 'shipments2/cancel'), method: 'POST', headers: await headers(config), body: { awb }, timeout: 15000 });
  return response.data;
};

module.exports = { id: 'xpressbees', displayName: 'XpressBees', activation: 'active', contractMethods: ['getRates', 'createShipment', 'trackShipment', 'cancelShipment', 'testConnection'], testConnection, getRates, createShipment, trackShipment, cancelShipment, _clearTokenCache: () => tokenCache.clear() };
