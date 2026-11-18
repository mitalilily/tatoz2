import { Link } from 'react-router-dom';
import { Mail, Phone, MapPin, Facebook, Twitter, Instagram, Youtube, Linkedin, Store, ChevronRight } from 'lucide-react';
import { useSite } from '../../context/SiteContext';
import { PLATFORM_NAME, displayPlatformName } from '../../constants/branding';

const socialIcons = [
 { key: 'facebook', Icon: Facebook },
 { key: 'twitter', Icon: Twitter },
 { key: 'instagram', Icon: Instagram },
 { key: 'linkedin', Icon: Linkedin },
 { key: 'youtube', Icon: Youtube },
];

// Matches the server DEFAULT_FOOTER so a fresh install renders identically
// before an admin ever saves footer settings.
const FALLBACK_FOOTER = {
 backgroundColor: '#020617',
 textColor: '#94a3b8',
 headingColor: '#ffffff',
 accentColor: '#4f46e5',
 tagline: 'AI-powered shopping with honest prices, fast delivery and easy returns.',
 headings: { shop: 'Shop', support: 'Support', contact: 'Contact Us' },
 show: { brand: true, shop: true, support: true, contact: true, socials: true, partners: true, payments: true },
 partners: { paymentsLabel: 'Payments by', paymentsName: 'Razorpay', deliveryLabel: 'Delivery by', deliveryName: 'Shiprocket' },
 paymentBadges: [
 { kind: 'mastercard', label: '' },
 { kind: 'visa', label: '' },
 { kind: 'text', label: 'UPI' },
 { kind: 'text', label: 'COD' },
 ],
 shopLinks: [
 { label: 'Home', url: '/' },
 { label: 'All Products', url: '/search' },
 { label: 'Categories', url: '/categories' },
 { label: 'Brands', url: '/brands' },
 { label: 'Bundles & Combos', url: '/bundles' },
 { label: 'Blog', url: '/blog' },
 ],
 supportLinks: [
 { label: 'My Account', url: '/profile' },
 { label: 'Track Order', url: '/orders' },
 { label: 'Shipping Policy', url: '/legal/shipping-policy' },
 { label: 'Returns & Refunds', url: '/legal/returns-refunds' },
 { label: 'FAQ', url: '/legal/faq' },
 { label: 'Privacy Policy', url: '/legal/privacy-policy' },
 { label: 'Terms of Service', url: '/legal/terms-of-service' },
 ],
 copyright: '',
};

// Internal paths use the router, everything else opens a new tab.
const FooterLink = ({ label, url, className }) => {
 const inner = (
 <>
 <ChevronRight size={13} className="text-slate-600 transition-all group-hover:translate-x-0.5 group-hover:text-[var(--ft-accent)]" />
 {label}
 </>
 );
 if (url.startsWith('/')) {
 return <Link to={url} className={className}>{inner}</Link>;
 }
 return <a href={url} target="_blank" rel="noopener noreferrer" className={className}>{inner}</a>;
};

