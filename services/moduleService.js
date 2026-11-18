const TenantModule = require('../models/TenantModule');
const IntegrationConnection = require('../models/IntegrationConnection');
const { catalog, getProviderDefinition, getAdapter } = require('./integrations/providerRegistry');
require('./integrations/registerBuiltins');
require('./integrations/contractAdapters');

const normalize = value => String(value || '').trim().toLowerCase();

const getDefinition = moduleId => getProviderDefinition(normalize(moduleId));

const getStates = async tenantId => {
  if (!tenantId) return new Map();
  const records = await TenantModule.find({ tenant: tenantId }).lean();
  return new Map(records.map(record => [record.module, Boolean(record.enabled)]));
};

const getState = async (tenantId, moduleId) => {
  if (!tenantId) return undefined;
  const id = getDefinition(moduleId).id;
  const record = await TenantModule.findOne({ tenant: tenantId, module: id }).select('enabled').lean();
  return record ? Boolean(record.enabled) : undefined;
};

const hasConfiguredCredentials = connection => {
  if (!connection) return false;
  if (Object.values(connection.credentialHints || {}).some(value => value === 'configured')) return true;
  return connection.status === 'connected';
};

const adapterIsAvailable = definition => {
  const adapter = getAdapter(definition.id);
  return Boolean(adapter && adapter.activation !== 'contract');
};

const toPublic = (definition, connection, moduleState) => {
  const connectionEnabled = Boolean(connection?.enabled);
  const configured = hasConfiguredCredentials(connection);
  const enabled = moduleState === undefined ? connectionEnabled : Boolean(moduleState);
  const adapterAvailable = adapterIsAvailable(definition);
  const operational = Boolean(enabled && connectionEnabled && configured && adapterAvailable);
  let status = 'disabled';
  if (enabled && !connection) status = 'setup_required';
  else if (enabled && !connectionEnabled) status = 'integration_disabled';
  else if (enabled && !configured) status = 'setup_required';
  else if (enabled && !adapterAvailable) status = 'adapter_pending';
  else if (operational) status = 'ready';

  return {
    id: definition.id,
    name: definition.name,
    category: definition.category,
    lifecycle: definition.lifecycle,
    capabilities: definition.capabilities,
    description: definition.description || `${definition.name} integration`,
    enabled,
    moduleEnabled: enabled,
    connectionEnabled,
    configured,
    operational,
    status,
    adapterAvailable,
    fieldsCount: (definition.fields || []).length,
    updatedAt: moduleState !== undefined ? null : (connection?.updatedAt || null),
  };
};

const listPublic = async tenant => {
  if (!tenant) return Object.values(catalog).map(definition => toPublic(definition, null, undefined));
  const [connections, states] = await Promise.all([
    IntegrationConnection.find({ tenant: tenant._id }).select('provider enabled status credentialHints updatedAt').lean(),
    getStates(tenant._id),
  ]);
  const byProvider = new Map(connections.map(connection => [connection.provider, connection]));
  return Object.values(catalog).map(definition => toPublic(definition, byProvider.get(definition.id), states.has(definition.id) ? states.get(definition.id) : undefined));
};

const setEnabled = async (tenant, moduleId, enabled, updatedBy) => {
  if (!tenant?._id) throw new Error('Tenant context is required');
  const definition = getDefinition(moduleId);
  await TenantModule.findOneAndUpdate(
    { tenant: tenant._id, module: definition.id },
    { $set: { enabled: Boolean(enabled), updatedBy }, $setOnInsert: { tenant: tenant._id, module: definition.id } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  const modules = await listPublic(tenant);
  return modules.find(module => module.id === definition.id);
};

const clearState = async (tenant, moduleId) => {
  if (!tenant?._id) return;
  const definition = getDefinition(moduleId);
  await TenantModule.deleteOne({ tenant: tenant._id, module: definition.id });
};

module.exports = { catalog, getDefinition, getStates, getState, listPublic, setEnabled, clearState };
