const asyncHandler = require('express-async-handler');
const Order = require('../models/Order');
const { calcPackageDimensions } = require('./paymentController');
const shippingManager = require('../services/shipping/shippingManager');
const orderLifecycleService = require('../services/orderLifecycleService');

// Helper: load Shiprocket provider + encrypted admin configuration
const getShiprocket = async req => {
  const provider = require('../services/shipping/providers/shiprocket');
  const config = await shippingManager.getConfig('shiprocket', req?.tenant?._id);
  if (!config.enabled || !config.email || !config.password) throw new Error('Shiprocket is not configured. Add credentials in Admin → Modules.');
  return { provider, config };
};

const orderFilterFor = (req, orderId) => ({
  _id: orderId,
  ...(req.tenant ? { tenant: req.tenant._id } : {}),
});

const loadAdminOrder = req => Order.findOne(orderFilterFor(req, req.params.id))
  .populate('items.product', 'title sku weight dimensions')
  .populate('user', 'email')
  .exec();

const validPincode = value => /^\d{6}$/.test(String(value || '').replace(/\D/g, ''));

const resolvePickupPincode = async (provider, config) => {
  const configured = String(config.default_pickup_pin || config.pickup_pincode || '').replace(/\D/g, '');
  if (validPincode(configured)) return configured;

  try {
    const result = await provider.getPickupLocations(config);
    const locations = result?.data?.shipping_address
      || result?.shipping_address
      || result?.data?.pickup_locations
      || result?.pickup_locations
      || [];
    const rows = Array.isArray(locations) ? locations : [];
    const requestedName = String(config.pickup_location || 'Primary').toLowerCase();
    const selected = rows.find(row => String(row.pickup_location || row.name || '').toLowerCase() === requestedName) || rows[0];
    const discovered = String(selected?.pin_code || selected?.pincode || selected?.postcode || '').replace(/\D/g, '');
    if (validPincode(discovered)) return discovered;
  } catch (_) {
    // Fall through to the provider configuration default.
  }
  return '110001';
};

const shipmentDataForOrder = (order, pkg) => ({
  orderId: order.orderNumber,
  customerName: order.shippingAddress?.fullName,
  customerEmail: order.user?.email || '',
  address: order.shippingAddress,
  items: (order.items || []).map(item => ({
    title: item.title,
    sku: item.sku || item.title?.slice(0, 20),
    quantity: item.quantity,
    price: item.price,
  })),
  total: order.total,
  paymentMethod: order.paymentMethod,
  weight: pkg.weight,
  length: pkg.length,
  breadth: pkg.breadth,
  height: pkg.height,
});

const courierResultFields = (result, courierId) => {
  const data = result?.response?.data || result?.data || result || {};
  return {
    awb: data.awb_code || result?.awb_code || '',
    courierName: data.courier_name || result?.courier_name || '',
    courierCompanyId: Number(courierId),
  };
};

// @desc    Dashboard stats (aggregated from local DB)
// @route   GET /api/admin/shiprocket/stats
const getDashboardStats = asyncHandler(async (req, res) => {
  const srFilter = { shiprocketOrderId: { $exists: true, $ne: null } };

  const [total, statusAgg, paymentAgg, recentOrders] = await Promise.all([
    Order.countDocuments(srFilter),
    Order.aggregate([
      { $match: srFilter },
      { $group: { _id: '$shiprocketStatus', count: { $sum: 1 }, totalAmount: { $sum: '$total' } } },
      { $sort: { count: -1 } },
    ]),
    Order.aggregate([
      { $match: srFilter },
      { $group: { _id: '$paymentMethod', count: { $sum: 1 }, totalAmount: { $sum: '$total' } } },
    ]),
    Order.find(srFilter).sort({ createdAt: -1 }).limit(5).select('orderNumber shiprocketStatus awbCode courierName total createdAt'),
  ]);

  const statusMap = {};
  statusAgg.forEach(s => { statusMap[s._id || 'unknown'] = { count: s.count, amount: s.totalAmount }; });

  const codOrders = paymentAgg.find(p => p._id === 'cod') || { count: 0, totalAmount: 0 };
  const prepaidOrders = paymentAgg.filter(p => p._id !== 'cod').reduce((acc, p) => ({ count: acc.count + p.count, totalAmount: acc.totalAmount + p.totalAmount }), { count: 0, totalAmount: 0 });

  res.json({
    success: true,
    stats: {
      total,
      shipped: (statusMap['PICKED UP']?.count || 0) + (statusMap['IN TRANSIT']?.count || 0) + (statusMap['shipped']?.count || 0),
      delivered: statusMap['DELIVERED']?.count || statusMap['delivered']?.count || 0,
      rto: (statusMap['RTO INITIATED']?.count || 0) + (statusMap['RTO DELIVERED']?.count || 0),
      pending: (statusMap['NEW']?.count || 0) + (statusMap['pending']?.count || 0) + (statusMap['confirmed']?.count || 0),
      cancelled: statusMap['CANCELLED']?.count || statusMap['cancelled']?.count || 0,
      inTransit: statusMap['IN TRANSIT']?.count || 0,
      outForDelivery: statusMap['OUT FOR DELIVERY']?.count || 0,
      codOrders: codOrders.count,
      codAmount: codOrders.totalAmount,
      prepaidOrders: prepaidOrders.count,
      prepaidAmount: prepaidOrders.totalAmount,
      statusDistribution: statusAgg,
      recentOrders,
    },
  });
});

