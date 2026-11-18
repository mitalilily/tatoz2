import { useEffect, useMemo, useState } from 'react';
import { Info, MapPinned, Plus, Power, RefreshCw, Route, Trash2, Truck } from 'lucide-react';
import { adminShippingAPI } from '../../services/api';
import Loader from '../../components/common/Loader';
import toast from 'react-hot-toast';

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100';

const emptyZone = { name: '', code: '', priority: 0, countries: 'India', states: '', cities: '', pincodes: '', pincodePrefixes: '', blockedPincodes: '' };
const emptyRate = { name: '', code: '', serviceLevel: 'standard', chargeType: 'flat', baseAmount: 49, includedWeight: 0, amountPerKg: 0, includedSubtotal: 0, amountPerCurrency: 0, freeOverSubtotal: '', minSubtotal: '', maxSubtotal: '', minWeight: '', maxWeight: '', estimatedMinDays: 3, estimatedMaxDays: 7, codEnabled: true, prepaidEnabled: true };

const parseList = value => String(value || '').split(/[,\n]/).map(item => item.trim()).filter(Boolean);
const displayList = value => Array.isArray(value) && value.length ? value.join(', ') : 'Any';
const errorMessage = error => error?.response?.data?.message || error?.message || 'Could not save shipping rule';

