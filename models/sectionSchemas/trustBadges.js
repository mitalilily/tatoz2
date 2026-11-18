function validateTrustBadges(data = {}) {
  const badges = Array.isArray(data.badges) ? data.badges : [];
  return {
    heading: typeof data.heading === 'string' ? data.heading : '',
    badges: badges.map(b => ({
      imageUrl: typeof b?.imageUrl === 'string' ? b.imageUrl : '',
      altText: typeof b?.altText === 'string' ? b.altText : '',
      link: typeof b?.link === 'string' ? b.link : '',
    })),
  };
}
module.exports = { validateTrustBadges };
