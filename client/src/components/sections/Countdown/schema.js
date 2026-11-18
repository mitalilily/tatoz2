export const countdownLabel = 'Countdown / Sale Strip';
export const countdownDefaults = () => {
  const inDays = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  return {
    heading: 'Sale ends in',
    subheading: 'Limited-time offer — don\'t miss out',
    endsAt: inDays.toISOString(),
    ctaLabel: 'Shop now',
    ctaLink: '/',
    backgroundColor: '#dc2626',
    textColor: '#ffffff',
    expiredMessage: 'Sale has ended',
  };
};
