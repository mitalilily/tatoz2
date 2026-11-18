import { useEffect, useState } from 'react';
import { vendorAPI } from '../../services/api';
import toast from 'react-hot-toast';
import { Copy, ExternalLink } from 'lucide-react';
import { validateVendorStore } from '../../utils/vendorValidation';

function BrandingField({ label, value, onUrlChange, onFileSelect, uploading, type }) {
  const previewDims = type === 'logo' ? 'h-16 w-16' : 'h-20 w-48';
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <div className={`${previewDims} border rounded-lg bg-gray-50 mb-2 flex items-center justify-center overflow-hidden`}>
        {value ? (
          <img src={value} alt={label} className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="text-xs text-gray-400">No image</span>
        )}
      </div>
      <input
        className="w-full px-3 py-2 border rounded-lg mb-2"
        placeholder="Image URL"
        value={value || ''}
        onChange={e => onUrlChange(e.target.value)}
      />
      <label className="inline-flex items-center cursor-pointer">
        <span className="text-sm text-indigo-600 hover:text-indigo-800">
          {uploading ? 'Uploading…' : 'Or upload from device'}
        </span>
        <input
          type="file"
          accept="image/*"
          className="hidden"
          disabled={uploading}
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) onFileSelect(file);
            e.target.value = '';
          }}
        />
      </label>
    </div>
  );
}

