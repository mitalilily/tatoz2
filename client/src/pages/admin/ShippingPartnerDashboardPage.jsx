import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ExternalLink, MapPin, Package, RefreshCcw, Search, ShieldCheck, Truck } from 'lucide-react';
import toast from 'react-hot-toast';
import Loader from '../../components/common/Loader';
import { partnerDashboardAPI } from '../../services/api';

const META = {
 delhivery: { name: 'Delhivery', description: 'Serviceability, rates, manifestation, tracking and cancellation.', docs: 'https://delhivery-express-api-doc.readme.io/reference/order-creation-api' },
 xpressbees: { name: 'XpressBees', description: 'Courier serviceability, shipment creation, tracking and cancellation.', docs: 'https://xb-files.s3.amazonaws.com/assets/custom_api/apidoc_v1.1.5.pdf' },
 bluedart: { name: 'Blue Dart', description: 'Account API tracking with DHL/Blue Dart gateway credentials.', docs: 'https://developer.dhl.com/api-reference/shipment-tracking-dhl-ecommerce-india-blue-dart' },
 dtdc: { name: 'DTDC', description: 'DTDC partner operations with account-issued API endpoints.', docs: 'https://www.dtdc.com/support-service-guide/' },
};

const SHIPMENT_STATUSES = ['creating', 'created', 'pickup_scheduled', 'in_transit', 'out_for_delivery', 'delivered', 'failed_delivery', 'rto', 'cancelled', 'returned', 'failed'];

