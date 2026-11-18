function validateMap(data = {}) {
  const locations = Array.isArray(data.locations) ? data.locations : [];
  return {
    heading: typeof data.heading === 'string' ? data.heading : '',
    embedUrl: typeof data.embedUrl === 'string' ? data.embedUrl : '',
    showLocationList: data.showLocationList !== false,
    locations: locations.map(l => ({
      name: typeof l?.name === 'string' ? l.name : '',
      address: typeof l?.address === 'string' ? l.address : '',
      phone: typeof l?.phone === 'string' ? l.phone : '',
      hours: typeof l?.hours === 'string' ? l.hours : '',
    })),
  };
}
module.exports = { validateMap };