const AdminShippingRulesPage = () => {
  const [zones, setZones] = useState([]);
  const [rates, setRates] = useState([]);
  const [legacy, setLegacy] = useState(null);
  const [selectedZoneId, setSelectedZoneId] = useState('');
  const [zoneForm, setZoneForm] = useState(emptyZone);
  const [rateForm, setRateForm] = useState(emptyRate);
  const [loading, setLoading] = useState(true);
  const [savingZone, setSavingZone] = useState(false);
  const [savingRate, setSavingRate] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true);
    try {
      const response = await adminShippingAPI.getConfig();
      const nextZones = response.data?.zones || [];
      setZones(nextZones);
      setRates(response.data?.rates || []);
      setLegacy(response.data?.legacy || null);
      setSelectedZoneId(current => nextZones.some(zone => String(zone._id) === String(current)) ? current : String(nextZones[0]?._id || ''));
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    setRateForm(current => ({ ...emptyRate, ...current }));
  }, [selectedZoneId]);

  const selectedZone = useMemo(() => zones.find(zone => String(zone._id) === String(selectedZoneId)), [zones, selectedZoneId]);
  const ratesForZone = useMemo(() => rates.filter(rate => String(rate.zone) === String(selectedZoneId)), [rates, selectedZoneId]);

  const setZoneField = (key, value) => setZoneForm(current => ({ ...current, [key]: value }));
  const setRateField = (key, value) => setRateForm(current => ({ ...current, [key]: value }));

  const createZone = async event => {
    event.preventDefault();
    setSavingZone(true);
    try {
      const response = await adminShippingAPI.createZone({
        name: zoneForm.name,
        code: zoneForm.code,
        priority: zoneForm.priority,
        match: {
          countries: parseList(zoneForm.countries),
          states: parseList(zoneForm.states),
          cities: parseList(zoneForm.cities),
          pincodes: parseList(zoneForm.pincodes),
          pincodePrefixes: parseList(zoneForm.pincodePrefixes),
          blockedPincodes: parseList(zoneForm.blockedPincodes),
        },
      });
      setZoneForm(emptyZone);
      setSelectedZoneId(String(response.data.zone._id));
      toast.success('Shipping zone created');
      await load();
    } catch (error) { toast.error(errorMessage(error)); }
    finally { setSavingZone(false); }
  };

  const toggleZone = async zone => {
    try {
      await adminShippingAPI.updateZone(zone._id, { enabled: !zone.enabled });
      toast.success(zone.enabled ? 'Zone disabled' : 'Zone enabled');
      await load();
    } catch (error) { toast.error(errorMessage(error)); }
  };

  const deleteZone = async zone => {
    try {
      await adminShippingAPI.deleteZone(zone._id);
      if (String(selectedZoneId) === String(zone._id)) setSelectedZoneId('');
      toast.success('Shipping zone deleted');
      await load();
    } catch (error) { toast.error(errorMessage(error)); }
  };

  const createRate = async event => {
    event.preventDefault();
    if (!selectedZoneId) { toast.error('Create or select a shipping zone first'); return; }
    setSavingRate(true);
    try {
      await adminShippingAPI.createRate({
        ...rateForm,
        zoneId: selectedZoneId,
        baseAmount: rateForm.baseAmount,
        includedWeight: rateForm.includedWeight,
        amountPerKg: rateForm.amountPerKg,
        includedSubtotal: rateForm.includedSubtotal,
        amountPerCurrency: rateForm.amountPerCurrency,
        freeOverSubtotal: rateForm.freeOverSubtotal,
        minSubtotal: rateForm.minSubtotal,
        maxSubtotal: rateForm.maxSubtotal,
        minWeight: rateForm.minWeight,
        maxWeight: rateForm.maxWeight,
      });
      setRateForm(emptyRate);
      toast.success('Shipping rate created');
      await load();
    } catch (error) { toast.error(errorMessage(error)); }
    finally { setSavingRate(false); }
  };

  const toggleRate = async rate => {
    try {
      await adminShippingAPI.updateRate(rate._id, { enabled: !rate.enabled });
      toast.success(rate.enabled ? 'Rate disabled' : 'Rate enabled');
      await load();
    } catch (error) { toast.error(errorMessage(error)); }
  };

  const deleteRate = async rate => {
    try {
      await adminShippingAPI.deleteRate(rate._id);
      toast.success('Shipping rate deleted');
      await load();
    } catch (error) { toast.error(errorMessage(error)); }
  };

  if (loading) return <div className="flex min-h-[50vh] items-center justify-center"><Loader size="lg" /></div>;

  return <div className="space-y-6" data-testid="admin-shipping-rules-page">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">Commerce logistics</p>
        <h1 className="mt-2 text-2xl font-black text-slate-900">Shipping Rules &amp; Serviceability</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">Create tenant-scoped zones and rates. Checkout selects the first matching active rule and stores the exact quote on the order.</p>
      </div>
      <button type="button" title="Refresh shipping zones and rates" onClick={() => load(true)} disabled={refreshing} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:border-indigo-300 disabled:opacity-50"><RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />Refresh rules</button>
    </div>

    <div className="flex items-start gap-3 rounded-2xl border border-indigo-100 bg-indigo-50 p-4 text-sm text-indigo-800"><Info size={18} className="mt-0.5 flex-shrink-0" /><p>External courier credentials stay in Modules. These local rules control the customer quote and remain the authoritative fallback when a courier API is unavailable.</p></div>

    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" data-testid="shipping-zone-form">
        <div className="mb-5 flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600"><MapPinned size={19} /></span><div><h2 className="font-bold text-slate-900">Create delivery zone</h2><p className="text-sm text-slate-500">Leave the match fields empty to match any value.</p></div></div>
        <form onSubmit={createZone} className="grid gap-3 md:grid-cols-2">
          <input required maxLength={100} value={zoneForm.name} onChange={event => setZoneField('name', event.target.value)} className={inputClass} placeholder="Zone name, e.g., Delhi NCR" data-testid="shipping-zone-name" />
          <input required maxLength={40} pattern="[A-Za-z0-9][A-Za-z0-9_-]{1,39}" title="Use 2–40 letters, numbers, hyphens, or underscores" value={zoneForm.code} onChange={event => setZoneField('code', event.target.value.toUpperCase())} className={inputClass} placeholder="Zone code, e.g., DELHI-NCR" data-testid="shipping-zone-code" />
          <input type="number" min="0" value={zoneForm.priority} onChange={event => setZoneField('priority', event.target.value)} className={inputClass} placeholder="Priority" data-testid="shipping-zone-priority" />
          <input value={zoneForm.countries} onChange={event => setZoneField('countries', event.target.value)} className={inputClass} placeholder="Countries: India" data-testid="shipping-zone-countries" />
          <input value={zoneForm.states} onChange={event => setZoneField('states', event.target.value)} maxLength={10000} className={inputClass} placeholder="States, comma-separated" data-testid="shipping-zone-states" />
          <input value={zoneForm.cities} onChange={event => setZoneField('cities', event.target.value)} maxLength={10000} className={inputClass} placeholder="Cities, comma-separated" data-testid="shipping-zone-cities" />
          <input value={zoneForm.pincodes} onChange={event => setZoneField('pincodes', event.target.value)} maxLength={3500} inputMode="numeric" className={inputClass} placeholder="Exact PIN codes" data-testid="shipping-zone-pincodes" />
          <input value={zoneForm.pincodePrefixes} onChange={event => setZoneField('pincodePrefixes', event.target.value)} maxLength={700} inputMode="numeric" className={inputClass} placeholder="PIN code prefixes, e.g., 11" data-testid="shipping-zone-prefixes" />
          <input value={zoneForm.blockedPincodes} onChange={event => setZoneField('blockedPincodes', event.target.value)} maxLength={3500} inputMode="numeric" className={`${inputClass} md:col-span-2`} placeholder="Blocked PIN codes (optional)" data-testid="shipping-zone-blocked" />
          <button type="submit" disabled={savingZone} className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 md:col-span-2" data-testid="shipping-zone-create"><Plus size={16} />{savingZone ? 'Creating...' : 'Create zone'}</button>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" data-testid="shipping-rate-form">
        <div className="mb-5 flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-600"><Route size={19} /></span><div><h2 className="font-bold text-slate-900">Create shipping rate</h2><p className="text-sm text-slate-500">Flat-rate, weight-based, price-based, or free delivery.</p></div></div>
        <form onSubmit={createRate} className="grid gap-3 md:grid-cols-2">
          <select value={selectedZoneId} onChange={event => setSelectedZoneId(event.target.value)} className={inputClass} data-testid="shipping-rate-zone"><option value="">Select zone</option>{zones.map(zone => <option key={zone._id} value={zone._id}>{zone.name} ({zone.code})</option>)}</select>
          <input required maxLength={100} value={rateForm.name} onChange={event => setRateField('name', event.target.value)} className={inputClass} placeholder="Rate name, e.g., Standard delivery" data-testid="shipping-rate-name" />
          <input required maxLength={40} pattern="[A-Za-z0-9][A-Za-z0-9_-]{1,39}" title="Use 2–40 letters, numbers, hyphens, or underscores" value={rateForm.code} onChange={event => setRateField('code', event.target.value.toUpperCase())} className={inputClass} placeholder="Rate code, e.g., STANDARD" data-testid="shipping-rate-code" />
          <select value={rateForm.serviceLevel} onChange={event => setRateField('serviceLevel', event.target.value)} className={inputClass} data-testid="shipping-rate-service"><option value="standard">Standard</option><option value="express">Express</option><option value="same_day">Same day</option><option value="local">Local delivery</option></select>
          <select value={rateForm.chargeType} onChange={event => setRateField('chargeType', event.target.value)} className={inputClass} data-testid="shipping-rate-charge-type"><option value="flat">Flat amount</option><option value="weight">Weight based</option><option value="price">Price based</option><option value="free">Free shipping</option></select>
          <input type="number" min="0" step="0.01" value={rateForm.baseAmount} onChange={event => setRateField('baseAmount', event.target.value)} className={inputClass} placeholder="Base amount (₹)" data-testid="shipping-rate-base" />
          <input type="number" min="0" step="0.001" value={rateForm.includedWeight} onChange={event => setRateField('includedWeight', event.target.value)} className={inputClass} placeholder="Included weight (kg)" data-testid="shipping-rate-included-weight" />
          <input type="number" min="0" step="0.01" value={rateForm.amountPerKg} onChange={event => setRateField('amountPerKg', event.target.value)} className={inputClass} placeholder="Amount per extra kg" data-testid="shipping-rate-per-kg" />
          <input type="number" min="0" step="0.01" value={rateForm.freeOverSubtotal} onChange={event => setRateField('freeOverSubtotal', event.target.value)} className={inputClass} placeholder="Free shipping over subtotal (optional)" data-testid="shipping-rate-free-over" />
          <input type="number" min="0" value={rateForm.minSubtotal} onChange={event => setRateField('minSubtotal', event.target.value)} className={inputClass} placeholder="Minimum order (optional)" data-testid="shipping-rate-min-subtotal" />
          <input type="number" min="0" value={rateForm.maxSubtotal} onChange={event => setRateField('maxSubtotal', event.target.value)} className={inputClass} placeholder="Maximum order (optional)" data-testid="shipping-rate-max-subtotal" />
          <input type="number" min="0" value={rateForm.estimatedMinDays} onChange={event => setRateField('estimatedMinDays', event.target.value)} className={inputClass} placeholder="Minimum days" data-testid="shipping-rate-min-days" />
          <input type="number" min="0" value={rateForm.estimatedMaxDays} onChange={event => setRateField('estimatedMaxDays', event.target.value)} className={inputClass} placeholder="Maximum days" data-testid="shipping-rate-max-days" />
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-600"><input type="checkbox" checked={rateForm.codEnabled} onChange={event => setRateField('codEnabled', event.target.checked)} data-testid="shipping-rate-cod" /> Available for COD orders</label>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-600"><input type="checkbox" checked={rateForm.prepaidEnabled} onChange={event => setRateField('prepaidEnabled', event.target.checked)} data-testid="shipping-rate-prepaid" /> Available for prepaid orders</label>
          <button type="submit" disabled={savingRate || !selectedZoneId} className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 md:col-span-2" data-testid="shipping-rate-create"><Plus size={16} />{savingRate ? 'Creating...' : 'Create rate'}</button>
        </form>
      </section>
    </div>

    <div className="grid gap-6 xl:grid-cols-2">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" data-testid="shipping-zones-list">
        <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="font-bold text-slate-900">Delivery zones</h2><p className="text-xs text-slate-500">{zones.length} tenant-scoped zone{zones.length === 1 ? '' : 's'}</p></div><MapPinned size={18} className="text-indigo-500" /></div>
        <div className="space-y-3">{zones.length === 0 && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No local zones yet. Checkout will use the legacy standard charge.</p>}{zones.map(zone => <div key={zone._id} className={`rounded-xl border p-4 ${String(selectedZoneId) === String(zone._id) ? 'border-indigo-300 bg-indigo-50/40' : 'border-slate-200'}`} data-testid={`shipping-zone-row-${zone._id}`}>
          <div className="flex items-start justify-between gap-3"><button type="button" onClick={() => setSelectedZoneId(String(zone._id))} className="min-w-0 text-left"><p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-bold text-slate-900"><span className="break-words">{zone.name}</span><span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-medium text-slate-500">{zone.code}</span></p><p className="mt-1 text-xs text-slate-500">States: {displayList(zone.match?.states)} · PIN codes: {displayList(zone.match?.pincodes || zone.match?.pincodePrefixes)}</p></button><span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold uppercase ${zone.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{zone.enabled ? 'Active' : 'Off'}</span></div>
          <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => toggleZone(zone)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:border-indigo-300" data-testid={`shipping-zone-toggle-${zone._id}`}><Power size={13} />{zone.enabled ? 'Disable' : 'Enable'}</button><button type="button" onClick={() => deleteZone(zone)} className="inline-flex items-center gap-1 rounded-lg border border-rose-100 bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-100" data-testid={`shipping-zone-delete-${zone._id}`}><Trash2 size={13} />Delete</button></div>
        </div>)}</div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" data-testid="shipping-rates-list">
        <div className="mb-4 flex items-center justify-between gap-3"><div className="min-w-0"><h2 className="break-words font-bold text-slate-900">Rates for {selectedZone?.name || 'selected zone'}</h2><p className="text-sm text-slate-500">{ratesForZone.length ? `${ratesForZone.length} shipping method${ratesForZone.length === 1 ? '' : 's'}` : 'No shipping methods configured'}</p></div><Truck size={18} className="shrink-0 text-orange-500" /></div>
        <div className="space-y-3">{!selectedZoneId && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Select a zone to inspect its rates.</p>}{selectedZoneId && ratesForZone.length === 0 && <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No shipping rates have been added for this zone yet.</p>}{ratesForZone.map(rate => <div key={rate._id} className="rounded-xl border border-slate-200 p-4" data-testid={`shipping-rate-row-${rate._id}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-bold text-slate-900"><span className="break-words">{rate.name}</span><span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-medium text-slate-500">{rate.code}</span></p><p className="mt-1 text-xs text-slate-500">{rate.serviceLevel.replace('_', ' ')} · {rate.chargeType} · ₹{Number(rate.baseAmount || 0).toFixed(2)} base · {rate.estimatedMinDays}-{rate.estimatedMaxDays} days</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold uppercase ${rate.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{rate.enabled ? 'Active' : 'Off'}</span></div><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => toggleRate(rate)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:border-orange-300" data-testid={`shipping-rate-toggle-${rate._id}`}><Power size={13} />{rate.enabled ? 'Disable' : 'Enable'}</button><button type="button" onClick={() => deleteRate(rate)} className="inline-flex items-center gap-1 rounded-lg border border-rose-100 bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-100" data-testid={`shipping-rate-delete-${rate._id}`}><Trash2 size={13} />Delete</button></div></div>)}</div>
      </section>
    </div>

    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><p className="font-bold">Current fallback shipping</p><p className="mt-1">₹{Number(legacy?.standardShippingCost ?? 49).toFixed(2)} standard shipping; free over ₹{Number(legacy?.freeShippingThreshold ?? 999).toFixed(2)}. Active tenant zones take precedence.</p></div>
  </div>;
};

export default AdminShippingRulesPage;
