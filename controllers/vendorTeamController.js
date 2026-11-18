const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const VendorMember = require('../models/VendorMember');
const Notification = require('../models/Notification');
const { writeAudit } = require('../services/vendorAuditService');

const MANAGER_ROLES = ['owner', 'manager'];

const isManager = (req) => {
  // Store owner always manages the team; invited managers share access.
  if (req.vendorMembership) return MANAGER_ROLES.includes(req.vendorMembership.role);
  return true;
};

const requireManager = (req, res) => {
  if (!isManager(req)) {
    res.status(403);
    throw new Error('Only the store owner or managers can manage the team');
  }
};

// @desc    List team members of the authenticated vendor
// @route   GET /api/vendor/team
const listTeam = asyncHandler(async (req, res) => {
  const members = await VendorMember.find({ vendor: req.vendor._id })
    .populate('user', 'name email phone role')
    .populate('invitedBy', 'name email')
    .sort({ createdAt: 1 });
  res.json({
    success: true,
    data: {
      owner: req.vendor.owner,
      members,
      actingAs: req.vendorMembership ? req.vendorMembership.role : 'owner',
    },
  });
});

// @desc    Invite a user to the vendor team by email
// @route   POST /api/vendor/team/invite
const inviteMember = asyncHandler(async (req, res) => {
  requireManager(req, res);
  const { email, role = 'staff', permissions = [] } = req.body || {};
  if (!['manager', 'staff'].includes(role)) {
    res.status(422);
    throw new Error('Role must be manager or staff');
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email).trim())) {
    res.status(422);
    throw new Error('A valid email address is required');
  }
  const user = await User.findOne({ email: String(email).trim().toLowerCase() });
  if (!user) {
    res.status(404);
    throw new Error('No account uses this email yet. Ask them to register first, then invite again.');
  }
  if (String(user._id) === String(req.vendor.owner)) {
    res.status(400);
    throw new Error('This user already owns the store');
  }
  const existing = await VendorMember.findOne({ vendor: req.vendor._id, user: user._id });
  if (existing) {
    res.status(409);
    throw new Error('This user is already on the team');
  }
  const member = await VendorMember.create({
    vendor: req.vendor._id,
    tenant: req.vendor.tenant,
    user: user._id,
    role,
    permissions: Array.isArray(permissions) ? permissions.map(String).slice(0, 30) : [],
    invitedBy: req.user._id,
    status: 'invited',
  });
  await writeAudit({
    tenant: req.vendor.tenant, vendorId: req.vendor._id, actorId: req.user._id,
    action: 'team_change', note: `Invited ${user.email} as ${role}`,
  });
  try {
    await Notification.create({
      tenant: req.vendor.tenant,
      title: `You were invited to ${req.vendor.storeName}`,
      message: `You can now help manage ${req.vendor.storeName} as ${role}. Open the seller portal to accept.`,
      type: 'system',
      target: 'specific',
      targetUsers: [user._id],
      status: 'sent',
      sentAt: new Date(),
      data: { kind: 'vendor_team_invite', vendorId: req.vendor._id },
    });
  } catch (error) {
    console.error('Team invite notification failed:', error.message);
  }
  res.status(201).json({ success: true, data: member });
});

// @desc    Accept your own pending team invitation
// @route   POST /api/vendor/team/accept
const acceptInvite = asyncHandler(async (req, res) => {
  const { vendorId } = req.body || {};
  const query = { user: req.user._id, status: 'invited' };
  if (vendorId) query.vendor = vendorId;
  const member = await VendorMember.findOne(query).populate('vendor', 'storeName status');
  if (!member) {
    res.status(404);
    throw new Error('No pending team invitation found');
  }
  if (member.vendor?.status !== 'active') {
    res.status(403);
    throw new Error('This store is not active yet');
  }
  member.status = 'active';
  await member.save();
  await writeAudit({
    tenant: member.tenant, vendorId: member.vendor._id, actorId: req.user._id,
    action: 'team_change', note: 'Invitation accepted',
  });
  res.json({ success: true, data: member });
});

// @desc    Update a team member's role / permissions / status
// @route   PUT /api/vendor/team/:id
const updateMember = asyncHandler(async (req, res) => {
  requireManager(req, res);
  const member = await VendorMember.findOne({ _id: req.params.id, vendor: req.vendor._id });
  if (!member) { res.status(404); throw new Error('Team member not found'); }
  const { role, permissions, status } = req.body || {};
  if (role !== undefined) {
    if (!['manager', 'staff'].includes(role)) { res.status(422); throw new Error('Role must be manager or staff'); }
    member.role = role;
  }
  if (permissions !== undefined) {
    if (!Array.isArray(permissions)) { res.status(422); throw new Error('Permissions must be an array'); }
    member.permissions = permissions.map(String).slice(0, 30);
  }
  if (status !== undefined) {
    if (!['active', 'inactive', 'invited'].includes(status)) { res.status(422); throw new Error('Invalid status'); }
    member.status = status;
  }
  await member.save();
  await writeAudit({
    tenant: req.vendor.tenant, vendorId: req.vendor._id, actorId: req.user._id,
    action: 'team_change', note: `Updated team member ${member._id}`,
    after: { role: member.role, status: member.status },
  });
  res.json({ success: true, data: member });
});

// @desc    Remove a team member
// @route   DELETE /api/vendor/team/:id
const removeMember = asyncHandler(async (req, res) => {
  requireManager(req, res);
  const member = await VendorMember.findOneAndDelete({ _id: req.params.id, vendor: req.vendor._id });
  if (!member) { res.status(404); throw new Error('Team member not found'); }
  await writeAudit({
    tenant: req.vendor.tenant, vendorId: req.vendor._id, actorId: req.user._id,
    action: 'team_change', note: `Removed team member ${member._id}`,
  });
  res.json({ success: true, message: 'Team member removed' });
});

module.exports = { listTeam, inviteMember, acceptInvite, updateMember, removeMember };
