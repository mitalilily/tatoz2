const { catalog, registerAdapter, getAdapter } = require('./providerRegistry');

const contractProviders = Object.values(catalog).filter(definition => definition.lifecycle === 'contract');
for (const definition of contractProviders) {
  if (getAdapter(definition.id)) continue;
  const methods = definition.category === 'shipping'
    ? ['getRates', 'createShipment', 'trackShipment', 'cancelShipment', 'testConnection']
    : definition.category === 'compliance'
      ? ['createInvoice', 'createEInvoice', 'createEwayBill', 'testConnection']
      : definition.category === 'marketplace'
        ? ['authorize', 'sync', 'testConnection']
        : definition.category === 'support'
          ? ['createTicket', 'updateTicket', 'testConnection']
          : definition.category === 'fraud'
            ? ['score', 'testConnection']
            : ['sync', 'testConnection'];
  const adapter = { activation: 'contract', contractMethods: methods };
  for (const method of methods) adapter[method] = async () => { throw new Error(`${definition.name} adapter contract is ready; sandbox activation is required`); };
  registerAdapter(definition.id, adapter);
}

module.exports = { contractProviders };
