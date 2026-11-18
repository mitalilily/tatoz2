const httpRequest = require('../../../utils/httpRequest');

// Token cache: { token, expiresAt }
let _tokenCache = {};

const BASE_URL = 'https://apiv2.shiprocket.in/v1/external';

const getToken = async (config) => {
  const cacheKey = config.email;
  const cached = _tokenCache[cacheKey];
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const res = await httpRequest({
    url: `${BASE_URL}/auth/login`,
    method: 'POST',
    body: { email: config.email, password: config.password },
  });
  const token = res.data.token;
  _tokenCache[cacheKey] = { token, expiresAt: Date.now() + 9 * 24 * 60 * 60 * 1000 }; // 9 days
  return token;
};

const authHeaders = async (config) => ({
  Authorization: `Bearer ${await getToken(config)}`,
});

module.exports = {
  id: 'shiprocket',
  displayName: 'Shiprocket',
  description: 'India\'s largest shipping aggregator — Bluedart, Delhivery, DTDC and more',
  async checkServiceability({ pickupPincode, deliveryPincode, weight, cod = 0 }, config) {
    const headers = await authHeaders(config);
    const res = await httpRequest({
      url: `${BASE_URL}/courier/serviceability/?pickup_postcode=${pickupPincode}&delivery_postcode=${deliveryPincode}&weight=${weight}&cod=${cod}`,
      headers,
    });
    return res.data;
  },

  async getRates({ pickupPincode, deliveryPincode, weight, declaredValue, cod = 0 }, config) {
    const headers = await authHeaders(config);
    const res = await httpRequest({
      url: `${BASE_URL}/courier/serviceability/?pickup_postcode=${pickupPincode}&delivery_postcode=${deliveryPincode}&weight=${weight}&cod=${cod}&declared_value=${declaredValue}`,
      headers,
    });
    const couriers = res.data?.data?.available_courier_companies || [];
    return couriers.map(c => ({
      courierId: c.courier_company_id,
      name: c.courier_name,
      estimatedDays: c.estimated_delivery_days,
      freight: c.freight_charge,
      cod: c.cod_charges,
      rating: c.rating,
      // Extra serviceability details for richer courier comparison (all optional).
      etd: c.etd ?? null,
      etdHours: c.etd_hours ?? null,
      pickupPerformance: c.pickup_performance ?? null,
      deliveryPerformance: c.delivery_performance ?? null,
      mode: c.courier_type ?? c.ship_type ?? null,
      codAvailable: c.cod ?? null,
      otherCharges: c.other_charges ?? null,
      minWeight: c.min_weight ?? null,
      pickupCutoff: c.pickup_cutoff_time ?? c.cutoff_time ?? null,
      zone: c.zone ?? null,
    }));
  },

  async createShipment(orderData, config) {
    const headers = await authHeaders(config);
    const res = await httpRequest({
      url: `${BASE_URL}/orders/create/adhoc`,
      method: 'POST',
      headers,
      body: {
        order_id: orderData.orderId,
        order_date: new Date().toISOString().split('T')[0],
        pickup_location: config.pickup_location || 'Primary',
        billing_customer_name: orderData.customerName,
        billing_last_name: '',
        billing_address: orderData.address.street,
        billing_city: orderData.address.city,
        billing_pincode: orderData.address.pincode,
        billing_state: orderData.address.state,
        billing_country: 'India',
        billing_email: orderData.customerEmail || '',
        billing_phone: orderData.address.phone,
        shipping_is_billing: 1,
        order_items: orderData.items.map(i => ({
          name: i.title,
          sku: i.sku || i.title.slice(0, 20),
          units: i.quantity,
          selling_price: i.price,
        })),
        payment_method: orderData.paymentMethod === 'cod' ? 'COD' : 'Prepaid',
        sub_total: orderData.total,
        length: orderData.length,
        breadth: orderData.breadth,
        height: orderData.height,
        weight: orderData.weight,
      },
    });
    // Shiprocket sometimes returns 200 with an error message instead of order data
    if (!res.data.order_id && !res.data.shipment_id) {
      const msg = res.data.message || 'Shiprocket order creation failed — no order_id in response';
      const err = new Error(msg);
      err.response = res.data;
      throw err;
    }
    return {
      shipmentId: res.data.shipment_id,
      orderId: res.data.order_id,
      awbCode: res.data.awb_code,
      courierName: res.data.courier_name,
      status: res.data.status,
    };
  },

  async trackShipment(awbCode, config) {
    const headers = await authHeaders(config);
    const res = await httpRequest({
      url: `${BASE_URL}/courier/track/awb/${awbCode}`,
      headers,
    });
    const tracking = res.data?.tracking_data;
    return {
      awb: awbCode,
      status: tracking?.shipment_track?.[0]?.current_status,
      location: tracking?.shipment_track?.[0]?.location,
      history: tracking?.shipment_track_activities || [],
    };
  },

  async cancelShipment(awbCodes, config) {
    const headers = await authHeaders(config);
    const res = await httpRequest({
      url: `${BASE_URL}/orders/cancel/shipment/awbs`,
      method: 'POST',
      headers,
      body: { awbs: Array.isArray(awbCodes) ? awbCodes : [awbCodes] },
    });
    return res.data;
  },

  // --- Extended API methods ---

  async listOrders(params = {}, config) {
    const headers = await authHeaders(config);
    const query = new URLSearchParams(params).toString();
    const res = await httpRequest({ url: `${BASE_URL}/orders?${query}`, headers });
    return res.data;
  },

  async getOrder(shiprocketOrderId, config) {
    const headers = await authHeaders(config);
    const res = await httpRequest({ url: `${BASE_URL}/orders/show/${shiprocketOrderId}`, headers });
    return res.data;
  },

  async cancelOrders(orderIds, config) {
    const headers = await authHeaders(config);
    const res = await httpRequest({
      url: `${BASE_URL}/orders/cancel`,
      method: 'POST',
      headers,
      body: { ids: Array.isArray(orderIds) ? orderIds : [orderIds] },
    });
    return res.data;
  },

  async listShipments(params = {}, config) {
    const headers = await authHeaders(config);
    const query = new URLSearchParams(params).toString();
    const res = await httpRequest({ url: `${BASE_URL}/shipments?${query}`, headers });
    return res.data;
  },

  async getShipment(shipmentId, config) {
    const headers = await authHeaders(config);
    const res = await httpRequest({ url: `${BASE_URL}/shipments/${shipmentId}`, headers });
    return res.data;
  },

  async assignCourier({ shipmentId, courierId }, config) {
    const headers = await authHeaders(config);
    const res = await httpRequest({
      url: `${BASE_URL}/courier/assign/awb`,
      method: 'POST',
      headers,
      body: { shipment_id: shipmentId, courier_id: courierId },
    });
    return res.data;
  },

  async requestPickup({ shipmentId }, config) {
    const headers = await authHeaders(config);
    const res = await httpRequest({
      url: `${BASE_URL}/courier/generate/pickup`,
      method: 'POST',
      headers,
      body: { shipment_id: Array.isArray(shipmentId) ? shipmentId : [shipmentId] },
    });
    return res.data;
  },

  async generateLabel({ shipmentIds }, config) {
    const headers = await authHeaders(config);
    const res = await httpRequest({
      url: `${BASE_URL}/courier/generate/label`,
      method: 'POST',
      headers,
      body: { shipment_id: Array.isArray(shipmentIds) ? shipmentIds : [shipmentIds] },
    });
    return res.data;
  },

  async generateManifest({ shipmentIds }, config) {
    const headers = await authHeaders(config);
    const res = await httpRequest({
      url: `${BASE_URL}/manifests/generate`,
      method: 'POST',
      headers,
      body: { shipment_id: Array.isArray(shipmentIds) ? shipmentIds : [shipmentIds] },
    });
    return res.data;
  },

  async printManifest({ orderIds }, config) {
    const headers = await authHeaders(config);
    const res = await httpRequest({
      url: `${BASE_URL}/manifests/print`,
      method: 'POST',
      headers,
      body: { order_ids: Array.isArray(orderIds) ? orderIds : [orderIds] },
    });
    return res.data;
  },

  async generateInvoice({ orderIds }, config) {
    const headers = await authHeaders(config);
    const res = await httpRequest({
      url: `${BASE_URL}/orders/print/invoice`,
      method: 'POST',
      headers,
      body: { ids: Array.isArray(orderIds) ? orderIds : [orderIds] },
    });
    return res.data;
  },

  async createReturnOrder(returnData, config) {
    const headers = await authHeaders(config);
    const res = await httpRequest({
      url: `${BASE_URL}/orders/create/return`,
      method: 'POST',
      headers,
      body: returnData,
    });
    return res.data;
  },

  async trackByShipmentId(shipmentId, config) {
    const headers = await authHeaders(config);
    const res = await httpRequest({
      url: `${BASE_URL}/courier/track/shipment/${shipmentId}`,
      headers,
    });
    return res.data;
  },

  async getPickupLocations(config) {
    const headers = await authHeaders(config);
    const res = await httpRequest({ url: `${BASE_URL}/settings/company/pickup`, headers });
    return res.data;
  },

  async addPickupLocation(locationData, config) {
    const headers = await authHeaders(config);
    const res = await httpRequest({
      url: `${BASE_URL}/settings/company/addpickup`,
      method: 'POST',
      headers,
      body: locationData,
    });
    return res.data;
  },

  async getChannels(config) {
    const headers = await authHeaders(config);
    const res = await httpRequest({ url: `${BASE_URL}/channels`, headers });
    return res.data;
  },

  /**
   * Return the full list of couriers mapped to the Shiprocket account.
   * Tries `/courier/courierListWithCounts` first (standard), falls back to
   * `/courier/courierList` if the first 404s on some plans.
   * Shape: array of { id, name, cod, ... } — normalized before return.
   */
  async listAllCouriers(config) {
    const headers = await authHeaders(config);
    const endpoints = [
      `${BASE_URL}/courier/courierListWithCounts`,
      `${BASE_URL}/courier/courierList`,
    ];
    let lastErr;
    for (const url of endpoints) {
      try {
        const res = await httpRequest({ url, headers });
        const raw = res.data;
        // Shiprocket response shape varies — handle both
        const list = raw?.courier_data
          || raw?.data?.courier_data
          || raw?.data
          || (Array.isArray(raw) ? raw : []);
        if (!Array.isArray(list)) continue;
        return list.map(c => ({
          courierCompanyId: c.id ?? c.courier_company_id ?? c.courier_id,
          courierName: c.name ?? c.courier_name ?? c.courier,
          cod: c.cod ?? null,
          count: c.count ?? null,
          rating: c.rating ?? null,
          raw: c,
        })).filter(c => c.courierCompanyId && c.courierName);
      } catch (err) {
        lastErr = err;
        // Try next endpoint on 404 only
        if (!/404|not.?found/i.test(err.message || '')) throw err;
      }
    }
    if (lastErr) throw lastErr;
    return [];
  },

  async testConnection(config) {
    if (!config.email || !config.password) throw new Error('Shiprocket email/password not configured');
    await getToken(config);
    delete _tokenCache[config.email]; // clear so next real call re-auths
    return { success: true, message: 'Shiprocket credentials are valid' };
  },
};
