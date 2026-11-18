import { useCallback, useEffect, useState } from 'react';
import { Boxes, Plus, RefreshCw, ArrowRight, Truck } from 'lucide-react';
import toast from 'react-hot-toast';
import { productAPI, warehouseAPI } from '../../services/api';
import Loader from '../../components/common/Loader';

const emptyForm = { code: '', name: '', priority: 0 };

export default function AdminWarehousesPage() {
  const [warehouses, setWarehouses] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [transfer, setTransfer] = useState({ fromWarehouse: '', toWarehouse: '', product: '', quantity: 1, idempotencyKey: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [warehouseResponse, transferResponse, productResponse] = await Promise.all([
        warehouseAPI.list(), warehouseAPI.transfers({ limit: 20 }), productAPI.adminGetAll({ limit: 100 }),
      ]);
      setWarehouses(warehouseResponse.data.warehouses || []);
      setTransfers(transferResponse.data.items || []);
      setProducts(productResponse.data.products || productResponse.data.data || []);
    } catch (error) { toast.error(error.message || 'Failed to load warehouse operations'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await warehouseAPI.create(form);
      setForm(emptyForm);
      toast.success('Warehouse created');
      load();
    } catch (error) { toast.error(error.message || 'Failed to create warehouse'); }
    finally { setSaving(false); }
  };

  const createTransfer = async (event) => {
    event.preventDefault();
    if (!transfer.fromWarehouse || !transfer.toWarehouse || !transfer.product) return toast.error('Select source, destination and product');
    if (transfer.fromWarehouse === transfer.toWarehouse) return toast.error('Source and destination warehouses must be different');
    if (!Number.isInteger(Number(transfer.quantity)) || Number(transfer.quantity) < 1) return toast.error('Transfer quantity must be at least 1');
    setSaving(true);
    try {
      await warehouseAPI.createTransfer({
        fromWarehouse: transfer.fromWarehouse,
        toWarehouse: transfer.toWarehouse,
        idempotencyKey: transfer.idempotencyKey || `warehouse-ui-${Date.now()}`,
        items: [{ product: transfer.product, quantity: Number(transfer.quantity) }],
      });
      setTransfer({ fromWarehouse: '', toWarehouse: '', product: '', quantity: 1, idempotencyKey: '' });
      toast.success('Transfer requested');
      load();
    } catch (error) { toast.error(error.message || 'Failed to request transfer'); }
    finally { setSaving(false); }
  };

  const action = async (id, type) => {
    try {
      if (type === 'dispatch') await warehouseAPI.dispatchTransfer(id);
      else await warehouseAPI.receiveTransfer(id);
      toast.success(type === 'dispatch' ? 'Transfer dispatched' : 'Transfer received');
      load();
    } catch (error) { toast.error(error.message || 'Transfer action failed'); }
  };

  return <div className="space-y-6" data-testid="admin-warehouses-page">
    <div className="flex items-start justify-between gap-4">
      <div><h1 className="flex items-center gap-2 text-2xl font-black text-slate-900"><Boxes className="text-indigo-600" /> Multi-warehouse</h1><p className="mt-1 text-sm text-slate-500">Store stock locations, inventory counts and auditable transfers.</p></div>
      <button className="btn-secondary flex items-center gap-2" onClick={load} disabled={loading} aria-label="Refresh warehouses" title="Refresh warehouses" data-testid="warehouses-refresh"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh</button>
    </div>
    {loading ? <Loader size="lg" /> : <>
      <div className="grid gap-4 lg:grid-cols-2">
        <form onSubmit={create} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" data-testid="warehouse-create-form">
          <h2 className="mb-4 text-sm font-black uppercase tracking-wide text-slate-700">Add warehouse</h2>
          <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-slate-600" htmlFor="warehouse-code">Warehouse code <span aria-hidden="true">*</span><input id="warehouse-code" className="input mt-1" placeholder="e.g. DELHI-01" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} required /></label><label className="text-xs font-bold text-slate-600" htmlFor="warehouse-name">Warehouse name <span aria-hidden="true">*</span><input id="warehouse-name" className="input mt-1" placeholder="e.g. Delhi Fulfilment" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></label></div>
          <button className="btn-primary mt-4 flex items-center gap-2" disabled={saving}><Plus size={15} /> Create warehouse</button>
        </form>
        {warehouses.length < 2 ? <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-5" data-testid="warehouse-transfer-empty"><h2 className="text-sm font-black uppercase tracking-wide text-amber-900">Request stock transfer</h2><p className="mt-2 text-sm leading-6 text-amber-800">Add at least two warehouses before requesting a stock transfer. A source and destination must be different locations.</p></div> : <form onSubmit={createTransfer} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" data-testid="warehouse-transfer-form">
          <h2 className="mb-4 text-sm font-black uppercase tracking-wide text-slate-700">Request stock transfer</h2>
          <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-slate-600" htmlFor="transfer-from">From warehouse <span aria-hidden="true">*</span><select id="transfer-from" className="input mt-1" value={transfer.fromWarehouse} onChange={e => setTransfer({ ...transfer, fromWarehouse: e.target.value, toWarehouse: e.target.value === transfer.toWarehouse ? '' : transfer.toWarehouse })} required><option value="">Select source warehouse</option>{warehouses.map(item => <option key={item._id} value={item._id}>{item.code} · {item.name}</option>)}</select></label><label className="text-xs font-bold text-slate-600" htmlFor="transfer-to">To warehouse <span aria-hidden="true">*</span><select id="transfer-to" className="input mt-1" value={transfer.toWarehouse} onChange={e => setTransfer({ ...transfer, toWarehouse: e.target.value })} required><option value="">Select destination warehouse</option>{warehouses.filter(item => item._id !== transfer.fromWarehouse).map(item => <option key={item._id} value={item._id}>{item.code} · {item.name}</option>)}</select></label><label className="text-xs font-bold text-slate-600" htmlFor="transfer-product">Product <span aria-hidden="true">*</span><select id="transfer-product" className="input mt-1" value={transfer.product} onChange={e => setTransfer({ ...transfer, product: e.target.value })} required><option value="">Select product</option>{products.map(item => <option key={item._id} value={item._id}>{item.title}</option>)}</select></label><label className="text-xs font-bold text-slate-600" htmlFor="transfer-quantity">Quantity <span aria-hidden="true">*</span><input id="transfer-quantity" data-testid="transfer-quantity" className="input mt-1" type="number" min="1" step="1" value={transfer.quantity} onChange={e => setTransfer({ ...transfer, quantity: e.target.value })} required /></label></div>
          <button className="btn-primary mt-4 flex items-center gap-2" disabled={saving}><Truck size={15} /> Request transfer</button>
        </form>}
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 p-5"><h2 className="font-black text-slate-900">Warehouses <span className="text-sm font-medium text-slate-400">({warehouses.length})</span></h2></div><div className="grid gap-3 p-5 md:grid-cols-3">{warehouses.map(item => <div key={item._id} className="rounded-xl border border-slate-200 p-4"><p className="font-black text-slate-900">{item.name}</p><p className="mt-1 text-xs font-bold uppercase tracking-wide text-indigo-600">{item.code}</p><p className="mt-2 text-xs text-slate-500">Priority {item.priority || 0} · {item.isActive ? 'Active' : 'Inactive'}</p></div>)}</div></div>
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 p-5"><h2 className="font-black text-slate-900">Recent transfers</h2></div><div className="divide-y divide-slate-100">{transfers.length === 0 ? <p className="p-5 text-sm text-slate-500">No transfers requested yet.</p> : transfers.map(item => <div key={item._id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-bold text-slate-800">{item.transferNumber}</p><p className="mt-1 text-xs text-slate-500">{item.fromWarehouse?.code} <ArrowRight className="mx-1 inline" size={12} /> {item.toWarehouse?.code} · {item.items?.length || 0} item(s)</p></div><div className="flex items-center gap-2"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold capitalize text-slate-600">{item.status.replace('_', ' ')}</span>{item.status === 'requested' && <button className="btn-secondary text-xs" onClick={() => action(item._id, 'dispatch')}>Dispatch</button>}{item.status === 'in_transit' && <button className="btn-primary text-xs" onClick={() => action(item._id, 'receive')}>Receive</button>}</div></div>)}</div></div>
    </>}
  </div>;
}