// @desc    List ShipRocket orders (local DB, paginated)
// @route   GET /api/admin/shiprocket/orders
const getShiprocketOrders = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status, search, paymentType, startDate, endDate } = req.query;
  const filter = { shiprocketOrderId: { $exists: true, $ne: null } };

  if (status) filter.shiprocketStatus = new RegExp(status, 'i');
  if (paymentType === 'cod') filter.paymentMethod = 'cod';
  else if (paymentType === 'prepaid') filter.paymentMethod = { $ne: 'cod' };
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) filter.createdAt.$lte = new Date(endDate);
  }
  if (search) {
    filter.$or = [
      { orderNumber: new RegExp(search, 'i') },
      { awbCode: new RegExp(search, 'i') },
      { 'shippingAddress.fullName': new RegExp(search, 'i') },
      { courierName: new RegExp(search, 'i') },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [orders, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .select('orderNumber shippingAddress items total subtotal shippingCost paymentMethod paymentStatus orderStatus shiprocketOrderId shiprocketShipmentId awbCode courierName shiprocketStatus labelGenerated manifestGenerated pickupScheduled isReturn shiprocketLastSync createdAt'),
    Order.countDocuments(filter),
  ]);

  res.json({
    success: true,
    orders,
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
  });
});

// @desc    Sync a single order from ShipRocket API
// @route   POST /api/admin/shiprocket/orders/:orderId/sync
const syncOrderFromShiprocket = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.orderId);
  if (!order) { res.status(404); throw new Error('Order not found'); }
  if (!order.shiprocketOrderId) { res.status(400); throw new Error('Order has no ShipRocket ID'); }

  const { provider, config } = await getShiprocket(req);
  const srData = await provider.getOrder(order.shiprocketOrderId, config);

  const srOrder = srData.data || srData;
  const update = {
    shiprocketStatus: srOrder.status || order.shiprocketStatus,
    shiprocketLastSync: new Date(),
  };
  if (srOrder.awb_code) update.awbCode = srOrder.awb_code;
  if (srOrder.courier_name) update.courierName = srOrder.courier_name;
  if (srOrder.shipment_id) update.shiprocketShipmentId = srOrder.shipment_id;

  await Order.findByIdAndUpdate(order._id, update);
  const updated = await Order.findById(order._id);

  res.json({ success: true, order: updated });
});

// @desc    Bulk sync orders from ShipRocket
// @route   POST /api/admin/shiprocket/sync
const bulkSyncOrders = asyncHandler(async (req, res) => {
  const { provider, config } = await getShiprocket(req);
  let synced = 0;
  let page = 1;
  const perPage = 50;

  // Fetch up to 5 pages (250 orders max per sync)
  while (page <= 5) {
    const srData = await provider.listOrders({ page, per_page: perPage }, config);
    const srOrders = srData.data || [];
    if (!srOrders.length) break;

    for (const sr of srOrders) {
      const localOrder = await Order.findOne({ shiprocketOrderId: sr.id });
      if (localOrder) {
        await Order.findByIdAndUpdate(localOrder._id, {
          shiprocketStatus: sr.status || localOrder.shiprocketStatus,
          awbCode: sr.awb_code || localOrder.awbCode,
          courierName: sr.courier_name || localOrder.courierName,
          shiprocketShipmentId: sr.shipment_id || localOrder.shiprocketShipmentId,
          shiprocketLastSync: new Date(),
        });
        synced++;
      }
    }

    if (srOrders.length < perPage) break;
    page++;
  }

  res.json({ success: true, synced, message: `${synced} orders synced from ShipRocket` });
});

