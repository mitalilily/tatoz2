const STAFF_ROLES = ['owner', 'admin', 'manager', 'finance', 'operations', 'readonly'];

const PERMISSION_CATALOG = [
  { id: 'dashboard.read', label: 'Dashboard and analytics' },
  { id: 'reports.read', label: 'Reports and exports' },
  { id: 'catalog.read', label: 'Catalog read' },
  { id: 'catalog.write', label: 'Catalog write' },
  { id: 'inventory.read', label: 'Inventory read' },
  { id: 'inventory.write', label: 'Inventory write' },
  { id: 'orders.read', label: 'Orders read' },
  { id: 'orders.write', label: 'Orders write' },
  { id: 'customers.read', label: 'Customers read' },
  { id: 'customers.write', label: 'Customers write' },
  { id: 'finance.read', label: 'Finance read' },
  { id: 'finance.write', label: 'Finance write' },
  { id: 'shipping.read', label: 'Shipping read' },
  { id: 'shipping.write', label: 'Shipping write' },
  { id: 'marketing.read', label: 'Marketing read' },
  { id: 'marketing.write', label: 'Marketing write' },
  { id: 'content.read', label: 'Content read' },
  { id: 'content.write', label: 'Content write' },
  { id: 'marketplace.read', label: 'Marketplace read' },
  { id: 'marketplace.write', label: 'Marketplace write' },
  { id: 'support.read', label: 'Support read' },
  { id: 'support.write', label: 'Support write' },
  { id: 'security.read', label: 'Security audit read' },
  { id: 'settings.read', label: 'Store settings read' },
  { id: 'settings.write', label: 'Store settings write' },
  { id: 'integrations.read', label: 'Integrations read' },
  { id: 'integrations.write', label: 'Integrations write' },
  { id: 'staff.read', label: 'Staff read' },
  { id: 'staff.manage', label: 'Staff management' },
];

const PERMISSION_IDS = new Set(PERMISSION_CATALOG.map(permission => permission.id));

const ROLE_DEFAULTS = {
  owner: ['*'],
  admin: ['*'],
  manager: ['*'],
  finance: ['dashboard.read', 'reports.read', 'orders.read', 'customers.read', 'finance.read', 'finance.write', 'staff.read'],
  operations: ['dashboard.read', 'reports.read', 'catalog.read', 'catalog.write', 'inventory.read', 'inventory.write', 'orders.read', 'orders.write', 'customers.read', 'shipping.read', 'shipping.write', 'support.read', 'support.write'],
  readonly: ['dashboard.read', 'reports.read', 'catalog.read', 'inventory.read', 'orders.read', 'customers.read', 'shipping.read', 'support.read'],
};

const normalizePermissions = permissions => {
  if (!Array.isArray(permissions)) return [];
  return Array.from(new Set(permissions.map(value => String(value || '').trim()).filter(value => PERMISSION_IDS.has(value) || value === '*')));
};

const rolePermissions = membership => {
  if (!membership) return [];
  const explicit = normalizePermissions(membership.permissions);
  return explicit.length ? explicit : (ROLE_DEFAULTS[membership.role] || []);
};

const hasPermission = (membership, permission) => {
  const permissions = rolePermissions(membership);
  if (permissions.includes('*') || permissions.includes(permission)) return true;
  const [resource, action] = String(permission || '').split('.');
  return action === 'read' && permissions.includes(`${resource}.write`);
};

const requestPermission = (req) => {
  const pathname = String(req.path || req.url || '').split('?')[0];
  const method = String(req.method || 'GET').toUpperCase();
  const write = !['GET', 'HEAD', 'OPTIONS'].includes(method);
  const rule = (pattern, readPermission, writePermission = readPermission) => ({ pattern, permission: write ? writePermission : readPermission });

  const rules = [
    rule(/^\/staff(?:\/|$)/, 'staff.read', 'staff.manage'),
    rule(/^\/security-events(?:\/|$)/, 'security.read'),
    rule(/^\/(?:dashboard|analytics)(?:\/|$)/, 'dashboard.read'),
    rule(/^\/reports(?:\/|$)/, 'reports.read'),
    rule(/^\/(?:products|categories|brands|questions)(?:\/|$)/, 'catalog.read', 'catalog.write'),
    rule(/^\/(?:inventory|warehouses|warehouse-transfers)(?:\/|$)/, 'inventory.read', 'inventory.write'),
    rule(/^\/(?:orders|returns|preorders|subscription-plans)(?:\/|$)/, 'orders.read', 'orders.write'),
    rule(/^\/(?:invoices|invoice-notes|tax|wallets|loyalty|gift-cards|payouts|affiliate|refunds)(?:\/|$)/, 'finance.read', 'finance.write'),
    rule(/^\/(?:shipping-rules|shipping-zones|shipping-rates|serviceable-pincodes|pincodes|shiprocket|shipping|shipping-operations|shipping-providers|couriers|shipments)(?:\/|$)/, 'shipping.read', 'shipping.write'),
    rule(/^\/(?:coupons|referral|notifications|product-intents|abandoned-carts)(?:\/|$)/, 'marketing.read', 'marketing.write'),
    rule(/^\/(?:pages|page-blocks|templates|blog|legal-pages|customization|storage|seo)(?:\/|$)/, 'content.read', 'content.write'),
    rule(/^\/(?:support|conversations)(?:\/|$)/, 'support.read', 'support.write'),
    rule(/^\/(?:marketplace|vendors|b2b)(?:\/|$)/, 'marketplace.read', 'marketplace.write'),
    rule(/^\/(?:integrations|modules)(?:\/|$)/, 'integrations.read', 'integrations.write'),
    rule(/^\/(?:settings|storefront-locale|cod-policy|locale-currency|auth-policy)(?:\/|$)/, 'settings.read', 'settings.write'),
  ];

  return rules.find(candidate => candidate.pattern.test(pathname))?.permission || 'dashboard.read';
};

const validateStaffRole = role => {
  const normalized = String(role || '').trim().toLowerCase();
  if (!STAFF_ROLES.includes(normalized)) {
    const error = new Error('Invalid tenant staff role');
    error.statusCode = 400;
    error.publicCode = 'STAFF_ROLE_INVALID';
    throw error;
  }
  return normalized;
};

const validatePermissions = permissions => {
  const normalized = normalizePermissions(permissions);
  if (Array.isArray(permissions) && normalized.length !== new Set(permissions.map(value => String(value || '').trim()).filter(Boolean)).size) {
    const error = new Error('One or more staff permissions are invalid');
    error.statusCode = 400;
    error.publicCode = 'STAFF_PERMISSION_INVALID';
    throw error;
  }
  return normalized;
};

const enforceTenantPermission = (req, res, next) => {
  if (['admin', 'superadmin'].includes(req.user?.role)) return next();
  const membership = req.tenantMembership;
  const permission = requestPermission(req);
  if (req.user?.role !== 'staff' || !membership || membership.status !== 'active' || !hasPermission(membership, permission)) {
    res.status(403);
    const error = new Error(`Tenant permission required: ${permission}`);
    error.publicCode = 'TENANT_PERMISSION_REQUIRED';
    return next(error);
  }
  return next();
};

module.exports = {
  STAFF_ROLES,
  PERMISSION_CATALOG,
  ROLE_DEFAULTS,
  normalizePermissions,
  rolePermissions,
  hasPermission,
  requestPermission,
  validateStaffRole,
  validatePermissions,
  enforceTenantPermission,
};