export default function ShippingPartnerDashboardPage() {
 const { provider } = useParams();
 const navigate = useNavigate();
 const meta = META[provider] || { name: provider, description: 'Shipping partner dashboard.', docs: '#' };
 const [summary, setSummary] = useState(null);
 const [shipments, setShipments] = useState([]);
 const [trackingNumber, setTrackingNumber] = useState('');
 const [tracking, setTracking] = useState(null);
 const [loading, setLoading] = useState(true);
 const [trackingLoading, setTrackingLoading] = useState(false);
 const [actionLoading, setActionLoading] = useState('');

 const load = async () => {
  setLoading(true);
  try {
   const [summaryResponse, shipmentsResponse] = await Promise.all([
    partnerDashboardAPI.shippingSummary(provider),
    partnerDashboardAPI.shippingShipments(provider, { limit: 30 }),
   ]);
   setSummary(summaryResponse.data);
   setShipments(shipmentsResponse.data?.shipments || []);
  } catch (error) { toast.error(error?.response?.data?.message || error.message || 'Unable to load shipping dashboard'); }
  finally { setLoading(false); }
 };

 useEffect(() => { load(); }, [provider]);

 const updateShipmentStatus = async (shipment, status) => {
  setActionLoading(`status:${shipment._id}`);
  try {
   const key = `admin-shipment-${shipment._id}-${status}-${Date.now()}`;
   await partnerDashboardAPI.shippingUpdateStatus(shipment._id, { status, note: `Updated from ${meta.name} dashboard` }, key);
   toast.success('Shipment status updated');
   await load();
  } catch (error) { toast.error(error?.response?.data?.message || error.message || 'Shipment status update failed'); }
  finally { setActionLoading(''); }
 };

 const syncShipment = async shipment => {
  setActionLoading(`sync:${shipment._id}`);
  try {
   await partnerDashboardAPI.shippingSync(shipment._id);
   toast.success('Shipment tracking synced');
   await load();
  } catch (error) { toast.error(error?.response?.data?.message || error.message || 'Shipment sync failed'); }
  finally { setActionLoading(''); }
 };

 const track = async event => {
  event.preventDefault();
  if (!trackingNumber.trim()) return toast.error('Enter a tracking / AWB number');
  setTrackingLoading(true);
  try { const response = await partnerDashboardAPI.shippingTrack(provider, { trackingNumber: trackingNumber.trim() }); setTracking(response.data?.tracking); }
  catch (error) { toast.error(error?.response?.data?.message || error.message || 'Tracking request failed'); }
  finally { setTrackingLoading(false); }
 };

 if (loading && !summary) return <div className="flex justify-center py-20"><Loader size="lg" /></div>;
 const statusEntries = Object.entries(summary?.stats?.shipments || {});

 return <div className="space-y-6">
  <div className="flex flex-wrap items-start justify-between gap-4">
   <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-primary-600">Shipping partner</p><h1 className="mt-1 flex items-center gap-3 text-2xl font-bold text-gray-900"><Truck className="text-primary-600" size={28} />{meta.name}</h1><p className="mt-1 text-sm text-gray-500">{meta.description}</p></div>
   <div className="flex gap-2"><button onClick={load} className="btn-secondary flex items-center gap-2"><RefreshCcw size={15} />Refresh</button><button onClick={() => navigate(`/admin/modules?module=${encodeURIComponent(provider)}`)} className="btn-primary flex items-center gap-2"><ShieldCheck size={15} />Configure module</button></div>
  </div>
  <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"><span className={`rounded-full px-3 py-1 text-xs font-bold ${summary?.provider?.active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>{summary?.provider?.active ? 'Active for new shipments' : 'Not active for new shipments'}</span><span className={`rounded-full px-3 py-1 text-xs font-bold ${summary?.provider?.configured ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>{summary?.provider?.configured ? 'Credentials connected' : 'Credentials required'}</span><a href={meta.docs} target="_blank" rel="noreferrer" className="ml-auto flex items-center gap-1 text-sm font-semibold text-primary-600">Official API docs <ExternalLink size={14} /></a></div>
  <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
   <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><h2 className="font-bold text-gray-900">Shipment status</h2><Package className="text-gray-400" size={19} /></div><div className="mt-4 flex flex-wrap gap-2">{statusEntries.length ? statusEntries.map(([status, count]) => <span key={status} className="rounded-lg bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700">{status}: {count}</span>) : <span className="text-sm text-gray-400">No shipments recorded yet.</span>}</div></div>
   <form onSubmit={track} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"><h2 className="font-bold text-gray-900">Track shipment</h2><div className="mt-4 flex gap-2"><input value={trackingNumber} onChange={event => setTrackingNumber(event.target.value)} placeholder="AWB / tracking number" className="input flex-1" /><button disabled={trackingLoading} className="btn-primary flex items-center gap-2">{trackingLoading ? <Loader size="sm" /> : <Search size={15} />}Track</button></div>{tracking && <pre className="mt-4 max-h-52 overflow-auto rounded-xl bg-gray-900 p-3 text-xs text-green-300">{JSON.stringify(tracking, null, 2)}</pre>}</form>
  </div>
  <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm"><div className="border-b border-gray-100 p-5"><h2 className="font-bold text-gray-900">Recent shipments</h2></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-gray-50 text-xs uppercase text-gray-500"><tr><th className="px-5 py-3">Order</th><th className="px-5 py-3">Tracking</th><th className="px-5 py-3">Courier</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Created</th><th className="px-5 py-3">Actions</th></tr></thead><tbody>{shipments.length ? shipments.map(item => <tr key={item._id} className="border-t border-gray-100" data-testid={`admin-shipment-row-${item._id}`}><td className="px-5 py-3 font-semibold text-gray-800">{item.order?.orderNumber || '—'}</td><td className="px-5 py-3 text-xs text-gray-600">{item.trackingNumber || 'Pending AWB'}</td><td className="px-5 py-3">{item.courierName || meta.name}</td><td className="px-5 py-3"><select value={item.status} onChange={event => updateShipmentStatus(item, event.target.value)} disabled={actionLoading === `status:${item._id}`} data-testid={`admin-shipment-status-${item._id}`} className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-semibold"><option value={item.status}>{item.status.replace(/_/g, ' ')}</option>{SHIPMENT_STATUSES.filter(status => status !== item.status).map(status => <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>)}</select></td><td className="px-5 py-3 text-gray-500">{item.createdAt ? new Date(item.createdAt).toLocaleString() : '—'}</td><td className="px-5 py-3"><button type="button" onClick={() => syncShipment(item)} disabled={!item.trackingNumber || actionLoading === `sync:${item._id}`} data-testid={`admin-shipment-sync-${item._id}`} className="btn-secondary whitespace-nowrap px-3 py-1.5 text-xs">{actionLoading === `sync:${item._id}` ? 'Syncing…' : 'Sync tracking'}</button></td></tr>) : <tr><td colSpan="6" className="px-5 py-12 text-center text-gray-400">No shipments recorded yet.</td></tr>}</tbody></table></div></div>
  <p className="flex items-center gap-1 text-xs text-gray-500"><MapPin size={13} /> New shipment creation follows the provider selected in Settings; existing shipments remain tied to their original provider.</p>
 </div>;
}