// @desc    Create ShipRocket shipment for a local order
// @route   POST /api/admin/shiprocket/ship
const createShiprocketShipment = asyncHandler(async (req, res) => {
  const { orderId, weight, length, breadth, height, courierId } = req.body;
  if (!orderId) { res.status(400); throw new Error('orderId is required'); }

  const order = await Order.findById(orderId).populate('items.product', 'title sku weight dimensions');
  if (!order) { res.status(404); throw new Error('Order not found'); }

  const { provider, config } = await getShiprocket(req);

  // Compute package dimensions from product data, allow admin override
  const pkg = calcPackageDimensions(order);

  // Create the order+shipment on ShipRocket
  const shipmentData = {
    orderId: order.orderNumber,
    customerName: order.shippingAddress.fullName,
    customerEmail: '',
    address: order.shippingAddress,
    items: order.items.map(i => ({
      title: i.title,
      sku: i.sku || i.title?.slice(0, 20),
      quantity: i.quantity,
      price: i.price,
    })),
    total: order.total,
    paymentMethod: order.paymentMethod,
    weight: weight || pkg.weight,
    length: length || pkg.length,
    breadth: breadth || pkg.breadth,
    height: height || pkg.height,
  };

  const result = await provider.createShipment(shipmentData, config);

  // Optionally assign courier
  let courierResult = null;
  if (courierId && result.shipmentId) {
    courierResult = await provider.assignCourier({ shipmentId: result.shipmentId, courierId }, config);
  }

  // Auto-assignment hook: if caller didn't pass a courierId, let the assignment
  // engine pick one based on preferences/rules (background, non-blocking).
  if (!courierId && result.shipmentId && !config.auto_assign_disabled) {
    try {
      const cache = require('../services/shipping/courierSettingsCache');
      const cfg = await cache.getAutoAssignConfig();
      if (cfg.enabled && cfg.onOrderCreate) {
        const { assignCourierToOrder } = require('../services/shipping/courierAssignment');
        // Persist shipment IDs to the order first so pickCourier can use them
        await Order.updateOne(
          { _id: orderId },
          {
            $set: {
              shiprocketOrderId: result.orderId,
              shiprocketShipmentId: result.shipmentId,
              shiprocketStatus: result.status || 'NEW',
            },
          },
        );
        const freshOrder = await Order.findById(orderId);
        setImmediate(() => {
          assignCourierToOrder(freshOrder, 'auto-order-create', { tenantId: req.tenant?._id || order.tenant }).catch(() => { /* logged in service */ });
        });
      }
    } catch (_) { /* non-fatal: hook is best-effort */ }
  }

  // Update local order
  const update = {
    shiprocketOrderId: result.orderId,
    shiprocketShipmentId: result.shipmentId,
    awbCode: courierResult?.response?.data?.awb_code || result.awbCode,
    courierName: courierResult?.response?.data?.courier_name || result.courierName,
    shiprocketStatus: result.status || 'NEW',
    orderStatus: 'shipped',
    trackingNumber: courierResult?.response?.data?.awb_code || result.awbCode,
    shiprocketLastSync: new Date(),
    $push: {
      statusHistory: {
        status: 'shipped',
        note: `Shipped via ShipRocket. AWB: ${courierResult?.response?.data?.awb_code || result.awbCode || 'pending'}`,
        updatedBy: req.user._id,
        updatedAt: new Date(),
      },
    },
  };

  await Order.findByIdAndUpdate(orderId, update);
  const updated = await Order.findById(orderId);

  res.json({ success: true, shipment: result, courier: courierResult, order: updated });
});

