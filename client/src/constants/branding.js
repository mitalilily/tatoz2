export const PLATFORM_NAME = 'Tatoz';

export const displayPlatformName = value => {
  const text = String(value || '').trim();
  // Tenant/store names are data, not legacy platform aliases. Rewriting a
  // configured store name here keeps tenant branding separate from the platform fallback.
  return text || PLATFORM_NAME;
};