const Footer = () => {
 const { site, settings } = useSite();
 const { social = {}, contact = {}, logo, logoDark } = site || {};
 const saved = (site && site.footer) || {};
 const f = {
 ...FALLBACK_FOOTER,
 ...saved,
 headings: { ...FALLBACK_FOOTER.headings, ...(saved.headings || {}) },
 show: { ...FALLBACK_FOOTER.show, ...(saved.show || {}) },
 partners: { ...FALLBACK_FOOTER.partners, ...(saved.partners || {}) },
 paymentBadges: Array.isArray(saved.paymentBadges) ? saved.paymentBadges : FALLBACK_FOOTER.paymentBadges,
 shopLinks: Array.isArray(saved.shopLinks) ? saved.shopLinks : FALLBACK_FOOTER.shopLinks,
 supportLinks: Array.isArray(saved.supportLinks) ? saved.supportLinks : FALLBACK_FOOTER.supportLinks,
 };
 const footerLogo = logoDark || logo;
 const siteName = displayPlatformName(settings?.siteName || PLATFORM_NAME);
 const year = new Date().getFullYear();
 const copyright = f.copyright
 ? f.copyright.replace('{year}', String(year)).replace('{siteName}', siteName)
 : `© ${year} ${siteName}. All rights reserved.`;
 const configuredSocials = socialIcons.filter(({ key }) => social[key]);
 const visibleCols = [f.show.brand, f.show.shop, f.show.support, f.show.contact].filter(Boolean).length;
 const gridCls = visibleCols >= 4
 ? 'lg:grid-cols-[1.4fr_1fr_1fr_1.2fr]'
 : visibleCols === 3 ? 'lg:grid-cols-3' : visibleCols === 2 ? 'lg:grid-cols-2' : 'lg:grid-cols-1';
 // Soft tones derived from the configured colors so the footer stays crisp
 // on any background the admin picks, light or dark.
 const soft = (hex, alpha) => `color-mix(in srgb, ${hex} ${alpha}%, transparent)`;
 const chipStyle = { backgroundColor: soft(f.textColor, 8), borderColor: soft(f.textColor, 16) };
 const dividerStyle = { borderColor: soft(f.textColor, 16) };
 return (
 <footer
 className="border-t-2"
 style={{ backgroundColor: f.backgroundColor, color: f.textColor, borderTopColor: f.accentColor, '--ft-accent': f.accentColor }}
 >
 <div className="page-container py-10 md:py-12">
 <div className={`grid grid-cols-2 gap-8 md:grid-cols-2 ${gridCls}`}>
 {/* Brand */}
 {f.show.brand && (
 <div className="col-span-2 lg:col-span-1">
 <div className="flex items-center">
 {footerLogo ? (
 <img src={footerLogo} alt="Site logo" className="h-9 w-auto max-w-[140px] object-contain" />
 ) : (
 <span className="text-lg font-extrabold tracking-tight" style={{ color: f.headingColor }}>{siteName}</span>
 )}
 </div>
 {f.tagline && (
 <p className="mt-3 max-w-xs text-sm leading-relaxed">{f.tagline}</p>
 )}
 <Link
 to="/vendor/register"
 className="mt-4 inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-colors hover:text-white"
 style={{ ...chipStyle, color: f.headingColor }}
 onMouseEnter={e => { e.currentTarget.style.backgroundColor = f.accentColor; e.currentTarget.style.borderColor = f.accentColor; }}
 onMouseLeave={e => { e.currentTarget.style.backgroundColor = soft(f.textColor, 8); e.currentTarget.style.borderColor = soft(f.textColor, 16); }}
 >
 <Store size={14} />
 Sell on {siteName}
 </Link>
 {f.show.socials && configuredSocials.length > 0 && (
 <div className="mt-4 flex gap-2">
 {configuredSocials.map(({ key, Icon }) => (
 <a key={key} href={social[key]} target="_blank" rel="noopener noreferrer" aria-label={key}
 className="flex h-9 w-9 items-center justify-center rounded-full border transition-colors hover:text-white"
 style={chipStyle}
 onMouseEnter={e => { e.currentTarget.style.backgroundColor = f.accentColor; e.currentTarget.style.borderColor = f.accentColor; }}
 onMouseLeave={e => { e.currentTarget.style.backgroundColor = soft(f.textColor, 8); e.currentTarget.style.borderColor = soft(f.textColor, 16); }}
 >
 <Icon size={15} />
 </a>
 ))}
 </div>
 )}
 </div>
 )}

 {/* Shop */}
 {f.show.shop && (
 <div>
 <h4 className="mb-4 text-[13px] font-bold" style={{ color: f.headingColor }}>{f.headings.shop}</h4>
 <ul className="space-y-2.5">
 {f.shopLinks.map(({ label, url }) => (
 <li key={`${label}-${url}`}>
 <FooterLink label={label} url={url} className="group inline-flex items-center gap-1 text-sm transition-colors hover:text-[var(--ft-accent)]" />
 </li>
 ))}
 </ul>
 </div>
 )}

 {/* Support */}
 {f.show.support && (
 <div>
 <h4 className="mb-4 text-[13px] font-bold" style={{ color: f.headingColor }}>{f.headings.support}</h4>
 <ul className="space-y-2.5">
 {f.supportLinks.map(({ label, url }) => (
 <li key={`${label}-${url}`}>
 <FooterLink label={label} url={url} className="group inline-flex items-center gap-1 text-sm transition-colors hover:text-[var(--ft-accent)]" />
 </li>
 ))}
 </ul>
 </div>
 )}

 {/* Contact */}
 {f.show.contact && (
 <div className="col-span-2 lg:col-span-1">
 <h4 className="mb-4 text-[13px] font-bold" style={{ color: f.headingColor }}>{f.headings.contact}</h4>
 <ul className="space-y-3">
 {contact.address && (
 <li className="flex items-start gap-2.5">
 <MapPin size={15} className="mt-0.5 flex-shrink-0 text-[var(--ft-accent)]" />
 <span className="min-w-0 break-anywhere text-sm leading-relaxed">{contact.address}</span>
 </li>
 )}
 {contact.phone && (
 <li className="flex items-center gap-2.5">
 <Phone size={15} className="flex-shrink-0 text-[var(--ft-accent)]" />
 <a href={`tel:${contact.phone}`} className="min-w-0 break-anywhere text-sm hover:text-[var(--ft-accent)]">{contact.phone}</a>
 </li>
 )}
 {contact.email && (
 <li className="flex items-center gap-2.5">
 <Mail size={15} className="flex-shrink-0 text-[var(--ft-accent)]" />
 <a href={`mailto:${contact.email}`} className="min-w-0 break-anywhere text-sm hover:text-[var(--ft-accent)]">{contact.email}</a>
 </li>
 )}
 {!contact.address && !contact.phone && !contact.email && (
 <li className="text-sm opacity-70"><Link to="/support" className="hover:text-[var(--ft-accent)]">Need help? Create a support ticket</Link></li>
 )}
 </ul>
 </div>
 )}
 </div>

 {/* Partners + payments */}
 {(f.show.partners || f.show.payments) && (
 <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t pt-6 md:flex-row" style={dividerStyle}>
 {f.show.partners && (
 <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-center text-[13px]">
 <span>{f.partners.paymentsLabel} <span className="font-bold" style={{ color: f.headingColor }}>{f.partners.paymentsName}</span></span>
 <span className="h-4 w-px" style={{ backgroundColor: soft(f.textColor, 16) }} />
 <span>{f.partners.deliveryLabel} <span className="font-bold" style={{ color: f.headingColor }}>{f.partners.deliveryName}</span></span>
 </div>
 )}
 {f.show.payments && f.paymentBadges.length > 0 && (
 <div className="flex flex-wrap items-center justify-center gap-2 md:justify-end">
 {f.paymentBadges.map((badge, i) => (
 <span key={`${badge.kind}-${badge.label || i}`} className="flex h-8 items-center rounded-lg border px-3" style={chipStyle} aria-label={badge.kind === 'text' ? badge.label : badge.kind}>
 {badge.kind === 'mastercard' && (
 <svg viewBox="0 0 48 32" className="h-5 w-auto" fill="none">
 <circle cx="18" cy="16" r="10" fill="#EB001B" />
 <circle cx="30" cy="16" r="10" fill="#F79E1B" />
 <path d="M24 8.8a10 10 0 0 1 0 14.4 10 10 0 0 1 0-14.4z" fill="#FF5F00" />
 </svg>
 )}
 {badge.kind === 'visa' && (
 <svg viewBox="0 0 48 16" className="h-3.5 w-auto" fill="white">
 <path d="M17.4 0.5L11.2 15.5H7.3L4.2 3.5C4 2.7 3.8 2.4 3.2 2.1 2.2 1.5 0.6 1 0 0.7L0.1 0.5H6.3C7.1 0.5 7.8 1 8 1.9L9.5 9.7 13.3 0.5H17.4ZM33.5 10.7C33.5 6.7 28 6.5 28 4.7 28 4.1 28.6 3.5 29.8 3.3 30.4 3.2 32 3.2 33.8 4L34.5 0.9C33.5 0.5 32.3 0.2 30.8 0.2 27 0.2 24.3 2.2 24.3 5 24.3 7.1 26.2 8.2 27.6 8.9 29 9.6 29.5 10 29.5 10.7 29.5 11.7 28.3 12.1 27.2 12.1 25.2 12.1 24 11.8 22.3 11L21.6 14.2C23.5 15 24.9 15.3 26.8 15.3 30.8 15.8 33.5 13.8 33.5 10.7ZM42.5 15.5H46L43 0.5H39.8C39.1 0.5 38.5 0.9 38.2 1.5L32.5 15.5H36.5L37.3 13.2H42.2L42.5 15.5ZM38.4 10.2L40.4 4.6 41.5 10.2H38.4ZM22.8 0.5L19.6 15.5H15.8L19 0.5H22.8Z" />
 </svg>
 )}
 {badge.kind === 'text' && (
 <span className="text-xs font-bold" style={{ color: f.headingColor }}>{badge.label}</span>
 )}
 </span>
 ))}
 </div>
 )}
 </div>
 )}

 {/* Copyright */}
 <p className="mt-6 border-t pt-5 text-center text-[13px] opacity-70" style={dividerStyle}>
 {copyright}
 </p>
 </div>
 </footer>
 );
};

export default Footer;