// @desc    Cancel a ShipRocket order
// @route   POST /api/admin/shiprocket/orders/:orderId/cancel
const cancelShiprocketOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.orderId);
  if (!order) { res.status(404); throw new Error('Order not found'); }
  if (!order.shiprocketOrderId) { res.status(400); throw new Error('Order has no ShipRocket ID'); }

  const { provider, config } = await getShiprocket(req);
  const result = await provider.cancelOrders([order.shiprocketOrderId], config);

  await Order.findByIdAndUpdate(order._id, {
    shiprocketStatus: 'CANCELLED',
    orderStatus: 'cancelled',
    cancelledAt: new Date(),
    cancellationReason: req.body.reason || 'Cancelled via ShipRocket dashboard',
    $push: {
      statusHistory: {
        status: 'cancelled',
        note: 'Cancelled via ShipRocket',
        updatedBy: req.user._id,
        updatedAt: new Date(),
      },
    },
  });

  res.json({ success: true, result });
});

// @desc    List shipments from ShipRocket API
// @route   GET /api/admin/shiprocket/shipments
const getShipments = asyncHandler(async (req, res) => {
  const { provider, config } = await getShiprocket(req);
  const result = await provider.listShipments(req.query, config);
  res.json({ success: true, ...result });
});

// @desc    Track by AWB
// @route   GET /api/admin/shiprocket/track/:awbCode
const trackShipment = asyncHandler(async (req, res) => {
  const { provider, config } = await getShiprocket(req);
  const result = await provider.trackShipment(req.params.awbCode, config);
  res.json({ success: true, tracking: result });
});

// @desc    Track by shipment ID
// @route   GET /api/admin/shiprocket/track/shipment/:shipmentId
const trackByShipmentId = asyncHandler(async (req, res) => {
  const { provider, config } = await getShiprocket(req);
  const result = await provider.trackByShipmentId(req.params.shipmentId, config);
  res.json({ success: true, tracking: result });
});

// @desc    Generate shipping label
// @route   POST /api/admin/shiprocket/labels
const generateLabel = asyncHandler(async (req, res) => {
  const { shipmentIds } = req.body;
  if (!shipmentIds?.length) { res.status(400); throw new Error('shipmentIds required'); }

  const { provider, config } = await getShiprocket(req);

  // Shiprocket requires shipment_id as array of numbers
  const ids = shipmentIds.map(id => Number(id));

  try {
    const result = await provider.generateLabel({ shipmentIds: ids }, config);

    await Order.updateMany(
      { shiprocketShipmentId: { $in: ids } },
      { labelGenerated: true }
    );

    // Shiprocket returns label_url or label_created
    const labelUrl = result.label_url || result.label_created || result.response?.label_url;
    res.json({ success: true, label_url: labelUrl, ...result });
  } catch (err) {
    const msg = err.response?.message || err.message || 'Label generation failed';
    // Common error: courier not assigned yet
    if (/courier|awb|assign/i.test(msg)) {
      res.status(400);
      throw new Error('Courier not assigned yet. Assign a courier before generating the label.');
    }
    throw err;
  }
});

// @desc    Generate manifest
// @route   POST /api/admin/shiprocket/manifests
const generateManifest = asyncHandler(async (req, res) => {
  const { shipmentIds } = req.body;
  if (!shipmentIds?.length) { res.status(400); throw new Error('shipmentIds required'); }

  const { provider, config } = await getShiprocket(req);
  const ids = shipmentIds.map(id => Number(id));

  try {
    const result = await provider.generateManifest({ shipmentIds: ids }, config);

    await Order.updateMany(
      { shiprocketShipmentId: { $in: ids } },
      { manifestGenerated: true }
    );

    const manifestUrl = result.manifest_url || result.response?.manifest_url;
    res.json({ success: true, manifest_url: manifestUrl, ...result });
  } catch (err) {
    const msg = err.response?.message || err.message || 'Manifest generation failed';
    if (/courier|awb|assign/i.test(msg)) {
      res.status(400);
      throw new Error('Courier not assigned yet. Assign a courier before generating the manifest.');
    }
    throw err;
  }
});

// @desc    Request pickup
// @route   POST /api/admin/shiprocket/pickup
const requestPickup = asyncHandler(async (req, res) => {
  const { shipmentId } = req.body;
  if (!shipmentId) { res.status(400); throw new Error('shipmentId required'); }

  const { provider, config } = await getShiprocket(req);
  const result = await provider.requestPickup({ shipmentId }, config);

  await Order.updateMany(
    { shiprocketShipmentId: Array.isArray(shipmentId) ? { $in: shipmentId } : shipmentId },
    { pickupScheduled: true }
  );

  res.json({ success: true, ...result });
});

