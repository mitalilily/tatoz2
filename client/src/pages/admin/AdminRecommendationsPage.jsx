import { useCallback, useEffect, useState } from 'react';
import { BrainCircuit, Plus, RefreshCw, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { productAPI, recommendationAPI } from '../../services/api';
import Loader from '../../components/common/Loader';

const EMPTY = { type: 'related', sourceProduct: '', targetProducts: [], label: '', priority: 0, maxItems: 4 };

export default function AdminRecommendationsPage() {
 const [products, setProducts] = useState([]);
 const [rules, setRules] = useState([]);
 const [form, setForm] = useState(EMPTY);
 const [targetQuery, setTargetQuery] = useState('');
 const [loading, setLoading] = useState(true);
 const [saving, setSaving] = useState(false);

 const load = useCallback(async () => {
  setLoading(true);
  try {
   const [productResponse, ruleResponse] = await Promise.all([
    productAPI.adminGetAll({ page: 1, limit: 100, status: 'active' }),
    recommendationAPI.list(),
   ]);
   setProducts(productResponse.data.products || []);
   setRules(ruleResponse.data.rules || []);
  } catch (error) {
   toast.error(error.message || 'Failed to load recommendations');
  } finally { setLoading(false); }
 }, []);
 useEffect(() => { load(); }, [load]);

 const create = async event => {
  event.preventDefault();
  if (!form.sourceProduct || !form.targetProducts.length) { toast.error('Choose a source and at least one target product'); return; }
  setSaving(true);
  try {
   await recommendationAPI.create(form);
   toast.success('Recommendation rule saved');
   setForm(EMPTY);
   setTargetQuery('');
   load();
  } catch (error) { toast.error(error.response?.data?.message || error.message || 'Could not save rule'); }
  finally { setSaving(false); }
 };

 const remove = async id => {
  try { await recommendationAPI.delete(id); toast.success('Recommendation rule removed'); load(); }
  catch (error) { toast.error(error.message || 'Could not remove rule'); }
 };

 return <div className="space-y-6" data-testid="admin-recommendations-page">
  <div className="flex items-start justify-between gap-4">
   <div><h1 className="flex items-center gap-2 text-2xl font-black text-slate-900"><BrainCircuit className="text-indigo-600" /> Upsell & Recommendations</h1><p className="mt-1 text-sm text-slate-500">Configure related products, frequently bought together, add-ons and cross-sells for this store.</p></div>
   <button type="button" className="btn-secondary flex items-center gap-2" onClick={load} disabled={loading} aria-label="Refresh recommendations" title="Refresh recommendations" data-testid="recommendations-refresh"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh</button>
  </div>
  {loading ? <Loader size="lg" /> : <>
   <form onSubmit={create} className="max-h-[calc(100vh-12rem)] space-y-4 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" data-testid="recommendation-rule-form">
    <h2 className="mb-4 flex items-center gap-2 font-black text-slate-800"><Plus size={16} /> Add recommendation rule</h2>
    <div className="grid gap-3 md:grid-cols-2">
     <label className="text-xs font-bold text-slate-600" htmlFor="recommendation-type">Recommendation type <span aria-hidden="true">*</span><select id="recommendation-type" className="input mt-1" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} required><option value="related">Related products</option><option value="frequently_bought">Frequently bought together</option><option value="upsell">Upsell</option><option value="cross_sell">Cross-sell</option><option value="add_on">Add-on</option></select></label>
     <label className="text-xs font-bold text-slate-600">Label (optional)<input className="input mt-1" maxLength={120} placeholder="Label (optional)" value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} /></label>
     <label className="text-xs font-bold text-slate-600" htmlFor="recommendation-source">Source product <span aria-hidden="true">*</span><select id="recommendation-source" className="input mt-1" value={form.sourceProduct} onChange={e => setForm({ ...form, sourceProduct: e.target.value, targetProducts: form.targetProducts.filter(id => id !== e.target.value) })} required><option value="">Select source product</option>{products.map(product => <option key={product._id} value={product._id}>{product.title}</option>)}</select></label>
     <div className="grid grid-cols-2 gap-3"><label className="text-xs font-bold text-slate-600" htmlFor="recommendation-priority">Priority <span aria-hidden="true">*</span><input id="recommendation-priority" className="input mt-1" type="number" min="0" max="100000" placeholder="0" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} required /></label><label className="text-xs font-bold text-slate-600" htmlFor="recommendation-max-items">Max items <span aria-hidden="true">*</span><input id="recommendation-max-items" className="input mt-1" type="number" min="1" max="12" placeholder="4" value={form.maxItems} onChange={e => setForm({ ...form, maxItems: e.target.value })} required /></label></div>
     <fieldset className="md:col-span-2" data-testid="recommendation-target-products"><legend className="text-xs font-bold text-slate-600">Target products <span aria-hidden="true">*</span> <span className="font-normal text-slate-400">(select one or more)</span></legend><div className="mt-2 flex flex-wrap gap-2">{form.targetProducts.map(id => { const product = products.find(item => item._id === id); return product ? <span key={id} className="inline-flex max-w-full items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-800"><span className="max-w-[220px] truncate">{product.title}</span><button type="button" className="rounded-full p-0.5 hover:bg-indigo-100" onClick={() => setForm(current => ({ ...current, targetProducts: current.targetProducts.filter(targetId => targetId !== id) }))} aria-label={`Remove ${product.title} from target products`}><span aria-hidden="true">×</span></button></span> : null; })}</div><input type="search" value={targetQuery} onChange={event => setTargetQuery(event.target.value)} className="input mt-2" placeholder="Search target products..." aria-label="Search target products" data-testid="recommendation-target-search" /><div className="mt-2 grid max-h-56 gap-2 overflow-y-auto rounded-xl border border-slate-200 p-2 sm:grid-cols-2">{products.filter(product => product._id !== form.sourceProduct && (!targetQuery.trim() || product.title.toLowerCase().includes(targetQuery.trim().toLowerCase()))).map(product => { const checked = form.targetProducts.includes(product._id); return <label key={product._id} className={`flex min-w-0 cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-xs ${checked ? 'bg-indigo-50 text-indigo-800' : 'hover:bg-slate-50'}`}><input type="checkbox" aria-label={`${checked ? 'Remove' : 'Add'} ${product.title} ${checked ? 'from' : 'to'} target products`} checked={checked} onChange={() => setForm(current => ({ ...current, targetProducts: checked ? current.targetProducts.filter(id => id !== product._id) : [...current.targetProducts, product._id] }))} /><span className="truncate">{product.title}</span></label>; })}{products.filter(product => product._id !== form.sourceProduct && (!targetQuery.trim() || product.title.toLowerCase().includes(targetQuery.trim().toLowerCase()))).length === 0 && <p className="p-3 text-xs text-slate-400">{targetQuery ? 'No matching products.' : 'Choose a source product first.'}</p>}</div></fieldset>
    </div>
    <button className="btn-primary mt-4" disabled={saving}><Plus size={15} className="mr-1 inline" />{saving ? 'Saving...' : 'Save rule'}</button>
   </form>
   <section className="rounded-2xl border border-slate-200 bg-white shadow-sm"><h2 className="border-b border-slate-100 p-5 font-black">Configured rules ({rules.length})</h2><div className="divide-y divide-slate-100">{rules.length ? rules.map(rule => <div className="flex items-start justify-between gap-3 p-4" key={rule._id}><div><p className="font-bold">{rule.label || rule.type.replace('_', ' ')} <span className="ml-2 rounded-full bg-indigo-50 px-2 py-1 text-[10px] font-bold uppercase text-indigo-700">{rule.type}</span></p><p className="mt-1 text-xs text-slate-500">{rule.sourceProduct?.title || 'Source'} → {rule.targetProducts?.map(product => product.title).join(', ') || 'No targets'}</p></div><button type="button" className="rounded-lg p-2 text-rose-500 hover:bg-rose-50" onClick={() => remove(rule._id)} aria-label="Delete recommendation rule"><Trash2 size={15} /></button></div>) : <p className="p-5 text-sm text-slate-500">No recommendation rules yet. The storefront uses a category fallback.</p>}</div></section>
  </>}
 </div>;
}
