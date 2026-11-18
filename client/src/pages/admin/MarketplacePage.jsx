import { useCallback, useEffect, useState } from 'react';
import { Activity, AlertCircle, CheckCircle2, HelpCircle, CloudCog, ExternalLink, KeyRound, Link2, Package, Play, Plus, RefreshCw, Save, Settings2, ShoppingBag, Store, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { marketplaceAPI, productAPI } from '../../services/api';
import Loader from '../../components/common/Loader';

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
  settings: { autoSync: true },
  credentials: {},
});

const listFrom = (response, keys) => {
  for (const key of keys) if (Array.isArray(response?.data?.[key])) return response.data[key];
  return [];
};

const Status = ({ value }) => {
  const state = String(value || 'unknown').toLowerCase();
  const colors = state === 'connected' || state === 'published' || state === 'completed'
    ? 'bg-emerald-50 text-emerald-700'
    : state === 'failed' || state === 'error'
      ? 'bg-red-50 text-red-700'
      : 'bg-gray-100 text-gray-600';
  return <span className={'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ' + colors}><span className="h-1.5 w-1.5 rounded-full bg-current" />{state.replaceAll('-', ' ')}</span>;
};

const Field = ({ label, value, onChange, type = 'text', placeholder, className = '', help }) => (
  <label className={'block ' + className}>
    <span className="mb-1.5 block text-xs font-semibold text-gray-600">{label}</span>
    <input className={inputClass} type={type} value={value ?? ''} placeholder={placeholder} onChange={e => onChange(type === 'number' ? Number(e.target.value) : e.target.value)} />
    {help && <span className="mt-1 block text-[11px] leading-4 text-gray-400">{help}</span>}
  </label>
);

const Textarea = ({ label, value, onChange, placeholder, help }) => (
  <label className="block">
    <span className="mb-1.5 block text-xs font-semibold text-gray-600">{label}</span>
    <textarea className={inputClass + ' min-h-28 resize-y font-mono text-xs'} value={value ?? ''} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
    {help && <span className="mt-1 block text-[11px] leading-4 text-gray-400">{help}</span>}
  </label>
);