// @desc    Assign courier to shipment
// @route   POST /api/admin/shiprocket/assign-courier
const assignCourier = asyncHandler(async (req, res) => {
  const { shipmentId, courierId } = req.body;
  if (!shipmentId || !courierId) { res.status(400); throw new Error('shipmentId and courierId required'); }

  const { provider, config } = await getShiprocket(req);
  const result = await provider.assignCourier({ shipmentId: Number(shipmentId), courierId: Number(courierId) }, config);

  // Check if assignment failed
  if (result?.awb_assign_status === 0 || result?.status_code >= 300) {
    const errMsg = result?.response?.data?.awb_assign_error || result?.message || 'Courier assignment failed';
    res.status(400);
    throw new Error(errMsg);
  }

  const awb = result?.response?.data?.awb_code || result?.data?.awb_code || result?.awb_code;
  const courierName = result?.response?.data?.courier_name || result?.data?.courier_name || result?.courier_name;

  if (awb || courierName) {
    const update = {};
    if (awb) { update.awbCode = awb; update.trackingNumber = awb; }
    if (courierName) update.courierName = courierName;
    update.courierCompanyId = Number(courierId);
    await Order.findOneAndUpdate({ shiprocketShipmentId: Number(shipmentId) }, update);
  }

  res.json({ success: true, awb_code: awb, courier_name: courierName });
});

// @desc    Rate calculator
// @route   POST /api/admin/shiprocket/rates
const getRates = asyncHandler(async (req, res) => {
  const { pickupPincode, deliveryPincode, weight, cod, declaredValue } = req.body;
  if (!deliveryPincode || !weight) { res.status(400); throw new Error('deliveryPincode and weight required'); }

  const { provider, config } = await getShiprocket(req);
  const rates = await provider.getRates({ pickupPincode, deliveryPincode, weight, cod: cod ? 1 : 0, declaredValue }, config);

  res.json({ success: true, rates });
});

// @desc    Get live Shiprocket courier options for a specific order
// @route   GET /api/admin/orders/:id/shipping-options
const getOrderShippingOptions = asyncHandler(async (req, res) => {
  const order = await loadAdminOrder(req);
  if (!order) { res.status(404); throw new Error('Order not found'); }
  if (order.awbCode) {
    return res.json({ success: true, alreadyShipped: true, couriers: [], rates: [], order });
  }
  if (!['confirmed', 'processing', 'packed', 'ready_to_ship'].includes(order.orderStatus)) {
    res.status(409);
    throw new Error('Order cannot be shipped from ' + order.orderStatus + ' status');
  }
  const deliveryPincode = String(order.shippingAddress?.pincode || '').replace(/\D/g, '');
  if (!validPincode(deliveryPincode)) {
    res.status(400);
    throw new Error('Order has an invalid delivery pincode');
  }

  const { provider, config } = await getShiprocket(req);
  const pkg = calcPackageDimensions(order);
  const pickupPincode = await resolvePickupPincode(provider, config);
  const rates = await provider.getRates({
    pickupPincode,
    deliveryPincode,
    weight: pkg.weight,
    declaredValue: order.total,
    cod: order.paymentMethod === 'cod' ? 1 : 0,
  }, config);

  res.json({
    success: true,
    alreadyShipped: false,
    order: {
      _id: order._id,
      orderNumber: order.orderNumber,
      total: order.total,
      paymentMethod: order.paymentMethod,
      shippingAddress: order.shippingAddress,
      orderStatus: order.orderStatus,
      shiprocketShipmentId: order.shiprocketShipmentId || null,
    },
    package: pkg,
    pickupPincode,
    deliveryPincode,
    couriers: rates,
    rates,
  });
});

