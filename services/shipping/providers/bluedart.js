const httpRequest = require('../../../utils/httpRequest');

const text = value => String(value ?? '').trim();
const required = (value, label) => {
  if (!text(value)) throw new Error(`${label} is required`);
  return text(value);
};
const root = config => text(config.tracking_base_url || 'https://apigateway.bluedart.com/in/transportation/tracking/v1').replace(/\/$/, '');
const trackingUrl = (awb, config) => {
  const query = new URLSearchParams({ handler: 'tnt', action: 'custawbquery', loginid: required(config.login_id, 'Blue Dart login ID'), awb: 'awb', numbers: required(awb, 'Blue Dart AWB number'), format: 'json', lickey: required(config.api_key, 'Blue Dart API key'), verno: '1', scan: '1' });
  return `${root(config)}?${query.toString()}`;
};

const testConnection = async config => {
  const awb = required(config.test_awb, 'Blue Dart test AWB');
  await httpRequest({ url: trackingUrl(awb, config), headers: { JWTToken: required(config.jwt_token, 'Blue Dart JWT token') }, timeout: 15000 });
  return { success: true, message: 'Blue Dart tracking API credentials are valid' };
};

const trackShipment = async (trackingNumber, config) => {
  const response = await httpRequest({ url: trackingUrl(trackingNumber, config), headers: { JWTToken: required(config.jwt_token, 'Blue Dart JWT token') }, timeout: 15000 });
  const data = response.data;
  return { awb: text(trackingNumber), status: data?.ShipmentData?.[0]?.Shipment?.Status?.Status || data?.status || 'unknown', history: data?.ShipmentData?.[0]?.Shipment?.Scans || data?.scans || [], raw: data };
};

const accountApiError = method => new Error(`Blue Dart ${method} requires the operational PackTrack/ShipDart endpoint issued for the account`);

module.exports = {
  id: 'bluedart', displayName: 'Blue Dart', activation: 'active',
  contractMethods: ['getRates', 'createShipment', 'trackShipment', 'cancelShipment', 'testConnection'],
  testConnection, trackShipment,
  async getRates() { throw accountApiError('rate calculation'); },
  async createShipment() { throw accountApiError('shipment creation'); },
  async cancelShipment() { throw accountApiError('cancellation'); },
};