const Select = ({ label, value, onChange, options }) => (
  <label className="block">
    <span className="mb-1.5 block text-xs font-semibold text-gray-600">{label}</span>
    <select className={inputClass} value={value ?? ''} onChange={e => onChange(e.target.value)}>{options.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
  </label>
);

const Metric = ({ icon: Icon, label, value }) => (
  <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
    <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><Icon size={18} /></div>
    <p className="text-2xl font-bold text-gray-900">{value || 0}</p>
    <p className="mt-1 text-xs text-gray-500">{label}</p>
  </div>
);

const ConnectionForm = ({ form, setForm, save, close, saving }) => {
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  const setCredential = (key, value) => setForm(current => ({ ...current, credentials: { ...current.credentials, [key]: value } }));
  const credentials = form.credentials || {};
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm md:items-center md:p-5" onMouseDown={close}>
    <div className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl md:rounded-3xl" onMouseDown={e => e.stopPropagation()}>
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white px-6 py-5"><div><p className="text-xs font-bold uppercase tracking-widest text-indigo-500">{form.provider === 'amazon' ? 'Amazon SP-API' : 'Flipkart Seller API'}</p><h2 className="mt-1 text-xl font-bold text-gray-900">{form._id ? 'Edit connection' : 'Add connection'}</h2></div><button className="rounded-xl p-2 text-gray-400 hover:bg-gray-100" onClick={close}><X size={18} /></button></div>
      <div className="space-y-6 p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Connection name" value={form.name} onChange={v => set('name', v)} placeholder="Amazon India Seller" />
          <Select label="Environment" value={form.environment} onChange={v => set('environment', v)} options={[{ value: 'production', label: 'Production' }, { value: 'sandbox', label: 'Sandbox / testing' }]} />
          {form.provider === 'amazon' && <><Field label="Seller ID" value={form.sellerId} onChange={v => set('sellerId', v)} placeholder="A1..." help="Filled automatically after Amazon OAuth when available." /><Field label="Marketplace ID" value={form.marketplaceId} onChange={v => set('marketplaceId', v)} placeholder="A21TJRUUN4KGV" /><Field label="AWS region" value={form.region} onChange={v => set('region', v)} placeholder="eu-west-1" /><Field label="Default product type" value={credentials.defaultProductType} onChange={v => setCredential('defaultProductType', v)} placeholder="PRODUCT" /></>}
        </div>
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-5">
          <div className="mb-4 flex gap-3"><KeyRound size={18} className="mt-0.5 text-indigo-600" /><div><h3 className="text-sm font-bold text-indigo-950">Encrypted credentials</h3><p className="mt-1 text-xs leading-5 text-indigo-800/70">Secrets are encrypted at rest. Leave a secret blank during edit to retain the saved value.</p></div></div>
          <div className="grid gap-4 md:grid-cols-2">
            {form.provider === 'amazon' ? <><Field label="LWA client ID" value={credentials.clientId} onChange={v => setCredential('clientId', v)} placeholder="amzn1.application-oa2-client..." /><Field label="LWA client secret" value={credentials.clientSecret} onChange={v => setCredential('clientSecret', v)} type="password" placeholder="Saved secret stays hidden" /><Field label="LWA refresh token" value={credentials.refreshToken} onChange={v => setCredential('refreshToken', v)} type="password" placeholder="At1|..." className="md:col-span-2" help="Private apps can paste the self-authorized refresh token; public apps can use Authorize." /><Field label="AWS access key ID" value={credentials.awsAccessKeyId} onChange={v => setCredential('awsAccessKeyId', v)} placeholder="AKIA..." /><Field label="AWS secret access key" value={credentials.awsSecretAccessKey} onChange={v => setCredential('awsSecretAccessKey', v)} type="password" placeholder="Saved secret stays hidden" /><Field label="AWS session token (optional)" value={credentials.awsSessionToken} onChange={v => setCredential('awsSessionToken', v)} type="password" className="md:col-span-2" /></> : <><Field label="Application ID" value={credentials.appId} onChange={v => setCredential('appId', v)} placeholder="Flipkart app ID" /><Field label="Application secret" value={credentials.appSecret} onChange={v => setCredential('appSecret', v)} type="password" placeholder="Saved secret stays hidden" /><Field label="Refresh token (optional)" value={credentials.refreshToken} onChange={v => setCredential('refreshToken', v)} type="password" /><Field label="Access token (optional)" value={credentials.accessToken} onChange={v => setCredential('accessToken', v)} type="password" /></>}
          </div>
        </div>
        {form.provider === 'amazon' ? <div className="grid gap-4 rounded-2xl border border-gray-100 p-5 md:grid-cols-2"><Field label="Currency" value={credentials.currency || 'INR'} onChange={v => setCredential('currency', v)} placeholder="INR" /><Field label="Language tag" value={credentials.languageTag || 'en_IN'} onChange={v => setCredential('languageTag', v)} placeholder="en_IN" /><Field label="Default brand" value={credentials.defaultBrand} onChange={v => setCredential('defaultBrand', v)} placeholder="Tatoz" /></div> : <div className="grid gap-4 rounded-2xl border border-gray-100 p-5 md:grid-cols-2"><Field label="Location ID" value={credentials.locationId} onChange={v => setCredential('locationId', v)} placeholder="Seller location ID" help="Required for listing inventory." /><Field label="Default HSN" value={credentials.hsn} onChange={v => setCredential('hsn', v)} placeholder="8-digit HSN" /><Field label="GST tax code" value={credentials.taxCode || 'GST_18'} onChange={v => setCredential('taxCode', v)} placeholder="GST_18" /><Field label="Dispatch SLA (days)" value={credentials.dispatchSla || 2} onChange={v => setCredential('dispatchSla', v)} type="number" /></div>}
        <label className="flex items-center justify-between rounded-2xl border border-gray-100 p-4"><div><p className="text-sm font-bold text-gray-800">Automatic sync</p><p className="mt-1 text-xs text-gray-500">Import orders and push inventory every 15 minutes when connected.</p></div><button type="button" onClick={() => setForm(current => ({ ...current, settings: { ...current.settings, autoSync: !current.settings?.autoSync } }))} className={'relative h-6 w-11 rounded-full transition ' + (form.settings?.autoSync ? 'bg-indigo-600' : 'bg-gray-300')}><span className={'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ' + (form.settings?.autoSync ? 'right-0.5' : 'left-0.5')} /></button></label>
      </div>
      <div className="sticky bottom-0 flex justify-end gap-3 border-t border-gray-100 bg-white px-6 py-4"><button className={buttonClass + ' border border-gray-200 bg-white text-gray-600'} onClick={close}>Cancel</button><button className={buttonClass + ' bg-indigo-600 text-white hover:bg-indigo-700'} disabled={saving} onClick={save}>{saving ? <Loader size="sm" /> : <Save size={16} />}Save connection</button></div>
    </div>
  </div>;
};

const ConnectionCard = ({ connection, onEdit, onTest, onAuthorize, onSync, onDelete, busy }) => (
  <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
    <div className="flex items-start justify-between gap-4"><div className="flex items-start gap-3"><div className={'flex h-11 w-11 items-center justify-center rounded-2xl ' + (connection.provider === 'amazon' ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600')}>{connection.provider === 'amazon' ? <ShoppingBag size={21} /> : <Store size={21} />}</div><div><h3 className="font-bold text-gray-900">{connection.name}</h3><p className="mt-1 text-xs uppercase tracking-wider text-gray-400">{connection.provider === 'amazon' ? 'Amazon SP-API' : 'Flipkart Seller API'} · {connection.environment}</p></div></div><Status value={connection.status} /></div>
    {connection.lastError && <div className="mt-4 flex gap-2 rounded-xl bg-red-50 p-3 text-xs leading-5 text-red-700"><AlertCircle size={15} className="mt-0.5 flex-shrink-0" />{connection.lastError}</div>}
    <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-gray-500"><div><span className="block text-gray-400">Credentials</span><span className="font-medium text-gray-700">{connection.credentialHints?.hasClientId || connection.credentialHints?.hasAccessToken ? 'Configured' : 'Missing'}</span></div><div><span className="block text-gray-400">Last sync</span><span className="font-medium text-gray-700">{connection.lastSyncAt ? new Date(connection.lastSyncAt).toLocaleString() : 'Never'}</span></div></div>
    <div className="mt-5 flex flex-wrap gap-2 border-t border-gray-100 pt-4"><button className={buttonClass + ' bg-indigo-50 text-indigo-700'} onClick={onTest} disabled={busy}><CheckCircle2 size={15} />Test</button>{connection.status !== 'connected' && <button className={buttonClass + ' bg-emerald-50 text-emerald-700'} onClick={onAuthorize} disabled={busy}><Link2 size={15} />Authorize</button>}<button className={buttonClass + ' bg-gray-100 text-gray-700'} onClick={onSync} disabled={busy}><RefreshCw size={15} />Sync all</button><button className="ml-auto rounded-xl p-2 text-gray-400 hover:bg-gray-100" onClick={onEdit}><Settings2 size={16} /></button><button className="rounded-xl p-2 text-gray-400 hover:bg-red-50 hover:text-red-600" onClick={onDelete}><Trash2 size={16} /></button></div>
  </div>
);

const MarketplacePage = () => {
  const [tab, setTab] = useState('overview');
  const [connections, setConnections] = useState([]);
  const [stats, setStats] = useState({});
  const [jobs, setJobs] = useState([]);
  const [listings, setListings] = useState([]);
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(null);
  const [publish, setPublish] = useState(null);
  const [mapping, setMapping] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const loadBase = useCallback(async () => {
    try { const responses = await Promise.all([marketplaceAPI.getConnections(), marketplaceAPI.getStats()]); setConnections(responses[0].data.connections || []); setStats(responses[1].data.stats || {}); } catch (error) { toast.error(error.message || 'Could not load marketplace module'); } finally { setLoading(false); }
  }, []);
  const loadTab = useCallback(async () => {
    try {
      if (tab === 'activity') setJobs((await marketplaceAPI.getJobs()).data.jobs || []);
      if (tab === 'orders') setOrders((await marketplaceAPI.getOrders({ limit: 100 })).data.orders || []);
      if (tab === 'listings') { const responses = await Promise.all([marketplaceAPI.getListings(), productAPI.adminGetAll({ limit: 200 })]); setListings(responses[0].data.listings || []); setProducts(listFrom(responses[1], ['products', 'items'])); }
    } catch (error) { toast.error(error.message || 'Could not load marketplace data'); }
  }, [tab]);
  useEffect(() => { loadBase(); }, [loadBase]);
  useEffect(() => { loadTab(); }, [loadTab]);

  const runSync = async (connection, type, productId, extra = {}) => { setBusyId(connection._id); try { await marketplaceAPI.startSync(connection._id, { type, productId, ...extra }); toast.success('Sync job queued'); setTimeout(() => { loadBase(); loadTab(); }, 1500); } catch (error) { toast.error(error.message || 'Could not start sync'); } finally { setBusyId(null); } };
  const saveConnection = async () => { if (!form?.name?.trim()) return toast.error('Connection name is required'); setSaving(true); try { if (form._id) await marketplaceAPI.updateConnection(form._id, form); else await marketplaceAPI.createConnection(form); toast.success('Marketplace connection saved'); setForm(null); loadBase(); } catch (error) { toast.error(error.message || 'Could not save connection'); } finally { setSaving(false); } };
  const testConnection = async connection => { setBusyId(connection._id); try { const response = await marketplaceAPI.testConnection(connection._id); toast.success(response.data.message || 'Connection is valid'); loadBase(); } catch (error) { toast.error(error.message || 'Connection test failed'); loadBase(); } finally { setBusyId(null); } };
  const authorize = async connection => { setBusyId(connection._id); try { const response = await marketplaceAPI.authorize(connection._id); window.open(response.data.authorizationUrl, '_blank', 'noopener,noreferrer,width=720,height=760'); toast.success('Authorization window opened'); } catch (error) { toast.error(error.message || 'Could not start authorization'); } finally { setBusyId(null); } };
  const remove = async connection => { if (!window.confirm('Remove ' + connection.name + ' and its marketplace mappings?')) return; try { await marketplaceAPI.deleteConnection(connection._id); toast.success('Connection removed'); loadBase(); } catch (error) { toast.error(error.message || 'Could not remove connection'); } };
  const submitPublish = async () => { if (!publish?.connectionId) return toast.error('Select a marketplace connection'); let overridePayload = {}; if (mapping.overridePayload?.trim()) { try { overridePayload = JSON.parse(mapping.overridePayload); } catch (_) { return toast.error('Advanced attributes must be valid JSON'); } } try { await marketplaceAPI.startSync(publish.connectionId, { type: 'publish-product', productId: publish.product._id, mapping: { ...mapping, overridePayload, metadata: { hsn: mapping.hsn, taxCode: mapping.taxCode } } }); toast.success('Product publishing job queued'); setPublish(null); setTab('activity'); loadTab(); } catch (error) { toast.error(error.message || 'Could not publish product'); } };

  const tabs = [{ id: 'overview', label: 'Overview', icon: CloudCog }, { id: 'connections', label: 'Connections', icon: Link2 }, { id: 'listings', label: 'Listings & products', icon: Package }, { id: 'orders', label: 'Marketplace orders', icon: ShoppingBag }, { id: 'activity', label: 'Activity log', icon: Activity }];
  if (loading) return <div className="flex justify-center py-20"><Loader size="lg" /></div>;
  return <div className="space-y-6 pb-10">
    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-indigo-600"><Store size={15} />Marketplace control center</div><h1 className="text-2xl font-bold text-gray-900">Amazon & Flipkart</h1><p className="mt-1 max-w-2xl text-sm text-gray-500">Configure seller APIs once, then publish products, sync inventory and import marketplace orders in one place.</p></div><button className={buttonClass + ' bg-indigo-600 text-white'} onClick={() => setForm(newForm('amazon'))}><Plus size={17} />Add connection</button></div>
    <div className="flex gap-1 overflow-x-auto rounded-2xl border border-gray-100 bg-white p-1 shadow-sm">{tabs.map(item => <button key={item.id} onClick={() => setTab(item.id)} className={'flex flex-shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold ' + (tab === item.id ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:bg-gray-50')}><item.icon size={15} />{item.label}</button>)}</div>
    {tab === 'overview' && <><div className="grid grid-cols-2 gap-4 lg:grid-cols-5"><Metric icon={Link2} label="Connections" value={stats.connections} /><Metric icon={Package} label="Mapped listings" value={stats.listings} /><Metric icon={ShoppingBag} label="Imported orders" value={stats.orders} /><Metric icon={Activity} label="Active jobs" value={stats.activeJobs} /><Metric icon={AlertCircle} label="Failed listings" value={stats.failedListings} /></div><div className="grid gap-5 lg:grid-cols-2">{connections.map(connection => <ConnectionCard key={connection._id} connection={connection} busy={busyId === connection._id} onEdit={() => setForm({ ...newForm(connection.provider), ...connection, credentials: {} })} onTest={() => testConnection(connection)} onAuthorize={() => authorize(connection)} onSync={() => runSync(connection, 'sync-all')} onDelete={() => remove(connection)} />)}{!connections.length && <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center lg:col-span-2"><Store className="mx-auto text-gray-300" size={34} /><h3 className="mt-3 font-bold text-gray-800">No marketplace connection yet</h3><p className="mt-1 text-sm text-gray-500">Add Amazon or Flipkart credentials to unlock seller workflows.</p></div>}</div><div className="grid gap-5 lg:grid-cols-2"><div className="rounded-2xl border border-gray-100 bg-white p-5"><h3 className="flex items-center gap-2 font-bold text-gray-900"><HelpCircle size={17} className="text-indigo-600" />Amazon setup</h3><p className="mt-3 text-sm leading-6 text-gray-500">Create a private SP-API app, complete LWA authorization and provide IAM credentials for SigV4 signing. Public apps use the Authorize button after the redirect URI is registered.</p><a className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600" href="https://developer-docs.amazon/sp-api" target="_blank" rel="noreferrer">Read docs <ExternalLink size={12} /></a></div><div className="rounded-2xl border border-gray-100 bg-white p-5"><h3 className="flex items-center gap-2 font-bold text-gray-900"><HelpCircle size={17} className="text-blue-600" />Flipkart setup</h3><p className="mt-3 text-sm leading-6 text-gray-500">Create the API application in Seller Dashboard → Manage Profile → Developer Access. Listing creation also needs product ID/FSN, HSN, GST tax code and location ID.</p><a className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-blue-600" href="https://seller.flipkart.com/api-docs/FMSAPI.html" target="_blank" rel="noreferrer">Read docs <ExternalLink size={12} /></a></div></div></>}
    {tab === 'connections' && <div className="space-y-4"><div className="flex items-center justify-between"><h2 className="font-bold text-gray-900">Seller connections</h2><div className="flex gap-2"><button className={buttonClass + ' border border-gray-200 bg-white text-gray-700'} onClick={() => setForm(newForm('flipkart'))}><Plus size={15} />Flipkart</button><button className={buttonClass + ' bg-indigo-600 text-white'} onClick={() => setForm(newForm('amazon'))}><Plus size={15} />Amazon</button></div></div><div className="grid gap-5 lg:grid-cols-2">{connections.map(connection => <ConnectionCard key={connection._id} connection={connection} busy={busyId === connection._id} onEdit={() => setForm({ ...newForm(connection.provider), ...connection, credentials: {} })} onTest={() => testConnection(connection)} onAuthorize={() => authorize(connection)} onSync={() => runSync(connection, 'sync-all')} onDelete={() => remove(connection)} />)}</div></div>}
    {tab === 'listings' && <div className="rounded-2xl border border-gray-100 bg-white shadow-sm"><div className="flex flex-col justify-between gap-3 border-b border-gray-100 p-5 md:flex-row md:items-center"><div><h2 className="font-bold text-gray-900">Product publishing</h2><p className="mt-1 text-xs text-gray-500">Create mappings once; inventory sync then follows local product stock.</p></div><div className="flex flex-wrap gap-2">{connections.map(connection => <button key={connection._id} onClick={() => runSync(connection, 'sync-products')} className={buttonClass + ' bg-gray-100 text-gray-700'} disabled={busyId === connection._id}><RefreshCw size={14} />Push all to {connection.provider}</button>)}</div></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-400"><tr><th className="px-5 py-3">Product</th><th className="px-5 py-3">SKU</th><th className="px-5 py-3">Price / stock</th><th className="px-5 py-3">Mappings</th><th className="px-5 py-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-gray-100">{products.map(product => { const mapped = listings.filter(item => item.product?._id === product._id); return <tr key={product._id} className="hover:bg-gray-50"><td className="px-5 py-3"><div className="flex items-center gap-3"><img src={product.thumbnail || product.images?.[0]?.url} className="h-10 w-10 rounded-lg object-cover" alt="" /><span className="max-w-[230px] truncate font-semibold text-gray-800">{product.title}</span></div></td><td className="px-5 py-3 font-mono text-xs text-gray-500">{product.sku || '—'}</td><td className="px-5 py-3 text-xs text-gray-600">₹{product.price} · {product.stock} in stock</td><td className="px-5 py-3"><div className="flex flex-wrap gap-1">{mapped.length ? mapped.map(item => <Status key={item._id} value={item.status} />) : <span className="text-xs text-gray-400">Not mapped</span>}</div></td><td className="px-5 py-3 text-right"><button className={buttonClass + ' bg-indigo-50 text-indigo-700'} onClick={() => { const connection = connections.find(item => item.status === 'connected') || connections[0]; setPublish({ product, connectionId: connection?._id || '' }); setMapping({ channelSku: product.sku || '', remoteProductId: '', productType: '', hsn: '', taxCode: '', overridePayload: '' }); }}><Play size={14} />Publish</button></td></tr>; })}</tbody></table>{!products.length && <div className="p-12 text-center text-sm text-gray-400">No products available.</div>}</div></div>}
    {tab === 'orders' && <div className="rounded-2xl border border-gray-100 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-gray-100 p-5"><div><h2 className="font-bold text-gray-900">Marketplace orders</h2><p className="mt-1 text-xs text-gray-500">Imported by scheduled sync or manual action.</p></div><button className={buttonClass + ' bg-gray-100 text-gray-700'} onClick={() => connections.forEach(connection => runSync(connection, 'sync-orders'))}><RefreshCw size={14} />Import orders</button></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-400"><tr><th className="px-5 py-3">Channel</th><th className="px-5 py-3">Remote order</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Date</th><th className="px-5 py-3 text-right">Total</th></tr></thead><tbody className="divide-y divide-gray-100">{orders.map(order => <tr key={order._id}><td className="px-5 py-3 font-semibold text-gray-800">{order.connection?.name || order.provider}</td><td className="px-5 py-3 font-mono text-xs text-gray-600">{order.remoteOrderId}</td><td className="px-5 py-3"><Status value={order.status} /></td><td className="px-5 py-3 text-xs text-gray-500">{order.orderDate ? new Date(order.orderDate).toLocaleString() : '—'}</td><td className="px-5 py-3 text-right font-semibold">{order.currency || 'INR'} {order.total || 0}</td></tr>)}</tbody></table>{!orders.length && <div className="p-12 text-center text-sm text-gray-400">No marketplace orders imported yet.</div>}</div></div>}
    {tab === 'activity' && <div className="rounded-2xl border border-gray-100 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-gray-100 p-5"><div><h2 className="font-bold text-gray-900">Sync activity</h2><p className="mt-1 text-xs text-gray-500">Provider errors and individual item results are stored here.</p></div><button className={buttonClass + ' bg-gray-100 text-gray-700'} onClick={loadTab}><RefreshCw size={14} />Refresh</button></div><div className="divide-y divide-gray-100">{jobs.map(job => <div key={job._id} className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between"><div className="flex items-start gap-3"><div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><Activity size={16} /></div><div><p className="font-semibold text-gray-800">{job.type.replaceAll('-', ' ')} · {job.connection?.name || job.provider}</p><p className="mt-1 text-xs text-gray-500">{new Date(job.createdAt).toLocaleString()} · {job.stats?.succeeded || 0} ok · {job.stats?.failed || 0} failed</p>{job.error && <p className="mt-1 text-xs text-red-600">{job.error}</p>}</div></div><Status value={job.status} /></div>)}{!jobs.length && <div className="p-12 text-center text-sm text-gray-400">No marketplace activity yet.</div>}</div></div>}
    {form && <ConnectionForm form={form} setForm={setForm} save={saveConnection} close={() => setForm(null)} saving={saving} />}
    {publish && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onMouseDown={() => setPublish(null)}><div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl" onMouseDown={e => e.stopPropagation()}><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-indigo-500">Publish product</p><h2 className="mt-1 text-lg font-bold text-gray-900">{publish.product.title}</h2></div><button className="rounded-xl p-2 text-gray-400 hover:bg-gray-100" onClick={() => setPublish(null)}><X size={18} /></button></div><div className="mt-5 space-y-4"><Select label="Connection" value={publish.connectionId} onChange={v => setPublish(current => ({ ...current, connectionId: v }))} options={connections.map(item => ({ value: item._id, label: item.name + ' (' + item.provider + ')' }))} /><div className="grid gap-4 md:grid-cols-2"><Field label="Channel SKU" value={mapping.channelSku} onChange={v => setMapping(current => ({ ...current, channelSku: v }))} placeholder={publish.product.sku || 'SKU'} /><Field label="Amazon product type" value={mapping.productType} onChange={v => setMapping(current => ({ ...current, productType: v }))} placeholder="PRODUCT" /><Field label="Flipkart product ID / FSN" value={mapping.remoteProductId} onChange={v => setMapping(current => ({ ...current, remoteProductId: v }))} placeholder="Required for Flipkart" /><Field label="Flipkart HSN" value={mapping.hsn} onChange={v => setMapping(current => ({ ...current, hsn: v }))} placeholder="Use connection default" /></div><Textarea label="Advanced Amazon attributes JSON (optional)" value={mapping.overridePayload} onChange={v => setMapping(current => ({ ...current, overridePayload: v }))} placeholder={'{"attributes":{"color":[{"value":"black","marketplace_id":"A21TJRUUN4KGV"}]}}'} help="Use the Product Type Definitions response for category-specific attributes." /><p className="rounded-xl bg-gray-50 p-3 text-xs leading-5 text-gray-500">Amazon new listings may require category-specific attributes. Any provider validation error will appear in Activity instead of being hidden.</p></div><div className="mt-6 flex justify-end gap-2"><button className={buttonClass + ' border border-gray-200 text-gray-600'} onClick={() => setPublish(null)}>Cancel</button><button className={buttonClass + ' bg-indigo-600 text-white'} onClick={submitPublish}><Play size={15} />Queue publish</button></div></div></div>}
  </div>;
};

export default MarketplacePage;