// @desc    Create/assign the selected Shiprocket courier for an order
// @route   POST /api/admin/orders/:id/ship
const shipOrderWithCourier = asyncHandler(async (req, res) => {
  const courierId = Number(req.body?.courierId || req.body?.courierCompanyId);
  if (!Number.isInteger(courierId) || courierId <= 0) {
    res.status(400);
    throw new Error('A valid courierId is required');
  }

  let order = await loadAdminOrder(req);
  if (!order) { res.status(404); throw new Error('Order not found'); }
  if (order.awbCode) {
    res.status(409);
    throw new Error('A courier is already assigned to this order');
  }
  if (!['confirmed', 'processing', 'packed', 'ready_to_ship'].includes(order.orderStatus)) {
    res.status(409);
    throw new Error('Order cannot be shipped from ' + order.orderStatus + ' status');
  }

  const { provider, config } = await getShiprocket(req);
  let shipment = {
    orderId: order.shiprocketOrderId,
    shipmentId: order.shiprocketShipmentId,
    awbCode: order.awbCode,
    courierName: order.courierName,
    status: order.shiprocketStatus,
  };

  if (!shipment.shipmentId) {
    const pkg = calcPackageDimensions(order);
    const created = await provider.createShipment(shipmentDataForOrder(order, pkg), config);
    if (!created?.shipmentId) {
      res.status(502);
      throw new Error('Shiprocket did not return a shipment ID');
    }
    shipment = { ...shipment, ...created };
    await Order.updateOne(orderFilterFor(req, order._id), {
      $set: {
        shippingProvider: 'shiprocket',
        shippingExternalOrderId: String(created.orderId || ''),
        shippingExternalShipmentId: String(created.shipmentId || ''),
        shiprocketOrderId: created.orderId,
        shiprocketShipmentId: created.shipmentId,
        shiprocketStatus: created.status || 'NEW',
        shippingStatus: 'created',
        shiprocketLastSync: new Date(),
      },
    });
  }

  const assignment = await provider.assignCourier({ shipmentId: Number(shipment.shipmentId), courierId }, config);
  if (assignment?.awb_assign_status === 0 || assignment?.status_code >= 300) {
    const message = assignment?.response?.data?.awb_assign_error || assignment?.message || 'Courier assignment failed';
    res.status(400);
    throw new Error(message);
  }
  const assigned = courierResultFields(assignment, courierId);
  const assignedStatus = assigned.awb ? 'shipped' : 'ready_to_ship';
  await Order.updateOne(orderFilterFor(req, order._id), {
    $set: {
      shippingProvider: 'shiprocket',
      shippingExternalOrderId: String(shipment.orderId || ''),
      shippingExternalShipmentId: String(shipment.shipmentId || ''),
      shiprocketOrderId: shipment.orderId,
      shiprocketShipmentId: shipment.shipmentId,
      ...(assigned.awb ? { awbCode: assigned.awb, trackingNumber: assigned.awb } : {}),
      ...(assigned.courierName ? { courierName: assigned.courierName } : {}),
      courierCompanyId: courierId,
      shiprocketStatus: assignment?.status || 'ASSIGNED',
      shippingStatus: assigned.awb ? 'assigned' : 'created',
      shippingLastSync: new Date(),
    },
  });

  const transition = await orderLifecycleService.transitionOrderStatus({
    orderId: order._id,
    status: assignedStatus,
    note: 'Shipping started via ' + (assigned.courierName || ('courier ' + courierId)) + (assigned.awb ? '. AWB: ' + assigned.awb : ''),
    trackingNumber: assigned.awb || undefined,
    tenant: req.tenant?._id,
    actorId: req.user._id,
  });
  order = transition.order;

  res.json({
    success: true,
    courier: { courierId, name: assigned.courierName, awbCode: assigned.awb },
    shipment,
    assignment,
    order,
    idempotent: transition.idempotent,
  });
});

// @desc    Get pickup locations
// @route   GET /api/admin/shiprocket/pickup-locations
const getPickupLocations = asyncHandler(async (req, res) => {
  const { provider, config } = await getShiprocket(req);
  const result = await provider.getPickupLocations(config);
  res.json({ success: true, ...result });
});

// @desc    Add pickup location
// @route   POST /api/admin/shiprocket/pickup-locations
const addPickupLocation = asyncHandler(async (req, res) => {
  const { provider, config } = await getShiprocket(req);
  const result = await provider.addPickupLocation(req.body, config);
  res.json({ success: true, ...result });
});

