import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Upload, Save, Loader2, Mail, Phone, MapPin, Clock, Share2, Link2, Layers, Palette, PanelTop, PanelBottom, Plus, Trash2, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminAPI } from '../../services/api';
import Loader from '../../components/common/Loader';

const defaultSocial = () => ({ facebook: '', twitter: '', instagram: '', linkedin: '', youtube: '' });
const defaultContact = () => ({ phone: '', email: '', address: '', hours: '' });
const defaultTheme = () => ({ brandColor: '#4f46e5', accentColor: '#a855f7', textColor: '#111827', buttonStyle: 'rounded', fontFamily: '' });
const SOCIAL_LABELS = { facebook: 'Facebook', twitter: 'Twitter/X', instagram: 'Instagram', linkedin: 'LinkedIn', youtube: 'YouTube' };
const defaultFooterLinks = () => ({
 shopLinks: [
 { label: 'Home', url: '/' },
 { label: 'All Products', url: '/search' },
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
});
const defaultFooter = () => ({
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
 ...defaultFooterLinks(),
 copyright: '',
});
const defaultHeader = () => ({
 backgroundColor: '#ffffff',
 textColor: '#111827',
 accentColor: '#4f46e5',
 sticky: true,
 show: { deliverTo: true, search: true, notifications: true, account: true, wishlist: true, cart: true, mobileMenu: true },
 searchPlaceholder: 'Search for products, categories or brands...',
 deliverToLabel: 'Deliver to',
 menuLinks: [
 { label: 'Profile', url: '/profile' },
 { label: 'My Orders', url: '/orders' },
 { label: 'Wishlist', url: '/wishlist' },
 { label: 'Wallet', url: '/wallet' },
 { label: 'Loyalty & Rewards', url: '/loyalty' },
 { label: 'Gift Cards', url: '/gift-cards' },
 { label: 'Pre-orders & Plans', url: '/lifecycle' },
 { label: 'Settings', url: '/settings' },
 ],
});
const HEADER_SHOW_LABELS = { deliverTo: 'Deliver-to', search: 'Search', notifications: 'Notifications bell', account: 'Account menu', wishlist: 'Wishlist icon', cart: 'Cart button', mobileMenu: 'Mobile menu' };
const FOOTER_SHOW_LABELS = { brand: 'Brand column', shop: 'Shop links', support: 'Support links', contact: 'Contact column', socials: 'Social icons', partners: 'Partner credits', payments: 'Payment badges' };

// Editable name + URL rows for one footer link column (max 12).
const FooterLinkEditor = ({ title, links, onChange }) => {
 const update = (index, patch) => onChange(links.map((link, i) => (i === index ? { ...link, ...patch } : link)));
 const remove = (index) => onChange(links.filter((_, i) => i !== index));
 const add = () => {
 if (links.length >= 12) { toast.error('At most 12 links per column'); return; }
 onChange([...links, { label: '', url: '' }]);
 };
 return (
 <div>
 <div className="flex items-center justify-between mb-2">
 <label className="block text-xs font-medium text-gray-600">{title} ({links.length}/12)</label>
 <button type="button" onClick={add} className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:underline">
 <Plus size={13} /> Add link
 </button>
 </div>
 <div className="space-y-2">
 {links.map((link, i) => (
 <div key={i} className="flex items-center gap-2">
 <input type="text" value={link.label} onChange={e => update(i, { label: e.target.value })} maxLength={80}
 placeholder="Name — e.g. Sale" className="input py-2 text-sm flex-1" />
 <input type="text" value={link.url} onChange={e => update(i, { url: e.target.value })} maxLength={2048}
 placeholder="Link — /sale or https://…" className="input py-2 text-sm flex-1 font-mono" />
 <button type="button" onClick={() => remove(i)} aria-label={`Remove ${link.label || 'link'}`}
 className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg flex-shrink-0">
 <Trash2 size={15} />
 </button>
 </div>
 ))}
 {links.length === 0 && <p className="text-xs text-gray-400">No links — add one above or leave the column hidden.</p>}
 </div>
 </div>
 );
};

// Editable payment badges row (card logo or custom text chip, max 8).
const PAYMENT_BADGE_KINDS = [
 { value: 'mastercard', label: 'Mastercard logo' },
 { value: 'visa', label: 'Visa logo' },
 { value: 'text', label: 'Custom text' },
];
const PaymentBadgeEditor = ({ badges, onChange }) => {
 const update = (index, patch) => onChange(badges.map((badge, i) => (i === index ? { ...badge, ...patch } : badge)));
 const remove = (index) => onChange(badges.filter((_, i) => i !== index));
 const add = () => {
 if (badges.length >= 8) { toast.error('At most 8 badges'); return; }
 onChange([...badges, { kind: 'text', label: '' }]);
 };
 return (
 <div>
 <div className="flex items-center justify-between mb-2">
 <label className="block text-xs font-medium text-gray-600">Payment badges ({badges.length}/8)</label>
 <button type="button" onClick={add} className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:underline">
 <Plus size={13} /> Add badge
 </button>
 </div>
 <div className="space-y-2">
 {badges.map((badge, i) => (
 <div key={i} className="flex items-center gap-2">
 <select value={badge.kind} onChange={e => update(i, { kind: e.target.value })} className="input py-2 text-sm bg-white w-40 flex-shrink-0">
 {PAYMENT_BADGE_KINDS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
 </select>
 {badge.kind === 'text' ? (
 <input type="text" value={badge.label} onChange={e => update(i, { label: e.target.value })} maxLength={20}
 placeholder="UPI, COD, Netbanking…" className="input py-2 text-sm flex-1" />
 ) : (
 <span className="flex-1 text-xs text-gray-400">Logo renders automatically</span>
 )}
 <button type="button" onClick={() => remove(i)} aria-label="Remove badge"
 className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg flex-shrink-0">
 <Trash2 size={15} />
 </button>
 </div>
 ))}
 {badges.length === 0 && <p className="text-xs text-gray-400">No badges — add one above or hide the row.</p>}
 </div>
 </div>
 );
};

const CustomizationPage = () => {
 const [loading, setLoading] = useState(true);
 const [saving, setSaving] = useState(false);
 const [logo, setLogo] = useState('');
 const [logoDark, setLogoDark] = useState('');
 const [favicon, setFavicon] = useState('');
 const [social, setSocial] = useState(defaultSocial());
 const [contact, setContact] = useState(defaultContact());
 const [theme, setTheme] = useState(defaultTheme());
 const [footer, setFooter] = useState(defaultFooter());
 const [header, setHeader] = useState(defaultHeader());
 const [uploading, setUploading] = useState(null);

 useEffect(() => {
  adminAPI.getCustomization()
   .then(res => {
    const c = res.data.customization || {};
    setLogo(c.logo || '');
    setLogoDark(c.logoDark || '');
    setFavicon(c.favicon || '');
    setSocial({ ...defaultSocial(), ...(c.social || {}) });
    setContact({ ...defaultContact(), ...(c.contact || {}) });
    setTheme({ ...defaultTheme(), ...(c.theme || {}) });
    const headerDefaults = defaultHeader();
    const savedHeader = c.header || {};
    setHeader({
     ...headerDefaults,
     ...savedHeader,
     show: { ...headerDefaults.show, ...(savedHeader.show || {}) },
     menuLinks: Array.isArray(savedHeader.menuLinks) ? savedHeader.menuLinks : headerDefaults.menuLinks,
    });
    const saved = c.footer || {};
    const footerDefaults = defaultFooter();
    setFooter({
     ...footerDefaults,
     ...saved,
     headings: { ...footerDefaults.headings, ...(saved.headings || {}) },
     show: { ...footerDefaults.show, ...(saved.show || {}) },
     partners: { ...footerDefaults.partners, ...(saved.partners || {}) },
     paymentBadges: Array.isArray(saved.paymentBadges) ? saved.paymentBadges : footerDefaults.paymentBadges,
     shopLinks: Array.isArray(saved.shopLinks) ? saved.shopLinks : footerDefaults.shopLinks,
     supportLinks: Array.isArray(saved.supportLinks) ? saved.supportLinks : footerDefaults.supportLinks,
    });
   })
   .catch(() => toast.error('Failed to load customization'))
   .finally(() => setLoading(false));
 }, []);

 const handleUpload = async (type, file) => {
  if (!file) return;
  setUploading(type);
  const toastId = toast.loading('Uploading image...');
  try {
   const formData = new FormData();
   formData.append('file', file);
   formData.append('type', type);
   const res = await adminAPI.uploadSiteAsset(formData);
   const url = res.data.url;
   if (type === 'logo') setLogo(url);
   else if (type === 'logoDark') setLogoDark(url);
   else if (type === 'favicon') setFavicon(url);
   toast.success('Image uploaded', { id: toastId });
  } catch (err) {
   toast.error(err.message || 'Upload failed', { id: toastId });
  } finally {
   setUploading(null);
  }
 };

 const handleRemove = async (imageUrl, clearFn) => {
  if (!imageUrl) return;
  const toastId = toast.loading('Removing image...');
  try {
   await adminAPI.deleteSiteAsset(imageUrl);
   clearFn();
   toast.success('Image removed', { id: toastId });
  } catch (err) {
   toast.error(err.message || 'Remove failed', { id: toastId });
  }
 };

 const handleSave = async () => {
  setSaving(true);
  try {
   await adminAPI.updateCustomization({ logo, logoDark, favicon, social, contact, theme, footer, header });
   toast.success('Customization saved');
   } catch (err) {
   toast.error(err.response?.data?.message || err.message || 'Save failed');
  } finally {
   setSaving(false);
  }
 };

 if (loading) return <div className="flex justify-center py-16"><Loader size="lg" /></div>;

 return (
  <div className="mx-auto w-full max-w-6xl space-y-8 animate-fade-in">
   <div className="flex items-center justify-between">
    <div>
     <h1 className="text-2xl font-bold text-gray-900">Site Customization</h1>
     <p className="text-sm text-gray-500 mt-1">Logo, favicon, social links, contact details and footer</p>
    </div>
    <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
     {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
     Save all
    </button>
   </div>

   {/* Page builder callout */}
   <Link to="/admin/pages" className="block bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-2xl p-5 hover:from-indigo-100 hover:to-purple-100 transition">
    <div className="flex items-start gap-4">
     <div className="w-10 h-10 rounded-lg bg-indigo-600 text-white flex items-center justify-center flex-shrink-0"><Layers size={20} /></div>
     <div className="flex-1">
      <div className="font-semibold text-indigo-900">Looking for homepage banners?</div>
      <p className="text-sm text-indigo-800 mt-1">Banners and page content live in the new <span className="font-semibold underline">Pages</span> editor — drag-and-drop sections including hero carousels, card grids, and product showcases.</p>
     </div>
     <span className="text-indigo-600 font-semibold text-sm self-center whitespace-nowrap">Open Pages →</span>
    </div>
   </Link>

   {/* Logo & Favicon */}
   <section className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
    <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
     <Link2 size={20} className="text-primary-600" />
     Branding
    </h2>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
     <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Logo (light)</label>
      <p className="text-xs text-gray-500 mb-2">Store navbar, customer login — light backgrounds</p>
      <div className="flex items-center gap-4">
       <div className="w-24 h-24 rounded-xl bg-gray-100 overflow-hidden border flex-shrink-0">
        {logo ? (
         <img src={logo} alt="Logo light" className="w-full h-full object-contain" />
        ) : (
         <label className="w-full h-full flex items-center justify-center cursor-pointer">
          <input type="file" accept="image/*" className="hidden" onChange={e => handleUpload('logo', e.target.files?.[0])} />
          {uploading === 'logo' ? <Loader2 className="animate-spin text-gray-400" size={24} /> : <Upload size={24} className="text-gray-400" />}
         </label>
        )}
       </div>
       <div className="flex-1 min-w-0">
        {logo && <button type="button" onClick={() => handleRemove(logo, () => setLogo(''))} className="text-xs text-red-600 hover:underline">Remove</button>}
        <label className="block mt-1">
         <span className="text-xs text-primary-600 cursor-pointer hover:underline">Upload new</span>
         <input type="file" accept="image/*" className="hidden" onChange={e => handleUpload('logo', e.target.files?.[0])} />
        </label>
       </div>
      </div>
     </div>
     <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Logo (dark)</label>
      <p className="text-xs text-gray-500 mb-2">Footer, admin nav, admin login — dark surfaces</p>
      <div className="flex items-center gap-4">
       <div className="w-24 h-24 rounded-xl bg-gray-800 overflow-hidden border border-gray-600 flex-shrink-0">
        {logoDark ? (
         <img src={logoDark} alt="Logo dark" className="w-full h-full object-contain" />
        ) : (
         <label className="w-full h-full flex items-center justify-center cursor-pointer">
          <input type="file" accept="image/*" className="hidden" onChange={e => handleUpload('logoDark', e.target.files?.[0])} />
          {uploading === 'logoDark' ? <Loader2 className="animate-spin text-gray-400" size={24} /> : <Upload size={24} className="text-gray-400" />}
         </label>
        )}
       </div>
       <div className="flex-1 min-w-0">
        {logoDark && <button type="button" onClick={() => handleRemove(logoDark, () => setLogoDark(''))} className="text-xs text-red-600 hover:underline">Remove</button>}
        <label className="block mt-1">
         <span className="text-xs text-primary-600 cursor-pointer hover:underline">Upload new</span>
         <input type="file" accept="image/*" className="hidden" onChange={e => handleUpload('logoDark', e.target.files?.[0])} />
        </label>
       </div>
      </div>
     </div>
     <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">Favicon</label>
      <div className="flex items-center gap-4">
       <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden border flex-shrink-0">
        {favicon ? (
         <img src={favicon} alt="Favicon" className="w-full h-full object-contain" />
        ) : (
         <label className="w-full h-full flex items-center justify-center cursor-pointer">
          <input type="file" accept="image/*" className="hidden" onChange={e => handleUpload('favicon', e.target.files?.[0])} />
          {uploading === 'favicon' ? <Loader2 className="animate-spin text-gray-400" size={18} /> : <Upload size={18} className="text-gray-400" />}
         </label>
        )}
       </div>
       <div className="flex-1">
        {favicon && <button type="button" onClick={() => handleRemove(favicon, () => setFavicon(''))} className="text-xs text-red-600 hover:underline">Remove</button>}
        <label className="block mt-1">
         <span className="text-xs text-primary-600 cursor-pointer hover:underline">Upload new</span>
         <input type="file" accept="image/*" className="hidden" onChange={e => handleUpload('favicon', e.target.files?.[0])} />
        </label>
       </div>
      </div>
     </div>
    </div>
   </section>

   {/* Theme tokens */}
   <section className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
    <h2 className="text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2">
     <Palette size={20} className="text-primary-600" />
     Theme
    </h2>
    <p className="text-xs text-gray-500 mb-4">Global colors and button shape applied across the customer site (page-builder sections that use them inherit automatically).</p>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
     <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">Brand color</label>
      <div className="flex items-center gap-2">
       <input type="color" value={theme.brandColor || '#4f46e5'} onChange={e => setTheme(t => ({ ...t, brandColor: e.target.value }))} className="h-9 w-12 rounded border border-gray-300 cursor-pointer" />
       <input type="text" value={theme.brandColor || ''} onChange={e => setTheme(t => ({ ...t, brandColor: e.target.value }))} maxLength={7} pattern="#[0-9a-fA-F]{6}" title="Use a six-digit hex color such as #4f46e5" className="input py-2 text-sm font-mono flex-1" data-testid="customization-brand-color" />
      </div>
     </div>
     <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">Accent color</label>
      <div className="flex items-center gap-2">
       <input type="color" value={theme.accentColor || '#a855f7'} onChange={e => setTheme(t => ({ ...t, accentColor: e.target.value }))} className="h-9 w-12 rounded border border-gray-300 cursor-pointer" />
       <input type="text" value={theme.accentColor || ''} onChange={e => setTheme(t => ({ ...t, accentColor: e.target.value }))} maxLength={7} pattern="#[0-9a-fA-F]{6}" title="Use a six-digit hex color such as #a855f7" className="input py-2 text-sm font-mono flex-1" />
      </div>
     </div>
     <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">Text color</label>
      <div className="flex items-center gap-2">
       <input type="color" value={theme.textColor || '#111827'} onChange={e => setTheme(t => ({ ...t, textColor: e.target.value }))} className="h-9 w-12 rounded border border-gray-300 cursor-pointer" />
       <input type="text" value={theme.textColor || ''} onChange={e => setTheme(t => ({ ...t, textColor: e.target.value }))} maxLength={7} pattern="#[0-9a-fA-F]{6}" title="Use a six-digit hex color such as #111827" className="input py-2 text-sm font-mono flex-1" />
      </div>
     </div>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
     <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">Button shape</label>
      <select value={theme.buttonStyle || 'rounded'} onChange={e => setTheme(t => ({ ...t, buttonStyle: e.target.value }))} className="input py-2 text-sm bg-white">
       <option value="rounded">Rounded (default, 8px radius)</option>
       <option value="pill">Pill (fully rounded)</option>
       <option value="square">Square (sharp corners)</option>
      </select>
     </div>
     <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">Custom font family (optional)</label>
      <input type="text" value={theme.fontFamily || ''} onChange={e => setTheme(t => ({ ...t, fontFamily: e.target.value }))} maxLength={160} placeholder="Inter, sans-serif" className="input py-2 text-sm font-mono" data-testid="customization-font-family" />
     </div>
    </div>
   </section>

   {/* Header */}
   <section className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100" id="header-settings">
    <h2 className="text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2">
     <PanelTop size={20} className="text-primary-600" />
     Header
    </h2>
    <p className="text-xs text-gray-500 mb-4">Navbar colors, sticky behavior, every visible element, texts and the account menu links (internal paths like /sale or full https:// URLs).</p>

    <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">Colors</p>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
     {[
     { key: 'backgroundColor', label: 'Background' },
     { key: 'textColor', label: 'Text & icons' },
     { key: 'accentColor', label: 'Accent (hovers, highlights)' },
     ].map(({ key, label }) => (
     <div key={key}>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <div className="flex items-center gap-2">
       <input type="color" value={header[key] || '#000000'} onChange={e => setHeader(h => ({ ...h, [key]: e.target.value }))} className="h-9 w-12 rounded border border-gray-300 cursor-pointer flex-shrink-0" />
       <input type="text" value={header[key] || ''} onChange={e => setHeader(h => ({ ...h, [key]: e.target.value }))} maxLength={7} placeholder="#ffffff" className="input py-2 text-sm font-mono flex-1" />
      </div>
     </div>
     ))}
    </div>

    <div className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3 mb-6">
     <div>
      <p className="text-sm font-semibold text-gray-900">Sticky header</p>
      <p className="text-xs text-gray-500">Stay pinned to the top while scrolling</p>
     </div>
     <button type="button" role="switch" aria-checked={header.sticky !== false} onClick={() => setHeader(h => ({ ...h, sticky: h.sticky === false }))}
     className={`relative h-6 w-11 rounded-full transition-colors flex-shrink-0 ${header.sticky === false ? 'bg-gray-300' : 'bg-primary-600'}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${header.sticky === false ? 'left-0.5' : 'left-[22px]'}`} />
     </button>
    </div>

    <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">Show in header</p>
    <div className="flex flex-wrap gap-2 mb-6">
     {Object.entries(HEADER_SHOW_LABELS).map(([key, label]) => {
     const on = header.show?.[key] !== false;
     return (
     <button key={key} type="button" onClick={() => setHeader(h => ({ ...h, show: { ...h.show, [key]: !on } }))}
     className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${on ? 'border-primary-200 bg-primary-50 text-primary-700' : 'border-gray-200 bg-white text-gray-400'}`}>
     {on ? <Eye size={13} /> : <EyeOff size={13} />}
     {label}
     </button>
     );
     })}
    </div>

    <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">Texts</p>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
     <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">Search placeholder</label>
      <input type="text" value={header.searchPlaceholder || ''} onChange={e => setHeader(h => ({ ...h, searchPlaceholder: e.target.value }))} maxLength={120} className="input py-2 text-sm" />
     </div>
     <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">Deliver-to label</label>
      <input type="text" value={header.deliverToLabel || ''} onChange={e => setHeader(h => ({ ...h, deliverToLabel: e.target.value }))} maxLength={40} className="input py-2 text-sm" />
     </div>
    </div>

    <FooterLinkEditor title="Account menu links" links={header.menuLinks || []} onChange={menuLinks => setHeader(h => ({ ...h, menuLinks }))} />
   </section>

   {/* Footer */}
   <section className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100" id="footer-settings">
    <h2 className="text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2">
     <PanelBottom size={20} className="text-primary-600" />
     Footer
    </h2>
    <p className="text-xs text-gray-500 mb-4">Colors, visible sections, every heading and text, the Shop and Support link columns (internal paths like /sale or full https:// URLs), plus partner credits and payment badges.</p>

    <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">Colors</p>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
     {[
     { key: 'backgroundColor', label: 'Background' },
     { key: 'textColor', label: 'Body text' },
     { key: 'headingColor', label: 'Headings' },
     { key: 'accentColor', label: 'Accent (top border, hovers)' },
     ].map(({ key, label }) => (
     <div key={key}>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <div className="flex items-center gap-2">
       <input type="color" value={footer[key] || '#000000'} onChange={e => setFooter(f => ({ ...f, [key]: e.target.value }))} className="h-9 w-12 rounded border border-gray-300 cursor-pointer flex-shrink-0" />
       <input type="text" value={footer[key] || ''} onChange={e => setFooter(f => ({ ...f, [key]: e.target.value }))} maxLength={7} placeholder="#020617" className="input py-2 text-sm font-mono flex-1" />
      </div>
     </div>
     ))}
    </div>

    <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">Show in footer</p>
    <div className="flex flex-wrap gap-2 mb-6">
     {Object.entries(FOOTER_SHOW_LABELS).map(([key, label]) => {
     const on = footer.show?.[key] !== false;
     return (
     <button key={key} type="button" onClick={() => setFooter(f => ({ ...f, show: { ...f.show, [key]: !on } }))}
     className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${on ? 'border-primary-200 bg-primary-50 text-primary-700' : 'border-gray-200 bg-white text-gray-400'}`}>
     {on ? <Eye size={13} /> : <EyeOff size={13} />}
     {label}
     </button>
     );
     })}
    </div>

    <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">Texts</p>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
     <div className="sm:col-span-2">
      <label className="block text-xs font-medium text-gray-600 mb-1">Tagline (brand column)</label>
      <textarea value={footer.tagline || ''} onChange={e => setFooter(f => ({ ...f, tagline: e.target.value }))} rows={2} maxLength={300}
      className="input py-2 text-sm resize-none" placeholder="AI-powered shopping with honest prices…" />
     </div>
     {[
     { key: 'shop', label: 'Shop column heading' },
     { key: 'support', label: 'Support column heading' },
     { key: 'contact', label: 'Contact column heading' },
     ].map(({ key, label }) => (
     <div key={key}>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input type="text" value={footer.headings?.[key] || ''} onChange={e => setFooter(f => ({ ...f, headings: { ...f.headings, [key]: e.target.value } }))} maxLength={60} className="input py-2 text-sm" />
     </div>
     ))}
     <div className="sm:col-span-2">
      <label className="block text-xs font-medium text-gray-600 mb-1">Copyright line (empty = automatic)</label>
      <input type="text" value={footer.copyright || ''} onChange={e => setFooter(f => ({ ...f, copyright: e.target.value }))} maxLength={200}
      className="input py-2 text-sm" placeholder="© {year} {siteName}. All rights reserved." />
      <p className="text-[11px] text-gray-400 mt-1">{'{year}'} and {'{siteName}'} are replaced automatically.</p>
     </div>
    </div>

    <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">Link columns</p>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
     <FooterLinkEditor title="Shop links" links={footer.shopLinks || []} onChange={shopLinks => setFooter(f => ({ ...f, shopLinks }))} />
     <FooterLinkEditor title="Support links" links={footer.supportLinks || []} onChange={supportLinks => setFooter(f => ({ ...f, supportLinks }))} />
    </div>

    <p className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">Partner credits</p>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
     {[
     { key: 'paymentsLabel', label: 'Payments label', placeholder: 'Payments by' },
     { key: 'paymentsName', label: 'Payment partner name', placeholder: 'Razorpay' },
     { key: 'deliveryLabel', label: 'Delivery label', placeholder: 'Delivery by' },
     { key: 'deliveryName', label: 'Delivery partner name', placeholder: 'Shiprocket' },
     ].map(({ key, label, placeholder }) => (
     <div key={key}>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input type="text" value={footer.partners?.[key] || ''} onChange={e => setFooter(f => ({ ...f, partners: { ...f.partners, [key]: e.target.value } }))} maxLength={60} placeholder={placeholder} className="input py-2 text-sm" />
     </div>
     ))}
    </div>

    <PaymentBadgeEditor badges={footer.paymentBadges || []} onChange={paymentBadges => setFooter(f => ({ ...f, paymentBadges }))} />
   </section>

   {/* Social links */}
   <section className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
    <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
     <Share2 size={20} className="text-primary-600" />
     Social links
    </h2>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
     {['facebook', 'twitter', 'instagram', 'linkedin', 'youtube'].map(key => (
      <div key={key}>
       <label className="block text-xs font-medium text-gray-600 mb-1">{SOCIAL_LABELS[key]}</label>
       <input type="url" value={social[key] || ''} onChange={e => setSocial(s => ({ ...s, [key]: e.target.value }))} maxLength={2048} className="input py-2 text-sm" placeholder={`https://${key}.com/...`} data-testid={`customization-social-${key}`} />
      </div>
     ))}
    </div>
   </section>

   {/* Contact */}
   <section className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
    <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
     <Mail size={20} className="text-primary-600" />
     Contact details
    </h2>
    <div className="space-y-4">
     <div>
      <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1"><Phone size={12} /> Phone</label>
      <input type="tel" value={contact.phone} onChange={e => setContact(c => ({ ...c, phone: e.target.value }))} maxLength={30} className="input py-2 text-sm" placeholder="+91 98765 43210" data-testid="customization-phone" />
     </div>
     <div>
      <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1"><Mail size={12} /> Email</label>
      <input type="email" value={contact.email} onChange={e => setContact(c => ({ ...c, email: e.target.value }))} maxLength={160} className="input py-2 text-sm" placeholder="hello@example.com" data-testid="customization-email" />
     </div>
     <div>
      <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1"><MapPin size={12} /> Address</label>
      <textarea value={contact.address} onChange={e => setContact(c => ({ ...c, address: e.target.value }))} rows={2} maxLength={500} className="input py-2 text-sm resize-none" placeholder="Street, City, State, PIN" data-testid="customization-address" />
     </div>
     <div>
      <label className="block text-xs font-medium text-gray-600 mb-1 flex items-center gap-1"><Clock size={12} /> Business Hours</label>
      <input type="text" value={contact.hours || ''} onChange={e => setContact(c => ({ ...c, hours: e.target.value }))} maxLength={160} className="input py-2 text-sm" placeholder="Mon–Sat, 9 AM–6 PM IST" data-testid="customization-hours" />
     </div>
    </div>
   </section>

   <div className="flex justify-end">
    <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2">
     {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
     Save all
    </button>
   </div>
  </div>
 );
};

export default CustomizationPage;
