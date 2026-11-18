const asyncHandler = require('express-async-handler');
const crypto = require('crypto');
const SupportTicket = require('../models/SupportTicket');
const Order = require('../models/Order');
const User = require('../models/User');
const { parsePagination } = require('../utils/pagination');

const tenantFilter = req => ({ tenant: req.tenant._id });
const allowedStatuses = new Set(['open', 'in_progress', 'waiting_customer', 'resolved', 'closed']);
const allowedPriorities = new Set(['low', 'normal', 'high', 'urgent']);
const allowedCategories = new Set(['general', 'order', 'payment', 'shipping', 'return', 'product', 'account']);

const supportError = (message, statusCode = 400, publicCode = 'SUPPORT_INVALID') => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.publicCode = publicCode;
  return error;
};

const makeTicketNumber = () => `TAT-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

const normalizeText = (value, field, max) => {
  const text = String(value || '').trim();
  if (!text || text.length > max) throw supportError(`${field} is required and must be at most ${max} characters`);
  return text;
};

const resolveOrder = async ({ req, orderId, customerOnly = false }) => {
  if (!orderId) return null;
  const order = await Order.findOne({ _id: orderId, tenant: req.tenant._id, ...(customerOnly ? { user: req.user._id } : {}) }).select('_id orderNumber user tenant');
  if (!order) throw supportError('Order not found in this store', 404, 'SUPPORT_ORDER_NOT_FOUND');
  return order;
};

const safeMessage = message => ({
  _id: message._id,
  authorRole: message.authorRole,
  body: message.body,
  internal: Boolean(message.internal),
  createdAt: message.createdAt,
  author: message.author && typeof message.author === 'object' ? { _id: message.author._id, name: message.author.name, email: message.author.email } : message.author,
});

const safeTicket = (ticket, { customer = false } = {}) => {
  const value = ticket.toObject ? ticket.toObject() : { ...ticket };
  if (Array.isArray(value.messages)) {
    value.messages = value.messages
      .filter(message => !customer || !message.internal)
      .map(safeMessage);
  }
  if (customer) {
    delete value.external;
    delete value.assignedTo;
  }
  return value;
};

const appendMessage = async ({ ticket, req, body, internal = false, authorRole }) => {
  const text = normalizeText(body, 'Message', 4000);
  ticket.messages.push({ author: req.user._id, authorRole, body: text, internal: Boolean(internal) });
  ticket.lastRespondedAt = new Date();
  if (authorRole === 'customer') ticket.status = 'open';
  else if (!internal && ticket.status !== 'closed') ticket.status = 'waiting_customer';
  await ticket.save();
  return ticket;
};

const createTicket = asyncHandler(async (req, res) => {
  const subject = normalizeText(req.body?.subject, 'Subject', 160);
  const body = normalizeText(req.body?.message, 'Message', 4000);
  const category = String(req.body?.category || 'general').toLowerCase();
  if (!allowedCategories.has(category)) throw supportError('Invalid support category');
  const order = await resolveOrder({ req, orderId: req.body?.orderId, customerOnly: true });
  const ticket = await SupportTicket.create({
    tenant: req.tenant._id,
    ticketNumber: makeTicketNumber(),
    user: req.user._id,
    order: order?._id || null,
    subject,
    category,
    priority: 'normal',
    messages: [{ author: req.user._id, authorRole: 'customer', body, internal: false }],
  });
  res.status(201).json({ success: true, ticket: safeTicket(ticket, { customer: true }) });
});

const listCustomerTickets = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 50 });
  const filter = { ...tenantFilter(req), user: req.user._id };
  if (req.query.status && allowedStatuses.has(String(req.query.status))) filter.status = String(req.query.status);
  const [tickets, total] = await Promise.all([
    SupportTicket.find(filter).populate('order', 'orderNumber orderStatus').sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
    SupportTicket.countDocuments(filter),
  ]);
  res.json({ success: true, tickets: tickets.map(ticket => safeTicket(ticket, { customer: true })), pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

const getCustomerTicket = asyncHandler(async (req, res) => {
  const ticket = await SupportTicket.findOne({ ...tenantFilter(req), _id: req.params.id, user: req.user._id })
    .populate('order', 'orderNumber orderStatus paymentStatus total')
    .populate('messages.author', 'name email');
  if (!ticket) { res.status(404); throw supportError('Support ticket not found', 404, 'SUPPORT_TICKET_NOT_FOUND'); }
  res.json({ success: true, ticket: safeTicket(ticket, { customer: true }) });
});

const replyCustomerTicket = asyncHandler(async (req, res) => {
  const ticket = await SupportTicket.findOne({ ...tenantFilter(req), _id: req.params.id, user: req.user._id });
  if (!ticket) { res.status(404); throw supportError('Support ticket not found', 404, 'SUPPORT_TICKET_NOT_FOUND'); }
  if (ticket.status === 'closed') throw supportError('Closed tickets cannot receive new replies', 409, 'SUPPORT_TICKET_CLOSED');
  await appendMessage({ ticket, req, body: req.body?.message, authorRole: 'customer' });
  res.json({ success: true, ticket: safeTicket(ticket, { customer: true }) });
});

const listAdminTickets = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });
  const filter = { ...tenantFilter(req) };
  if (req.query.status && allowedStatuses.has(String(req.query.status))) filter.status = String(req.query.status);
  if (req.query.priority && allowedPriorities.has(String(req.query.priority))) filter.priority = String(req.query.priority);
  if (req.query.category && allowedCategories.has(String(req.query.category))) filter.category = String(req.query.category);
  const search = String(req.query.search || '').trim().slice(0, 100);
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const users = await User.find({ $or: [{ name: { $regex: escaped, $options: 'i' } }, { email: { $regex: escaped, $options: 'i' } }] }).select('_id').lean();
    filter.$or = [
      { ticketNumber: { $regex: escaped, $options: 'i' } },
      { subject: { $regex: escaped, $options: 'i' } },
      { user: { $in: users.map(user => user._id) } },
    ];
  }
  const [tickets, total] = await Promise.all([
    SupportTicket.find(filter)
      .populate('user', 'name email phone')
      .populate('order', 'orderNumber orderStatus total')
      .populate('assignedTo', 'name email')
      .sort({ priority: -1, updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    SupportTicket.countDocuments(filter),
  ]);
  res.json({ success: true, tickets: tickets.map(ticket => safeTicket(ticket)), pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});

const getAdminTicket = asyncHandler(async (req, res) => {
  const ticket = await SupportTicket.findOne({ ...tenantFilter(req), _id: req.params.id })
    .populate('user', 'name email phone')
    .populate('order', 'orderNumber orderStatus paymentStatus total shippingAddress')
    .populate('assignedTo', 'name email')
    .populate('messages.author', 'name email');
  if (!ticket) { res.status(404); throw supportError('Support ticket not found', 404, 'SUPPORT_TICKET_NOT_FOUND'); }
  res.json({ success: true, ticket: safeTicket(ticket) });
});

const updateAdminTicket = asyncHandler(async (req, res) => {
  const ticket = await SupportTicket.findOne({ ...tenantFilter(req), _id: req.params.id });
  if (!ticket) { res.status(404); throw supportError('Support ticket not found', 404, 'SUPPORT_TICKET_NOT_FOUND'); }
  const { status, priority, category, assignedTo, tags } = req.body || {};
  if (status !== undefined) {
    if (!allowedStatuses.has(String(status))) throw supportError('Invalid support ticket status');
    ticket.status = String(status);
    ticket.closedAt = ['resolved', 'closed'].includes(ticket.status) ? new Date() : null;
  }
  if (priority !== undefined) {
    if (!allowedPriorities.has(String(priority))) throw supportError('Invalid support ticket priority');
    ticket.priority = String(priority);
  }
  if (category !== undefined) {
    if (!allowedCategories.has(String(category))) throw supportError('Invalid support category');
    ticket.category = String(category);
  }
  if (assignedTo !== undefined) {
    if (assignedTo === null || assignedTo === '') ticket.assignedTo = null;
    else {
      const assignee = await User.findOne({ _id: assignedTo, role: { $in: ['admin', 'superadmin'] }, isActive: true }).select('_id');
      if (!assignee) throw supportError('Assignee must be an active administrator', 404, 'SUPPORT_ASSIGNEE_NOT_FOUND');
      ticket.assignedTo = assignee._id;
    }
  }
  if (tags !== undefined) {
    if (!Array.isArray(tags) || tags.length > 20) throw supportError('Tags must be an array of at most 20 values');
    ticket.tags = tags.map(tag => String(tag).trim()).filter(Boolean).slice(0, 20);
  }
  await ticket.save();
  res.json({ success: true, ticket: safeTicket(ticket) });
});

const replyAdminTicket = asyncHandler(async (req, res) => {
  const ticket = await SupportTicket.findOne({ ...tenantFilter(req), _id: req.params.id });
  if (!ticket) { res.status(404); throw supportError('Support ticket not found', 404, 'SUPPORT_TICKET_NOT_FOUND'); }
  if (ticket.status === 'closed') throw supportError('Closed tickets cannot receive new replies', 409, 'SUPPORT_TICKET_CLOSED');
  await appendMessage({ ticket, req, body: req.body?.message, internal: req.body?.internal === true, authorRole: 'admin' });
  res.json({ success: true, ticket: safeTicket(ticket) });
});

module.exports = {
  createTicket,
  listCustomerTickets,
  getCustomerTicket,
  replyCustomerTicket,
  listAdminTickets,
  getAdminTicket,
  updateAdminTicket,
  replyAdminTicket,
};