// @desc    Create return order
// @route   POST /api/admin/shiprocket/returns
const createReturn = asyncHandler(async (req, res) => {
  const { orderId } = req.body;
  const { provider, config } = await getShiprocket(req);
  const result = await provider.createReturnOrder(req.body, config);

  if (orderId) {
    await Order.findByIdAndUpdate(orderId, {
      isReturn: true,
      shiprocketStatus: 'RETURN CREATED',
      $push: {
        statusHistory: {
          status: 'returned',
          note: 'Return order created via ShipRocket',
          updatedBy: req.user._id,
          updatedAt: new Date(),
        },
      },
    });
  }

  res.json({ success: true, ...result });
});

// @desc    Get NDR/RTO shipments
// @route   GET /api/admin/shiprocket/ndr
const getNDRShipments = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const filter = {
    shiprocketOrderId: { $exists: true, $ne: null },
    $or: [
      { shiprocketStatus: { $in: ['NDR', 'RTO INITIATED', 'RTO DELIVERED', 'RTO Initiated', 'RTO Delivered', 'LOST', 'DAMAGED'] } },
      { isReturn: true },
    ],
  };

  const skip = (Number(page) - 1) * Number(limit);
  const [orders, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit))
      .select('orderNumber shippingAddress total paymentMethod shiprocketOrderId shiprocketShipmentId awbCode courierName shiprocketStatus isReturn createdAt'),
    Order.countDocuments(filter),
  ]);

  res.json({
    success: true,
    orders,
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
  });
});

// @desc    Get channels
// @route   GET /api/admin/shiprocket/channels
const getChannels = asyncHandler(async (req, res) => {
  const { provider, config } = await getShiprocket(req);
  const result = await provider.getChannels(config);
  res.json({ success: true, ...result });
});

// @desc    Get COD orders
// @route   GET /api/admin/shiprocket/cod
const getCODOrders = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, deliveryStatus } = req.query;
  const filter = {
    shiprocketOrderId: { $exists: true, $ne: null },
    paymentMethod: 'cod',
  };
  if (deliveryStatus) filter.shiprocketStatus = new RegExp(deliveryStatus, 'i');

  const skip = (Number(page) - 1) * Number(limit);
  const [orders, total, codStats] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit))
      .select('orderNumber shippingAddress total paymentStatus shiprocketOrderId awbCode courierName shiprocketStatus createdAt'),
    Order.countDocuments(filter),
    Order.aggregate([
      { $match: { shiprocketOrderId: { $exists: true, $ne: null }, paymentMethod: 'cod' } },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalAmount: { $sum: '$total' },
          delivered: { $sum: { $cond: [{ $in: ['$shiprocketStatus', ['DELIVERED', 'delivered']] }, 1, 0] } },
          deliveredAmount: { $sum: { $cond: [{ $in: ['$shiprocketStatus', ['DELIVERED', 'delivered']] }, '$total', 0] } },
          pending: { $sum: { $cond: [{ $not: { $in: ['$shiprocketStatus', ['DELIVERED', 'delivered', 'CANCELLED', 'cancelled']] } }, 1, 0] } },
          pendingAmount: { $sum: { $cond: [{ $not: { $in: ['$shiprocketStatus', ['DELIVERED', 'delivered', 'CANCELLED', 'cancelled']] } }, '$total', 0] } },
        },
      },
    ]),
  ]);

  res.json({
    success: true,
    orders,
    stats: codStats[0] || { totalOrders: 0, totalAmount: 0, delivered: 0, deliveredAmount: 0, pending: 0, pendingAmount: 0 },
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
  });
});

// @desc    Generate invoice
// @route   POST /api/admin/shiprocket/invoice
const generateInvoice = asyncHandler(async (req, res) => {
  const { orderIds } = req.body;
  if (!orderIds?.length) { res.status(400); throw new Error('orderIds required'); }

  const { provider, config } = await getShiprocket(req);
  const result = await provider.generateInvoice({ orderIds }, config);
  res.json({ success: true, ...result });
});

module.exports = {
  getDashboardStats,
  getShiprocketOrders,
  syncOrderFromShiprocket,
  bulkSyncOrders,
  createShiprocketShipment,
  cancelShiprocketOrder,
  getShipments,
  trackShipment,
  trackByShipmentId,
  generateLabel,
  generateManifest,
  requestPickup,
  assignCourier,
  getRates,
  getOrderShippingOptions,
  shipOrderWithCourier,
  getPickupLocations,
  addPickupLocation,
  createReturn,
  getNDRShipments,
  getChannels,
  getCODOrders,
  generateInvoice,
};