export default function VendorStoreSettingsPage() {
  const [store, setStore] = useState(null);
  const [form, setForm] = useState({
    logo: '', banner: '', description: '', contactEmail: '', contactPhone: '',
    address: { fullName: '', phone: '', street: '', city: '', state: '', pincode: '', country: 'India' },
    socialLinks: { website: '', facebook: '', instagram: '', youtube: '', twitter: '' },
    settings: { minPayoutThreshold: 1000, notifyOnNewOrder: true },
    storefront: { tagline: '', announcement: '', theme: { primaryColor: '#4f46e5', accentColor: '#111827', surfaceColor: '#f8fafc', cardStyle: 'soft' } },
    taxProfile: { enabled: true, registrationType: 'unregistered', pricingMode: 'exclusive', defaultRate: 18, originState: '', sellerGstin: '', businessName: '', invoicePrefix: 'VINV', invoiceNote: '', gstComponents: { cgst: true, sgst: true, igst: true, utgst: true, cess: false } },
  });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [taxSaving, setTaxSaving] = useState(false);
  const [gstLocked, setGstLocked] = useState(true);

  useEffect(() => {
    Promise.all([vendorAPI.getStore(), vendorAPI.getTaxProfile()]).then(([storeResponse, taxResponse]) => {
      const data = storeResponse.data.data;
      const taxProfile = taxResponse.data?.profile || {};
      setStore(data);
      setGstLocked(true);
      setForm({
        logo: data.logo || '', banner: data.banner || '', description: data.description || '',
        contactEmail: data.contactEmail || '', contactPhone: data.contactPhone || '',
        address: data.address || form.address,
        socialLinks: { ...form.socialLinks, ...(data.socialLinks || {}) },
        settings: { ...form.settings, ...(data.settings || {}) },
        storefront: {
          ...form.storefront,
          ...(data.storefront || {}),
          theme: { ...form.storefront.theme, ...(data.storefront?.theme || {}) },
        },
        taxProfile: { ...form.taxProfile, ...(taxProfile || {}), gstComponents: { ...form.taxProfile.gstComponents, ...(taxProfile?.gstComponents || {}) } },
      });
    }).catch(error => toast.error(error.message || 'Could not load store settings')).finally(() => setLoading(false));
  }, []);

  const update = (f, v) => setForm(prev => ({ ...prev, [f]: v }));
  const updateNested = (group, f, v) => setForm(prev => ({ ...prev, [group]: { ...prev[group], [f]: v } }));
  const updateStorefrontTheme = (field, value) => setForm(prev => ({ ...prev, storefront: { ...prev.storefront, theme: { ...prev.storefront.theme, [field]: value } } }));

  const handleFileUpload = async (field, file) => {
    const setUploading = field === 'logo' ? setUploadingLogo : setUploadingBanner;
    const formData = new FormData();
    formData.append('image', file);
    setUploading(true);
    try {
      const res = await vendorAPI.uploadImage(formData);
      update(field, res.data.url);
    } catch (e) {
      toast.error(e.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    const errors = validateVendorStore(form);
    if (Object.keys(errors).length) return toast.error(Object.values(errors)[0]);
    setSaving(true);
    try {
      await vendorAPI.updateStore(form);
      toast.success('Store settings saved');
    } catch (e) {
      toast.error(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleTaxSave = async () => {
    const errors = validateVendorStore(form);
    if (errors.sellerGstin) return toast.error(errors.sellerGstin);
    setTaxSaving(true);
    try {
      const response = await vendorAPI.updateTaxProfile(form.taxProfile);
      setForm(prev => ({ ...prev, taxProfile: { ...prev.taxProfile, ...(response.data?.profile || {}) } }));
      toast.success('GST and invoice settings saved');
    } catch (error) { toast.error(error.message || 'Could not save GST settings'); }
    finally { setTaxSaving(false); }
  };

  if (loading) return <div className="text-center py-12 text-gray-400">Loading...</div>;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold">Store Settings</h1><p className="mt-1 text-sm text-gray-500">Brand your storefront and control its customer-facing experience.</p></div><div className="flex items-center gap-2">{store?.slug && <><a href={`/store/${store.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-indigo-600"><ExternalLink size={15} /> Preview store</a><button onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}/store/${store.slug}`); toast.success('Store preview URL copied'); }} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-600"><Copy size={15} /> Copy URL</button></>}</div></div>
      <div className="bg-white rounded-xl shadow-sm p-6 space-y-6 max-w-2xl">
        <div>
          <h2 className="font-semibold mb-3">Branding</h2>
          <div className="space-y-4">
            <BrandingField
              label="Logo"
              type="logo"
              value={form.logo}
              onUrlChange={v => update('logo', v)}
              onFileSelect={f => handleFileUpload('logo', f)}
              uploading={uploadingLogo}
            />
            <BrandingField
              label="Banner"
              type="banner"
              value={form.banner}
              onUrlChange={v => update('banner', v)}
              onFileSelect={f => handleFileUpload('banner', f)}
              uploading={uploadingBanner}
            />
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea className="w-full px-3 py-2 border rounded-lg" rows={3} value={form.description} onChange={e => update('description', e.target.value)} />
            </div>
          </div>
        </div>

        <div data-testid="vendor-tax-settings">
          <h2 className="font-semibold mb-1">GST & invoicing</h2>
          <p className="mb-3 text-xs text-gray-500">GST identity is locked after registration. To change it, create a support ticket for admin approval. Other invoice settings remain editable.</p>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium">Registration type<select data-testid="vendor-tax-registration" disabled={gstLocked} className="mt-1 w-full rounded-lg border px-3 py-2 disabled:bg-gray-100" value={form.taxProfile.registrationType} onChange={e => setForm(prev => ({ ...prev, taxProfile: { ...prev.taxProfile, registrationType: e.target.value } }))}><option value="unregistered">Unregistered</option><option value="gstin">GST registered</option></select></label><label className="text-sm font-medium">Pricing mode<select className="mt-1 w-full rounded-lg border px-3 py-2" value={form.taxProfile.pricingMode} onChange={e => setForm(prev => ({ ...prev, taxProfile: { ...prev.taxProfile, pricingMode: e.target.value } }))}><option value="exclusive">Tax exclusive</option><option value="inclusive">Tax inclusive</option></select></label></div>
            <div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium">GSTIN<input data-testid="vendor-tax-gstin" readOnly={gstLocked} className="mt-1 w-full rounded-lg border px-3 py-2 uppercase read-only:bg-gray-100" value={form.taxProfile.sellerGstin} onChange={e => setForm(prev => ({ ...prev, taxProfile: { ...prev.taxProfile, sellerGstin: e.target.value.toUpperCase() } }))} placeholder="29ABCDE1234F1Z5" /></label><label className="text-sm font-medium">Seller state<input className="mt-1 w-full rounded-lg border px-3 py-2" value={form.taxProfile.originState} onChange={e => setForm(prev => ({ ...prev, taxProfile: { ...prev.taxProfile, originState: e.target.value } }))} placeholder="Delhi" /></label></div>
            <div className="grid grid-cols-2 gap-3"><label className="text-sm font-medium">Invoice business name<input className="mt-1 w-full rounded-lg border px-3 py-2" value={form.taxProfile.businessName} onChange={e => setForm(prev => ({ ...prev, taxProfile: { ...prev.taxProfile, businessName: e.target.value } }))} /></label><label className="text-sm font-medium">Invoice prefix<input className="mt-1 w-full rounded-lg border px-3 py-2 uppercase" maxLength="20" value={form.taxProfile.invoicePrefix} onChange={e => setForm(prev => ({ ...prev, taxProfile: { ...prev.taxProfile, invoicePrefix: e.target.value.toUpperCase() } }))} /></label></div>
            <label className="text-sm font-medium">Default GST rate (%)<input type="number" min="0" max="100" step="0.01" className="mt-1 w-full rounded-lg border px-3 py-2" value={form.taxProfile.defaultRate} onChange={e => setForm(prev => ({ ...prev, taxProfile: { ...prev.taxProfile, defaultRate: e.target.value } }))} /></label>
            <button data-testid="vendor-tax-save" type="button" onClick={handleTaxSave} disabled={taxSaving} className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 disabled:opacity-50">{taxSaving ? 'Saving…' : 'Save GST & invoice settings'}</button>
          </div>
        </div>

        <div>
          <h2 className="font-semibold mb-3">Contact</h2>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium mb-1">Email</label><input className="w-full px-3 py-2 border rounded-lg" value={form.contactEmail} onChange={e => update('contactEmail', e.target.value)} /></div>
            <div><label className="block text-sm font-medium mb-1">Phone</label><input className="w-full px-3 py-2 border rounded-lg" value={form.contactPhone} onChange={e => update('contactPhone', e.target.value)} /></div>
          </div>
        </div>

        <div>
          <h2 className="font-semibold mb-3">Storefront experience</h2>
          <div className="space-y-3">
            <div><label className="block text-sm font-medium mb-1">Store tagline</label><input className="w-full rounded-lg border px-3 py-2" placeholder="Thoughtfully made for everyday living" value={form.storefront.tagline} onChange={e => updateNested('storefront', 'tagline', e.target.value)} /></div>
            <div><label className="block text-sm font-medium mb-1">Announcement bar</label><input className="w-full rounded-lg border px-3 py-2" placeholder="Free shipping on orders over ₹999" value={form.storefront.announcement} onChange={e => updateNested('storefront', 'announcement', e.target.value)} /></div>
            <div className="grid grid-cols-3 gap-3"><div><label className="block text-xs font-medium mb-1">Primary</label><input type="color" className="h-9 w-full cursor-pointer rounded border" value={form.storefront.theme.primaryColor} onChange={e => updateStorefrontTheme('primaryColor', e.target.value)} /></div><div><label className="block text-xs font-medium mb-1">Accent</label><input type="color" className="h-9 w-full cursor-pointer rounded border" value={form.storefront.theme.accentColor} onChange={e => updateStorefrontTheme('accentColor', e.target.value)} /></div><div><label className="block text-xs font-medium mb-1">Surface</label><input type="color" className="h-9 w-full cursor-pointer rounded border" value={form.storefront.theme.surfaceColor} onChange={e => updateStorefrontTheme('surfaceColor', e.target.value)} /></div></div>
          </div>
        </div>

        <div>
          <h2 className="font-semibold mb-3">Social Links</h2>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium mb-1">Website</label><input className="w-full px-3 py-2 border rounded-lg" value={form.socialLinks.website} onChange={e => updateNested('socialLinks', 'website', e.target.value)} /></div>
            <div><label className="block text-sm font-medium mb-1">Facebook</label><input className="w-full px-3 py-2 border rounded-lg" value={form.socialLinks.facebook} onChange={e => updateNested('socialLinks', 'facebook', e.target.value)} /></div>
            <div><label className="block text-sm font-medium mb-1">Instagram</label><input className="w-full px-3 py-2 border rounded-lg" value={form.socialLinks.instagram} onChange={e => updateNested('socialLinks', 'instagram', e.target.value)} /></div>
            <div><label className="block text-sm font-medium mb-1">YouTube</label><input className="w-full px-3 py-2 border rounded-lg" value={form.socialLinks.youtube} onChange={e => updateNested('socialLinks', 'youtube', e.target.value)} /></div>
          </div>
        </div>

        <div>
          <h2 className="font-semibold mb-3">Payout Settings</h2>
          <div><label className="block text-sm font-medium mb-1">Minimum Payout Threshold (₹)</label><input type="number" min="1" className="w-full px-3 py-2 border rounded-lg" value={form.settings.minPayoutThreshold} onChange={e => updateNested('settings', 'minPayoutThreshold', Number(e.target.value))} /></div>
        </div>

        <button onClick={handleSave} disabled={saving} className="px-6 py-2 bg-indigo-600 text-white rounded-lg disabled:opacity-50">{saving ? 'Saving...' : 'Save Settings'}</button>
      </div>
    </div>
  );
}
