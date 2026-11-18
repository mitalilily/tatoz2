import { useState, useEffect, useRef } from 'react';
import { Tag, Plus, Edit, Trash2, Search, X, Package, History } from 'lucide-react';
import { adminAPI, couponAPI, productAPI } from '../../services/api';
import Modal from '../../components/common/Modal';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import Pagination from '../../components/common/Pagination';
import Loader from '../../components/common/Loader';
import Toggle from '../../components/common/Toggle';
import toast from 'react-hot-toast';

const defaultForm = {
  code: '', type: 'percentage', value: '', minOrderAmount: 0, maxDiscount: '',
  usageLimit: '', userLimit: 1, expiresAt: '', description: '',
  isActive: true, isFirstOrderOnly: false, showOnCheckout: false,
  applicableProducts: [], // array of { _id, title, thumbnail }
  buyXGetY: { buyQuantity: 2, getQuantity: 1, getDiscount: 100 },
  tiers: [{ minQuantity: 3, discount: 10 }],
  bundleProducts: [], bundleDiscount: '',
  customerEligibility: 'all', eligibleUsers: [], audienceSegments: [],
  allowedPaymentMethods: [], allowedChannels: [],
  geo: { states: '', cities: '', pincodes: '' },
};

const CS = '₹';

const ProductPicker = ({ selected, onChange }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef(null);

  const search = (q) => {
    if (!q.trim()) { setResults([]); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await productAPI.adminGetAll({ search: q, limit: 8 });
        const items = res.data.products || res.data.data || [];
        setResults(items.filter(p => !selected.some(s => s._id === p._id)));
      } catch {} finally { setSearching(false); }
    }, 300);
  };

  const add = (product) => {
    onChange([...selected, { _id: product._id, title: product.title, thumbnail: product.thumbnail }]);
    setQuery('');
    setResults([]);
  };

  const remove = (id) => onChange(selected.filter(p => p._id !== id));

  return (
    <div>
      <label className="text-sm font-medium text-gray-700 mb-1 block flex items-center gap-1.5">
        <Package size={14} className="text-primary-500" />
        Restrict to Specific Products
        <span className="text-xs text-gray-400 font-normal">(leave empty = applies to all)</span>
      </label>

      {/* Selected product pills */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selected.map(p => (
            <span key={p._id} className="flex items-center gap-1 bg-primary-50 text-primary-700 text-xs font-medium px-2.5 py-1 rounded-full border border-primary-100">
              {p.thumbnail && <img src={p.thumbnail} alt="" className="w-4 h-4 rounded-full object-cover" />}
              {p.title}
              <button type="button" onClick={() => remove(p._id)} className="ml-0.5 hover:text-red-500">
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search input */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); search(e.target.value); }}
          className="input pl-8 text-sm"
          placeholder="Search products to add..."
        />
        {searching && <Loader size="sm" className="absolute right-3 top-1/2 -translate-y-1/2" />}
      </div>

      {/* Dropdown results */}
      {results.length > 0 && (
        <div className="border border-gray-200 rounded-xl mt-1 overflow-hidden shadow-sm max-h-48 overflow-y-auto">
          {results.map(p => (
            <button
              key={p._id}
              type="button"
              onClick={() => add(p)}
              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-primary-50 text-left text-sm transition-colors"
            >
              {p.thumbnail
                ? <img src={p.thumbnail} alt="" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
                : <div className="w-8 h-8 rounded-lg bg-gray-100 flex-shrink-0" />}
              <div className="min-w-0">
                <div className="font-medium text-gray-800 truncate">{p.title}</div>
                {p.sku && <div className="text-xs text-gray-400">SKU: {p.sku}</div>}
              </div>
              <span className="ml-auto text-primary-600 font-semibold text-xs">{CS}{p.price}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const AdminCouponsPage = () => {
  const [coupons, setCoupons] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [deleteItem, setDeleteItem] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [audienceSegments, setAudienceSegments] = useState([]);
  const [redemptionItem, setRedemptionItem] = useState(null);
  const [redemptions, setRedemptions] = useState([]);
  const [redemptionLoading, setRedemptionLoading] = useState(false);

  useEffect(() => {
    fetchCoupons();
    adminAPI.getCustomerSegments().then(res => setAudienceSegments(res.data.segments || [])).catch(() => {});
  }, [page]);

  const fetchCoupons = async () => {
    setLoading(true);
    try {
      const res = await couponAPI.getAll({ page, limit: 20 });
      setCoupons(res.data.coupons);
      setPagination(res.data.pagination);
    } catch {} finally { setLoading(false); }
  };

  const openCreate = () => {
    setForm({ ...defaultForm, applicableProducts: [], eligibleUsers: [], audienceSegments: [], allowedPaymentMethods: [], allowedChannels: [], geo: { ...defaultForm.geo } });
    setEditItem(null);
    setShowModal(true);
  };

  const openEdit = (c) => {
    setForm({
      code: c.code, type: c.type, value: c.value,
      minOrderAmount: c.minOrderAmount, maxDiscount: c.maxDiscount || '',
      usageLimit: c.usageLimit || '', userLimit: c.userLimit,
      expiresAt: c.expiresAt ? new Date(c.expiresAt).toISOString().split('T')[0] : '',
      description: c.description || '', isActive: c.isActive,
      isFirstOrderOnly: c.isFirstOrderOnly, showOnCheckout: c.showOnCheckout || false,
      customerEligibility: c.customerEligibility || (c.isFirstOrderOnly ? 'new' : 'all'),
      buyXGetY: c.buyXGetY || { buyQuantity: 2, getQuantity: 1, getDiscount: 100 },
      tiers: c.tiers?.length ? c.tiers : [{ minQuantity: 3, discount: 10 }],
      bundleProducts: (c.bundleProducts || []).map(p => typeof p === 'object' ? { _id: p._id, title: p.title, thumbnail: p.thumbnail } : { _id: p, title: p }),
      bundleDiscount: c.bundleDiscount ?? '',
      eligibleUsers: (c.eligibleUsers || []).map(user => typeof user === 'object' ? user._id : user),
      audienceSegments: (c.audienceSegments || []).map(segment => typeof segment === 'object' ? segment : { _id: segment }),
      allowedPaymentMethods: c.allowedPaymentMethods || [],
      allowedChannels: c.allowedChannels || [],
      geo: {
        states: (c.geo?.states || []).join(', '),
        cities: (c.geo?.cities || []).join(', '),
        pincodes: (c.geo?.pincodes || []).join(', '),
      },
      applicableProducts: (c.applicableProducts || []).map(p =>
        typeof p === 'object' ? { _id: p._id, title: p.title, thumbnail: p.thumbnail } : { _id: p, title: p }
      ),
    });
    setEditItem(c);
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.code || !form.expiresAt) { toast.error('Code and expiry are required'); return; }
    if (!['free_shipping', 'buy_x_get_y', 'tiered', 'bundle'].includes(form.type) && !form.value) { toast.error('Value is required'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        applicableProducts: form.applicableProducts.map(p => p._id),
        buyXGetY: {
          buyQuantity: Number(form.buyXGetY.buyQuantity) || 2,
          getQuantity: Number(form.buyXGetY.getQuantity) || 1,
          getDiscount: Number(form.buyXGetY.getDiscount) || 100,
        },
        tiers: (form.tiers || []).map(tier => ({ minQuantity: Number(tier.minQuantity), discount: Number(tier.discount) })),
        bundleProducts: form.bundleProducts.map(p => p._id),
        bundleDiscount: form.bundleDiscount === '' ? undefined : Number(form.bundleDiscount),
        eligibleUsers: form.eligibleUsers.filter(Boolean),
        audienceSegments: form.audienceSegments.map(segment => segment._id || segment),
        geo: {
          states: form.geo.states.split(',').map(value => value.trim()).filter(Boolean),
          cities: form.geo.cities.split(',').map(value => value.trim()).filter(Boolean),
          pincodes: form.geo.pincodes.split(',').map(value => value.trim()).filter(Boolean),
        },
      };
      if (editItem) { await couponAPI.update(editItem._id, payload); toast.success('Coupon updated!'); }
      else { await couponAPI.create(payload); toast.success('Coupon created!'); }
      setShowModal(false);
      fetchCoupons();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    try { await couponAPI.delete(deleteItem._id); toast.success('Coupon deleted'); setDeleteItem(null); fetchCoupons(); }
    catch (err) { toast.error(err.message); }
  };

  const openRedemptions = async (coupon) => {
    setRedemptionItem(coupon);
    setRedemptionLoading(true);
    try {
      const res = await couponAPI.getRedemptions(coupon._id, { limit: 50 });
      setRedemptions(res.data.redemptions || []);
    } catch (err) {
      setRedemptions([]);
      toast.error(err.message || 'Could not load coupon audit');
    } finally { setRedemptionLoading(false); }
  };

  const typeLabel = { percentage: '%', fixed: CS, free_shipping: 'Free Shipping', buy_x_get_y: 'Buy X', tiered: 'Tiered', bundle: 'Bundle' };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Tag className="text-primary-600" size={26} />Coupons</h1>
        <button data-testid="coupon-create" onClick={openCreate} className="btn-primary text-sm py-2.5 flex items-center gap-2"><Plus size={16} />Create Coupon</button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? <div className="flex justify-center py-10"><Loader /></div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>{['Code', 'Type', 'Value', 'Products', 'Used / Limit', 'Expires', 'Status', 'Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {coupons.length === 0
                  ? <tr><td colSpan={8} className="text-center py-10 text-gray-400">No coupons yet</td></tr>
                  : coupons.map(c => (
                    <tr key={c._id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <span className="font-mono font-bold text-primary-600 bg-primary-50 px-2.5 py-1 rounded-lg">{c.code}</span>
                        {c.showOnCheckout && <span className="ml-1.5 text-xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full font-medium">Visible</span>}
                      </td>
                      <td className="px-4 py-3 capitalize text-gray-600">{c.type.replace('_', ' ')}</td>
                      <td className="px-4 py-3 font-semibold">{c.type === 'free_shipping' ? 'FREE' : `${typeLabel[c.type] || ''}${c.value}`}</td>
                      <td className="px-4 py-3">
                        {c.applicableProducts?.length > 0
                          ? <span className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded-full font-medium">
                              <Package size={11} />{c.applicableProducts.length} product{c.applicableProducts.length > 1 ? 's' : ''}
                            </span>
                          : <span className="text-xs text-gray-400">All</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{c.usageCount} / {c.usageLimit || '∞'}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{new Date(c.expiresAt).toLocaleDateString('en-IN')}</td>
                      <td className="px-4 py-3">
                        <span className={`badge text-xs ${c.isActive && new Date(c.expiresAt) > new Date() ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {c.isActive && new Date(c.expiresAt) > new Date() ? 'Active' : 'Expired/Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button onClick={() => openEdit(c)} className="p-1.5 hover:bg-primary-50 text-primary-600 rounded-lg"><Edit size={14} /></button>
                          <button data-testid={`coupon-audit-${c._id}`} onClick={() => openRedemptions(c)} className="p-1.5 hover:bg-indigo-50 text-indigo-600 rounded-lg" title="Redemption audit"><History size={14} /></button>
                          <button onClick={() => setDeleteItem(c)} className="p-1.5 hover:bg-red-50 text-red-500 rounded-lg"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Pagination currentPage={page} totalPages={pagination?.pages || 1} onPageChange={setPage} />

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editItem ? 'Edit Coupon' : 'Create Coupon'} drawer testId="coupon-editor-drawer">
        <div className="space-y-4" data-testid="coupon-eligibility">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Coupon Code *</label>
              <input data-testid="coupon-code" maxLength={50} value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} className="input font-mono" placeholder="SAVE20" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Type *</label>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className="input bg-white">
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">{`Fixed Amount (${CS})`}</option>
                <option value="free_shipping">Free Shipping</option>
                <option value="buy_x_get_y">Buy X Get Y</option>
                <option value="tiered">Tiered / Volume</option>
                <option value="bundle">Combo / Bundle</option>
              </select>
            </div>
            {form.type !== 'free_shipping' && !['buy_x_get_y', 'tiered', 'bundle'].includes(form.type) && (
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Value *</label>
                <input data-testid="coupon-value" type="number" min="0" max={form.type === 'percentage' ? 100 : 1000000000} step="0.01" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} className="input" placeholder={form.type === 'percentage' ? '20 (%)' : `100 (${CS})`} required />
              </div>
            )}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">{`Min Order (${CS})`}</label>
              <input data-testid="coupon-min-order" type="number" min="0" max="1000000000" step="0.01" value={form.minOrderAmount} onChange={e => setForm(f => ({ ...f, minOrderAmount: e.target.value }))} className="input" placeholder="0" />
            </div>
            {form.type === 'percentage' && (
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">{`Max Discount (${CS})`}</label>
                <input data-testid="coupon-max-discount" type="number" min="0" max="1000000000" step="0.01" value={form.maxDiscount} onChange={e => setForm(f => ({ ...f, maxDiscount: e.target.value }))} className="input" placeholder="Optional cap" />
              </div>
            )}
            {form.type === 'buy_x_get_y' && (
              <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-3 sm:col-span-2">
                <p className="text-xs font-semibold text-amber-800 mb-2">Buy-X-Get-Y rule</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {[['buyQuantity', 'Buy quantity'], ['getQuantity', 'Get quantity'], ['getDiscount', 'Get discount %']].map(([key, label]) => (
                    <label key={key} className="text-xs font-medium text-gray-600">{label}
                      <input data-testid={`coupon-${key}`} type="number" min="1" value={form.buyXGetY[key]} onChange={e => setForm(f => ({ ...f, buyXGetY: { ...f.buyXGetY, [key]: e.target.value } }))} className="input mt-1" />
                    </label>
                  ))}
                </div>
              </div>
            )}
            {form.type === 'tiered' && (
              <div className="rounded-xl border border-sky-100 bg-sky-50/60 p-3 sm:col-span-2">
                <div className="flex items-center justify-between mb-2"><p className="text-xs font-semibold text-sky-800">Quantity tiers</p><button type="button" className="text-xs text-sky-700" onClick={() => setForm(f => ({ ...f, tiers: [...f.tiers, { minQuantity: 5, discount: 15 }] }))}>+ Add tier</button></div>
                <div className="space-y-2">
                  {form.tiers.map((tier, index) => <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]" key={index}>
                    <input data-testid={`coupon-tier-min-${index}`} type="number" min="1" value={tier.minQuantity} onChange={e => setForm(f => ({ ...f, tiers: f.tiers.map((item, i) => i === index ? { ...item, minQuantity: e.target.value } : item) }))} className="input" placeholder="Minimum quantity" />
                    <input data-testid={`coupon-tier-discount-${index}`} type="number" min="0" max="100" value={tier.discount} onChange={e => setForm(f => ({ ...f, tiers: f.tiers.map((item, i) => i === index ? { ...item, discount: e.target.value } : item) }))} className="input" placeholder="Discount %" />
                    {form.tiers.length > 1 && <button type="button" className="px-2 text-red-500" onClick={() => setForm(f => ({ ...f, tiers: f.tiers.filter((_, i) => i !== index) }))}>×</button>}
                  </div>)}
                </div>
              </div>
            )}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Usage Limit</label>
              <input data-testid="coupon-usage-limit" type="number" min="1" max="1000000000" step="1" value={form.usageLimit} onChange={e => setForm(f => ({ ...f, usageLimit: e.target.value }))} className="input" placeholder="Unlimited" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Per User Limit</label>
              <input data-testid="coupon-user-limit" type="number" min="1" max="1000000000" step="1" value={form.userLimit} onChange={e => setForm(f => ({ ...f, userLimit: e.target.value }))} className="input" placeholder="1" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Expiry Date *</label>
              <input type="date" value={form.expiresAt} onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))} className="input" />
            </div>
          </div>

          {/* Product Picker */}
          <ProductPicker
            selected={form.applicableProducts}
            onChange={products => setForm(f => ({ ...f, applicableProducts: products }))}
          />
          {(form.type === 'bundle') && <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-3 space-y-3">
            <div><h3 className="text-sm font-semibold text-gray-800">Combo / bundle products</h3><p className="text-xs text-gray-500">Every selected product must be present before the server applies the bundle discount.</p></div>
            <ProductPicker selected={form.bundleProducts} onChange={products => setForm(f => ({ ...f, bundleProducts: products }))} />
            <label className="text-xs font-medium text-gray-600 block">Bundle discount (%)<input data-testid="coupon-bundle-discount" type="number" min="0" max="100" value={form.bundleDiscount} onChange={e => setForm(f => ({ ...f, bundleDiscount: e.target.value }))} className="input mt-1" placeholder="20" /></label>
          </div>}

          <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-800">Customer eligibility</h3>
              <p className="text-xs text-gray-500">These rules are re-checked during checkout on the server.</p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Customer type</label>
              <select data-testid="coupon-customer-eligibility" value={form.customerEligibility} onChange={e => setForm(f => ({ ...f, customerEligibility: e.target.value }))} className="input bg-white">
                <option value="all">All customers</option>
                <option value="new">New customers / first order</option>
                <option value="existing">Existing customers</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Audience segments</label>
              {audienceSegments.length === 0
                ? <p className="text-xs text-gray-500">Create an audience in Customers to target a segment.</p>
                : <div className="flex flex-wrap gap-2">
                    {audienceSegments.map(segment => {
                      const checked = form.audienceSegments.some(item => String(item._id || item) === String(segment._id));
                      return <label key={segment._id} className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border cursor-pointer ${checked ? 'bg-indigo-100 border-indigo-300 text-indigo-700' : 'bg-white border-gray-200 text-gray-600'}`}>
                        <input data-testid={`coupon-audience-segment-${segment._id}`} type="checkbox" checked={checked} onChange={() => setForm(f => ({ ...f, audienceSegments: checked ? f.audienceSegments.filter(item => String(item._id || item) !== String(segment._id)) : [...f.audienceSegments, { _id: segment._id, name: segment.name }] }))} />
                        {segment.name}
                      </label>;
                    })}
                  </div>}
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Specific customer user IDs <span className="font-normal text-gray-400">(optional, comma separated)</span></label>
              <input data-testid="coupon-eligible-users" value={form.eligibleUsers.join(', ')} onChange={e => setForm(f => ({ ...f, eligibleUsers: e.target.value.split(',').map(value => value.trim()).filter(Boolean) }))} className="input bg-white text-xs" placeholder="MongoDB user IDs" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Allowed payment methods <span className="font-normal text-gray-400">(empty = all)</span></label>
              <div className="flex flex-wrap gap-2">
                {[['cod', 'COD'], ['razorpay', 'Razorpay'], ['cashfree', 'Cashfree'], ['stripe', 'Stripe']].map(([id, label]) => {
                  const checked = form.allowedPaymentMethods.includes(id);
                  return <span key={id} className="inline-flex items-center gap-1.5 text-xs text-gray-600"><input id={`coupon-payment-${id}`} data-testid={`coupon-payment-${id}`} type="checkbox" checked={checked} onChange={() => setForm(f => ({ ...f, allowedPaymentMethods: checked ? f.allowedPaymentMethods.filter(item => item !== id) : [...f.allowedPaymentMethods, id] }))} /><label htmlFor={`coupon-payment-${id}`} className="cursor-pointer">{label}</label></span>;
                })}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Allowed channels <span className="font-normal text-gray-400">(empty = all)</span></label>
              <div className="flex gap-3">
                {[['website', 'Website'], ['app', 'Mobile app']].map(([id, label]) => {
                  const checked = form.allowedChannels.includes(id);
                  return <span key={id} className="inline-flex items-center gap-1.5 text-xs text-gray-600"><input id={`coupon-channel-${id}`} data-testid={`coupon-channel-${id}`} type="checkbox" checked={checked} onChange={() => setForm(f => ({ ...f, allowedChannels: checked ? f.allowedChannels.filter(item => item !== id) : [...f.allowedChannels, id] }))} /><label htmlFor={`coupon-channel-${id}`} className="cursor-pointer">{label}</label></span>;
                })}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {[['states', 'States'], ['cities', 'Cities'], ['pincodes', 'Pincodes']].map(([key, label]) => (
                <div key={key}>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">{label}</label>
                  <input data-testid={`coupon-geo-${key}`} maxLength={key === 'pincodes' ? 10 * 100 : 80 * 100} value={form.geo[key]} onChange={e => setForm(f => ({ ...f, geo: { ...f.geo, [key]: e.target.value } }))} className="input bg-white text-xs" placeholder="Comma separated" />
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Description</label>
            <input data-testid="coupon-description" maxLength={1000} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="input" placeholder="Internal description" />
          </div>
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
            <span className="text-sm font-medium text-gray-800">Active</span>
            <Toggle checked={form.isActive} onChange={() => setForm(f => ({ ...f, isActive: !f.isActive }))} aria-label="Coupon active" />
          </div>
          <div className="flex items-center justify-between p-3 bg-indigo-50 rounded-xl">
            <div>
              <span className="text-sm font-medium text-gray-800">Show on Checkout</span>
              <p className="text-xs text-gray-500">Display this coupon as a selectable option during checkout</p>
            </div>
            <Toggle checked={form.showOnCheckout} onChange={() => setForm(f => ({ ...f, showOnCheckout: !f.showOnCheckout }))} aria-label="Show on checkout" />
          </div>
          <div data-testid="coupon-editor-actions" className="-mx-1 flex flex-col-reverse gap-3 border-t border-gray-100 pt-3 sm:flex-row">
            <button onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
              {saving ? <Loader size="sm" /> : editItem ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!redemptionItem} onClose={() => setRedemptionItem(null)} title={`${redemptionItem?.code || ''} redemption audit`} size="lg">
        <div data-testid="coupon-redemption-audit" className="space-y-3">
          <p className="text-xs text-gray-500">Reserved, captured, and released usages are server-ledger records. Stored coupon codes are never shown here.</p>
          {redemptionLoading ? <div className="flex justify-center py-8"><Loader /></div> : redemptions.length === 0 ? <p className="text-sm text-gray-500 py-8 text-center">No redemption records yet.</p> : (
            <div className="overflow-x-auto border border-gray-100 rounded-xl">
              <table className="w-full text-xs">
                <thead className="bg-gray-50"><tr>{['Status', 'Customer', 'Order', 'Discount', 'Created'].map(label => <th key={label} className="text-left px-3 py-2 font-semibold text-gray-500 uppercase">{label}</th>)}</tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {redemptions.map(redemption => (
                    <tr key={redemption._id}>
                      <td className="px-3 py-2"><span className={`badge ${redemption.status === 'captured' ? 'bg-green-100 text-green-700' : redemption.status === 'released' ? 'bg-gray-100 text-gray-600' : 'bg-amber-100 text-amber-700'}`}>{redemption.status}</span></td>
                      <td className="px-3 py-2 text-gray-700">{redemption.user?.name || redemption.user?.phone || redemption.user?.email || 'Customer'}</td>
                      <td className="px-3 py-2 font-mono text-gray-600">{redemption.order?.orderNumber || '—'}</td>
                      <td className="px-3 py-2 font-semibold">{CS}{Number(redemption.discountAmount || 0).toFixed(2)}</td>
                      <td className="px-3 py-2 text-gray-500">{redemption.createdAt ? new Date(redemption.createdAt).toLocaleString('en-IN') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog isOpen={!!deleteItem} onClose={() => setDeleteItem(null)} onConfirm={handleDelete}
        title="Delete Coupon" message={`Delete coupon "${deleteItem?.code}"?`} confirmLabel="Delete" isDanger />
    </div>
  );
};

export default AdminCouponsPage;
