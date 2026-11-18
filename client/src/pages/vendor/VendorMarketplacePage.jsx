import { useCallback, useEffect, useState } from 'react';
import { Activity, CheckCircle2, KeyRound, Link2, Package, Play, Plus, RefreshCw, Save, ShoppingBag, Store, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import Loader from '../../components/common/Loader';
import { vendorMarketplaceAPI } from '../../services/api';

const inputClass = 'w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50';

const newForm = provider => ({
  provider,
  name: provider === 'amazon' ? 'Amazon India Seller' : 'Flipkart Seller',
  environment: 'production',
  enabled: true,
  region: 'eu-west-1',
  marketplaceId: provider === 'amazon' ? 'A21TJRUUN4KGV' : '',
  sellerId: '',
  settings: { autoSync: false },
  credentials: {},
});

const Status = ({ value }) => {
  const state = String(value || 'unknown').toLowerCase();
  const colors = state === 'connected' || state === 'published' || state === 'approved' || state === 'completed'
    ? 'bg-emerald-50 text-emerald-700'
    : state === 'failed' || state === 'error' || state === 'rejected'
      ? 'bg-red-50 text-red-700'
      : 'bg-amber-50 text-amber-700';
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${colors}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{state.replaceAll('-', ' ')}</span>;
};

const Field = ({ label, value, onChange, type = 'text', placeholder, help, className = '' }) => (
  <label className={`block ${className}`}>
    <span className="mb-1.5 block text-xs font-semibold text-gray-600">{label}</span>
    <input className={inputClass} type={type} value={value ?? ''} placeholder={placeholder} onChange={event => onChange(type === 'number' ? Number(event.target.value) : event.target.value)} />
    {help && <span className="mt-1 block text-[11px] leading-4 text-gray-400">{help}</span>}
  </label>
);

const ConnectionForm = ({ form, setForm, saving, onSave, onClose }) => {
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const setCredential = (key, value) => setForm(current => ({ ...current, credentials: { ...current.credentials, [key]: value } }));
  const credentials = form.credentials || {};
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm md:items-center md:p-5" onMouseDown={onClose}>
    <div className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl md:rounded-3xl" onMouseDown={event => event.stopPropagation()} data-testid="vendor-marketplace-form">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-6 py-5"><div><p className="text-xs font-bold uppercase tracking-widest text-indigo-500">{form.provider === 'amazon' ? 'Amazon SP-API' : 'Flipkart Seller API'}</p><h2 className="mt-1 text-xl font-bold text-gray-900">{form._id ? 'Edit seller connection' : 'Link seller account'}</h2></div><button type="button" className="rounded-xl p-2 text-gray-400 hover:bg-gray-100" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
      <div className="space-y-6 p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Connection name" value={form.name} onChange={value => set('name', value)} placeholder="Amazon India Seller" />
          <label className="block"><span className="mb-1.5 block text-xs font-semibold text-gray-600">Marketplace</span><select data-testid="vendor-marketplace-provider" className={inputClass} value={form.provider} disabled={Boolean(form._id)} onChange={event => setForm(newForm(event.target.value))}><option value="amazon">Amazon</option><option value="flipkart">Flipkart</option></select></label>
          <label className="block"><span className="mb-1.5 block text-xs font-semibold text-gray-600">Environment</span><select className={inputClass} value={form.environment} onChange={event => set('environment', event.target.value)}><option value="production">Production</option><option value="sandbox">Sandbox / testing</option></select></label>
          {form.provider === 'amazon' && <><Field label="Seller ID" value={form.sellerId} onChange={value => set('sellerId', value)} placeholder="A1..." help="Can be filled after Amazon authorization." /><Field label="Marketplace ID" value={form.marketplaceId} onChange={value => set('marketplaceId', value)} placeholder="A21TJRUUN4KGV" /><Field label="AWS region" value={form.region} onChange={value => set('region', value)} placeholder="eu-west-1" /><Field label="Default product type" value={credentials.defaultProductType} onChange={value => setCredential('defaultProductType', value)} placeholder="PRODUCT" /></>}
        </div>
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-5">
          <div className="mb-4 flex gap-3"><KeyRound size={18} className="mt-0.5 text-indigo-600" /><div><h3 className="text-sm font-bold text-indigo-950">Encrypted seller credentials</h3><p className="mt-1 text-xs leading-5 text-indigo-800/70">Credentials are encrypted at rest and never returned to the browser. Leave a saved secret blank while editing to retain it.</p></div></div>
          <div className="grid gap-4 md:grid-cols-2">
            {form.provider === 'amazon' ? <><Field label="LWA client ID" value={credentials.clientId} onChange={value => setCredential('clientId', value)} placeholder="amzn1.application-oa2-client..." /><Field label="LWA client secret" value={credentials.clientSecret} onChange={value => setCredential('clientSecret', value)} type="password" placeholder="Saved secret stays hidden" /><Field label="LWA refresh token" value={credentials.refreshToken} onChange={value => setCredential('refreshToken', value)} type="password" placeholder="At1|..." className="md:col-span-2" /><Field label="AWS access key ID" value={credentials.awsAccessKeyId} onChange={value => setCredential('awsAccessKeyId', value)} placeholder="AKIA..." /><Field label="AWS secret access key" value={credentials.awsSecretAccessKey} onChange={value => setCredential('awsSecretAccessKey', value)} type="password" placeholder="Saved secret stays hidden" /><Field label="AWS session token (optional)" value={credentials.awsSessionToken} onChange={value => setCredential('awsSessionToken', value)} type="password" className="md:col-span-2" /></> : <><Field label="Application ID" value={credentials.appId} onChange={value => setCredential('appId', value)} placeholder="Flipkart app ID" /><Field label="Application secret" value={credentials.appSecret} onChange={value => setCredential('appSecret', value)} type="password" placeholder="Saved secret stays hidden" /><Field label="Refresh token (optional)" value={credentials.refreshToken} onChange={value => setCredential('refreshToken', value)} type="password" /><Field label="Access token (optional)" value={credentials.accessToken} onChange={value => setCredential('accessToken', value)} type="password" /></>}
          </div>
        </div>
        {form.provider === 'amazon' ? <div className="grid gap-4 rounded-2xl border border-gray-100 p-5 md:grid-cols-2"><Field label="Currency" value={credentials.currency || 'INR'} onChange={value => setCredential('currency', value)} placeholder="INR" /><Field label="Language tag" value={credentials.languageTag || 'en_IN'} onChange={value => setCredential('languageTag', value)} placeholder="en_IN" /><Field label="Default brand" value={credentials.defaultBrand} onChange={value => setCredential('defaultBrand', value)} placeholder="Tatoz" /></div> : <div className="grid gap-4 rounded-2xl border border-gray-100 p-5 md:grid-cols-2"><Field label="Location ID" value={credentials.locationId} onChange={value => setCredential('locationId', value)} placeholder="Seller location ID" help="Required for listing inventory." /><Field label="Default HSN" value={credentials.hsn} onChange={value => setCredential('hsn', value)} placeholder="8-digit HSN" /><Field label="GST tax code" value={credentials.taxCode || 'GST_18'} onChange={value => setCredential('taxCode', value)} placeholder="GST_18" /><Field label="Dispatch SLA (days)" value={credentials.dispatchSla || 2} onChange={value => setCredential('dispatchSla', value)} type="number" /></div>}
        <label className="flex items-center justify-between rounded-2xl border border-gray-100 p-4"><div><p className="text-sm font-bold text-gray-800">Automatic product sync</p><p className="mt-1 text-xs text-gray-500">Allow scheduled product and inventory sync. Seller marketplace accounts cannot import orders.</p></div><button type="button" role="switch" aria-checked={Boolean(form.settings?.autoSync)} onClick={() => setForm(current => ({ ...current, settings: { ...current.settings, autoSync: !current.settings?.autoSync } }))} className={`relative h-6 w-11 rounded-full transition ${form.settings?.autoSync ? 'bg-indigo-600' : 'bg-gray-300'}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${form.settings?.autoSync ? 'right-0.5' : 'left-0.5'}`} /></button></label>
      </div>
      <div className="sticky bottom-0 flex justify-end gap-3 border-t border-gray-100 bg-white px-6 py-4"><button type="button" className={`${buttonClass} border border-gray-200 bg-white text-gray-600`} onClick={onClose}>Cancel</button><button type="button" data-testid="vendor-marketplace-save" className={`${buttonClass} bg-indigo-600 text-white hover:bg-indigo-700`} disabled={saving} onClick={onSave}>{saving ? <Loader size="sm" /> : <Save size={16} />}Save connection</button></div>
    </div>
  </div>;
};

const VendorMarketplacePage = () => {
  const [connections, setConnections] = useState([]);
  const [products, setProducts] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [listings, setListings] = useState([]);
  const [stats, setStats] = useState({});
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [selectedConnection, setSelectedConnection] = useState('');

  const load = useCallback(async () => {
    try {
      const [connectionResponse, productResponse, statsResponse, jobsResponse, listingsResponse] = await Promise.all([
        vendorMarketplaceAPI.getConnections(), vendorMarketplaceAPI.getProducts(), vendorMarketplaceAPI.getStats(),
        vendorMarketplaceAPI.getJobs({ limit: 20 }), vendorMarketplaceAPI.getListings({ limit: 100 }),
      ]);
      const nextConnections = connectionResponse.data?.connections || [];
      setConnections(nextConnections);
      setProducts(productResponse.data?.products || []);
      setStats(statsResponse.data?.stats || {});
      setJobs(jobsResponse.data?.jobs || []);
      setListings(listingsResponse.data?.listings || []);
      setSelectedConnection(current => current || nextConnections[0]?._id || '');
    } catch (error) {
      toast.error(error.message || 'Could not load marketplace settings');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveConnection = async () => {
    if (!form?.name?.trim()) return toast.error('Connection name is required');
    setSaving(true);
    try {
      if (form._id) await vendorMarketplaceAPI.updateConnection(form._id, form);
      else await vendorMarketplaceAPI.createConnection(form);
      toast.success('Marketplace connection saved');
      setForm(null);
      await load();
    } catch (error) { toast.error(error.message || 'Could not save marketplace connection'); }
    finally { setSaving(false); }
  };

  const runSync = async (connection, type, productId) => {
    if (!connection) return toast.error('Link a marketplace account first');
    setBusyId(`${connection._id}:${productId || type}`);
    try {
      await vendorMarketplaceAPI.startSync(connection._id, { type, ...(productId ? { productId } : {}) });
      toast.success(type === 'publish-product' ? 'Product sync job queued' : 'Marketplace sync job queued');
      await load();
    } catch (error) { toast.error(error.message || 'Could not start marketplace sync'); }
    finally { setBusyId(null); }
  };

  const remove = async connection => {
    if (!window.confirm(`Unlink ${connection.name} and remove its vendor mappings?`)) return;
    try { await vendorMarketplaceAPI.deleteConnection(connection._id); toast.success('Marketplace account unlinked'); await load(); } catch (error) { toast.error(error.message || 'Could not unlink marketplace account'); }
  };

  const testConnection = async connection => {
    setBusyId(`${connection._id}:test`);
    try { const response = await vendorMarketplaceAPI.testConnection(connection._id); toast.success(response.data?.message || 'Connection verified'); await load(); } catch (error) { toast.error(error.message || 'Connection test failed'); }
    finally { setBusyId(null); }
  };

  const authorize = async connection => {
    setBusyId(`${connection._id}:authorize`);
    try { const response = await vendorMarketplaceAPI.authorize(connection._id); window.open(response.data.authorizationUrl, '_blank', 'noopener,noreferrer,width=720,height=760'); toast.success('Authorization window opened'); } catch (error) { toast.error(error.message || 'Could not start authorization'); }
    finally { setBusyId(null); }
  };

  if (loading) return <div className="flex justify-center py-20"><Loader size="lg" /></div>;
  const selected = connections.find(connection => connection._id === selectedConnection);
  return <div className="space-y-6 pb-10" data-testid="vendor-marketplace-page">
    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-indigo-600"><Store size={15} />Vendor marketplace</div><h1 className="text-2xl font-bold text-gray-900">Amazon & Flipkart</h1><p className="mt-1 max-w-2xl text-sm text-gray-500">Link your seller accounts and sync your own catalog. Products become eligible only after admin approval.</p></div><div className="flex flex-wrap gap-2"><button type="button" data-testid="vendor-marketplace-add-amazon" className={`${buttonClass} bg-orange-600 text-white`} onClick={() => setForm(newForm('amazon'))}><Plus size={16} />Amazon</button><button type="button" data-testid="vendor-marketplace-add-flipkart" className={`${buttonClass} bg-blue-600 text-white`} onClick={() => setForm(newForm('flipkart'))}><Plus size={16} />Flipkart</button></div></div>
    <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4 text-sm leading-6 text-indigo-900" data-testid="vendor-marketplace-approval-note"><strong>Approval required:</strong> new or edited products stay hidden from shoppers and cannot sync to Amazon or Flipkart until an admin approves them.</div>
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5"><div className="rounded-2xl border border-gray-100 bg-white p-4"><p className="text-2xl font-bold text-gray-900">{stats.connections || 0}</p><p className="mt-1 text-xs text-gray-500">Linked accounts</p></div><div className="rounded-2xl border border-gray-100 bg-white p-4"><p className="text-2xl font-bold text-gray-900">{stats.listings || 0}</p><p className="mt-1 text-xs text-gray-500">Synced product listings</p></div><div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4"><p className="text-2xl font-bold text-indigo-700">Products only</p><p className="mt-1 text-xs text-indigo-700/70">Orders are not imported</p></div><div className="rounded-2xl border border-gray-100 bg-white p-4"><p className="text-2xl font-bold text-gray-900">{products.filter(product => product.approvalStatus === 'pending').length}</p><p className="mt-1 text-xs text-gray-500">Awaiting approval</p></div><div className="rounded-2xl border border-gray-100 bg-white p-4"><p className="text-2xl font-bold text-gray-900">{stats.activeJobs || 0}</p><p className="mt-1 text-xs text-gray-500">Active product jobs</p></div></div>
    <div className="grid gap-5 lg:grid-cols-2">{connections.map(connection => <article key={connection._id} data-testid="vendor-marketplace-connection" className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-4"><div className="flex items-start gap-3"><div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${connection.provider === 'amazon' ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600'}`}>{connection.provider === 'amazon' ? <ShoppingBag size={21} /> : <Store size={21} />}</div><div><h2 className="font-bold text-gray-900">{connection.name}</h2><p className="mt-1 text-xs uppercase tracking-wider text-gray-400">{connection.provider} · {connection.environment}</p></div></div><Status value={connection.status} /></div>{connection.lastError && <p className="mt-4 rounded-xl bg-red-50 p-3 text-xs leading-5 text-red-700">{connection.lastError}</p>}<div className="mt-4 grid grid-cols-2 gap-3 text-xs text-gray-500"><div><span className="block text-gray-400">Credentials</span><span className="font-medium text-gray-700">{connection.credentialHints?.hasClientId || connection.credentialHints?.hasAppId || connection.credentialHints?.hasAccessToken ? 'Configured' : 'Missing'}</span></div><div><span className="block text-gray-400">Last sync</span><span className="font-medium text-gray-700">{connection.lastSyncAt ? new Date(connection.lastSyncAt).toLocaleString() : 'Never'}</span></div></div><div className="mt-5 flex flex-wrap gap-2 border-t border-gray-100 pt-4"><button type="button" className={`${buttonClass} bg-indigo-50 text-indigo-700`} onClick={() => testConnection(connection)} disabled={busyId === `${connection._id}:test`}><CheckCircle2 size={15} />Test</button>{connection.status !== 'connected' && <button type="button" className={`${buttonClass} bg-emerald-50 text-emerald-700`} onClick={() => authorize(connection)} disabled={busyId === `${connection._id}:authorize`}><Link2 size={15} />Authorize</button>}<button type="button" data-testid="vendor-marketplace-sync" className={`${buttonClass} bg-gray-100 text-gray-700`} onClick={() => runSync(connection, 'sync-products')} disabled={busyId === `${connection._id}:sync-products`}><RefreshCw size={14} />Sync approved</button><button type="button" className="ml-auto rounded-xl p-2 text-gray-400 hover:bg-gray-100" onClick={() => setForm({ ...newForm(connection.provider), ...connection, credentials: {} })} aria-label="Edit connection"><KeyRound size={16} /></button><button type="button" className="rounded-xl p-2 text-gray-400 hover:bg-red-50 hover:text-red-600" onClick={() => remove(connection)} aria-label="Unlink connection"><Trash2 size={16} /></button></div></article>)}{!connections.length && <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center lg:col-span-2"><Store className="mx-auto text-gray-300" size={34} /><h2 className="mt-3 font-bold text-gray-800">No seller account linked</h2><p className="mt-1 text-sm text-gray-500">Link Amazon or Flipkart to unlock vendor-owned catalog sync.</p></div>}</div>
    <section className="rounded-2xl border border-gray-100 bg-white shadow-sm"><div className="flex flex-col justify-between gap-3 border-b border-gray-100 p-5 md:flex-row md:items-center"><div><h2 className="font-bold text-gray-900">Your products</h2><p className="mt-1 text-xs text-gray-500">Only approved active products can be synced. Pending and rejected products remain visible here for status tracking.</p></div>{connections.length > 0 && <label className="flex items-center gap-2 text-xs font-semibold text-gray-600">Sync account<select className={`${inputClass} min-w-[180px]`} value={selectedConnection} onChange={event => setSelectedConnection(event.target.value)}>{connections.map(connection => <option key={connection._id} value={connection._id}>{connection.name}</option>)}</select></label>}</div><div className="divide-y divide-gray-100">{products.map(product => { const approval = product.approvalStatus || 'approved'; const canSync = approval === 'approved' && product.isActive !== false; const mapping = listings.find(item => item.product?._id === product._id); return <div key={product._id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between" data-testid="vendor-marketplace-product"><div className="flex min-w-0 items-center gap-3"><img src={product.thumbnail || product.images?.[0]?.url} className="h-10 w-10 rounded-lg object-cover" alt="" /><div className="min-w-0"><p className="truncate font-semibold text-gray-800">{product.title}</p><p className="mt-1 text-xs text-gray-500">{product.sku || 'No SKU'} · ₹{product.price || 0} · {mapping ? `Listing ${mapping.status}` : 'Not mapped'}</p></div></div><div className="flex items-center gap-2"><Status value={approval} />{canSync && selected ? <button type="button" className={`${buttonClass} bg-indigo-50 text-indigo-700`} onClick={() => runSync(selected, 'publish-product', product._id)} disabled={busyId === `${selected._id}:${product._id}`}><Play size={14} />Sync product</button> : !canSync && <span className="text-xs font-medium text-gray-400">Waiting for admin approval</span>}</div></div>; })}{!products.length && <div className="p-12 text-center text-sm text-gray-400">No products found.</div>}</div></section>
    <section className="grid gap-5 lg:grid-cols-2"><div className="rounded-2xl border border-gray-100 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-gray-100 p-5"><h2 className="flex items-center gap-2 font-bold text-gray-900"><Activity size={17} className="text-indigo-600" />Recent product sync jobs</h2><button type="button" className="rounded-xl p-2 text-gray-400 hover:bg-gray-100" onClick={load} aria-label="Refresh"><RefreshCw size={16} /></button></div><div className="divide-y divide-gray-100">{jobs.map(job => <div key={job._id} className="flex items-center justify-between gap-3 p-4"><div><p className="text-sm font-semibold text-gray-800">{job.type.replaceAll('-', ' ')}</p><p className="mt-1 text-xs text-gray-500">{job.connection?.name || job.provider} · {job.stats?.succeeded || 0} succeeded · {job.stats?.failed || 0} failed</p></div><Status value={job.status} /></div>)}{!jobs.length && <p className="p-8 text-center text-sm text-gray-400">No product sync jobs yet.</p>}</div></div><div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"><h2 className="flex items-center gap-2 font-bold text-gray-900"><Package size={17} className="text-indigo-600" />Safe product-only workflow</h2><ol className="mt-4 space-y-3 text-sm leading-6 text-gray-600"><li><strong className="text-gray-900">1.</strong> Link an account and keep credentials encrypted.</li><li><strong className="text-gray-900">2.</strong> Submit products; admin approval makes them live.</li><li><strong className="text-gray-900">3.</strong> Sync only approved products and inventory. Seller orders stay in the Tatoz order panel.</li></ol></div></section>
    {form && <ConnectionForm form={form} setForm={setForm} saving={saving} onSave={saveConnection} onClose={() => setForm(null)} />}
  </div>;
};

export default VendorMarketplacePage;
