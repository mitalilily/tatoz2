import { useEffect, useMemo, useState } from 'react';
import { Copy, Gift, Power, PowerOff, RefreshCw, UsersRound } from 'lucide-react';
import { giftCardAPI, walletAPI } from '../../services/api';
import { formatPrice } from '../../utils/formatPrice';
import { useSite } from '../../context/SiteContext';
import Loader from '../../components/common/Loader';
import Pagination from '../../components/common/Pagination';
import SEO from '../../components/common/SEO';
import CustomerAudienceToolbar, { useCustomerGroups } from '../../components/admin/CustomerAudienceToolbar';

const initialForm = { amount: '', expiresAt: '', recipientName: '', recipientEmail: '', recipientPhone: '', senderName: '', message: '' };
const initialBulkForm = { amount: '', expiresAt: '', senderName: '', message: '' };
const errorMessage = error => error?.response?.data?.message || error?.message || 'Request failed';

const expiryPayload = value => value ? new Date(value).toISOString() : undefined;

export default function AdminGiftCardsPage() {
  const { settings } = useSite();
  const { groups, loadingGroups } = useCustomerGroups();
  const [cards, setCards] = useState([]);
  const [selected, setSelected] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [bulkForm, setBulkForm] = useState(initialBulkForm);
  const [customers, setCustomers] = useState([]);
  const [selectedRecipientIds, setSelectedRecipientIds] = useState(new Set());
  const [cardSearchInput, setCardSearchInput] = useState('');
  const [cardSearch, setCardSearch] = useState('');
  const [cardGroupId, setCardGroupId] = useState('');
  const [cardStatus, setCardStatus] = useState('');
  const [recipientSearchInput, setRecipientSearchInput] = useState('');
  const [recipientSearch, setRecipientSearch] = useState('');
  const [recipientGroupId, setRecipientGroupId] = useState('');
  const [cardPagination, setCardPagination] = useState({ page: 1, pages: 1 });
  const [recipientPagination, setRecipientPagination] = useState({ page: 1, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [newCode, setNewCode] = useState('');
  const [bulkCodes, setBulkCodes] = useState([]);

  const loadCards = async (page = cardPagination.page) => {
    setLoading(true); setError('');
    try {
      const response = await giftCardAPI.getAdmin({ page, limit: 10, search: cardSearch || undefined, status: cardStatus || undefined, segmentId: cardGroupId || undefined });
      setCards(response.data.cards || []); setCardPagination(response.data.pagination || { page, pages: 1 });
    } catch (requestError) { setError(errorMessage(requestError) || 'Unable to load gift cards'); }
    finally { setLoading(false); }
  };

  const loadCustomers = async (page = recipientPagination.page) => {
    setLoadingCustomers(true);
    try {
      const response = await walletAPI.getAdmin({ page, limit: 10, search: recipientSearch || undefined, segmentId: recipientGroupId || undefined });
      setCustomers(response.data.wallets || []);
      setRecipientPagination(response.data.pagination || { page, pages: 1 });
    } catch (requestError) { setError(errorMessage(requestError) || 'Unable to load customer recipients'); }
    finally { setLoadingCustomers(false); }
  };

  useEffect(() => { loadCards(1); }, [cardSearch, cardGroupId, cardStatus]);
  useEffect(() => { loadCustomers(1); setSelectedRecipientIds(new Set()); }, [recipientSearch, recipientGroupId]);

  const visibleRecipientIds = useMemo(() => customers.map(row => String(row.user?._id)), [customers]);
  const allRecipientsSelected = visibleRecipientIds.length > 0 && visibleRecipientIds.every(id => selectedRecipientIds.has(id));
  const toggleRecipient = id => setSelectedRecipientIds(current => { const next = new Set(current); if (next.has(String(id))) next.delete(String(id)); else next.add(String(id)); return next; });
  const toggleAllRecipients = () => setSelectedRecipientIds(current => { const next = new Set(current); if (allRecipientsSelected) visibleRecipientIds.forEach(id => next.delete(id)); else visibleRecipientIds.forEach(id => next.add(id)); return next; });

  useEffect(() => {
    if (selected && !cards.some(card => card._id === selected._id)) setSelected(null);
  }, [cards, selected]);

  const create = async event => {
    event.preventDefault(); setSaving(true); setError(''); setNotice(''); setNewCode(''); setBulkCodes([]);
    try {
      const response = await giftCardAPI.createAdmin({ ...form, amount: Number(form.amount), expiresAt: expiryPayload(form.expiresAt) }, `admin-gift-card-${Date.now()}`);
      setNewCode(response.data.code || ''); setNotice(response.data.code ? 'Gift card issued. Copy the bearer code now; it is not shown again in list views.' : 'Gift card request was already processed.'); setForm(initialForm); await loadCards(cardPagination.page);
    } catch (requestError) { setError(errorMessage(requestError) || 'Gift card creation failed'); }
    finally { setSaving(false); }
  };

  const createBulk = async event => {
    event.preventDefault();
    if (!selectedRecipientIds.size && !recipientGroupId) { setError('Select customers or choose a customer group first.'); return; }
    setBulkSaving(true); setError(''); setNotice(''); setNewCode(''); setBulkCodes([]);
    try {
      const response = await giftCardAPI.createBulkAdmin({ ...bulkForm, amount: Number(bulkForm.amount), expiresAt: expiryPayload(bulkForm.expiresAt), userIds: Array.from(selectedRecipientIds), segmentId: recipientGroupId || undefined }, `admin-gift-card-bulk-${Date.now()}`);
      const result = response.data || {};
      setBulkCodes((result.results || []).filter(item => item.success && item.code)); setNotice(`Bulk gift-card issuance complete: ${result.issued || 0} issued, ${result.failed || 0} failed.`); setSelectedRecipientIds(new Set()); setBulkForm(initialBulkForm); await Promise.all([loadCards(cardPagination.page), loadCustomers()]);
    } catch (requestError) { setError(errorMessage(requestError) || 'Bulk gift-card issuance failed'); }
    finally { setBulkSaving(false); }
  };

  const choose = async card => {
    setSelected(card); setError('');
    try { const response = await giftCardAPI.getTransactions(card._id, { page: 1, limit: 50 }); setTransactions(response.data.transactions || []); }
    catch (requestError) { setError(errorMessage(requestError) || 'Unable to load gift card history'); }
  };

  const toggle = async card => {
    try { await giftCardAPI.updateStatus(card._id, card.status === 'active' ? 'disabled' : 'active'); await loadCards(cardPagination.page); if (selected?._id === card._id) setSelected(prev => ({ ...prev, status: card.status === 'active' ? 'disabled' : 'active' })); }
    catch (requestError) { setError(errorMessage(requestError) || 'Unable to update gift card status'); }
  };

  const applyCardSearch = event => { event.preventDefault(); setCardSearch(cardSearchInput.trim()); };
  const applyRecipientSearch = event => { event.preventDefault(); setRecipientSearch(recipientSearchInput.trim()); setSelectedRecipientIds(new Set()); };
  const changeRecipientGroup = value => { setRecipientGroupId(value); setSelectedRecipientIds(new Set()); };

  return <>
    <SEO title="Gift Cards" noindex />
    <div className="space-y-6 p-4 sm:p-6 lg:p-8" data-testid="admin-gift-cards-page">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-fuchsia-600">Customer finance</p><h1 className="mt-1 text-2xl font-black text-slate-900">Gift Cards</h1><p className="mt-1 max-w-2xl text-sm text-slate-500">Search issued cards, issue one card, or gift the same value to selected customers and dynamic customer groups.</p></div><button type="button" onClick={() => { loadCards(cardPagination.page); loadCustomers(); }} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm" data-testid="admin-gift-cards-refresh"><RefreshCw size={15} /> Refresh</button></div>
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" data-testid="admin-gift-cards-error">{error}</div>}
      {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700" data-testid="admin-gift-cards-notice">{notice}{newCode && <span className="mt-2 flex items-center gap-2 font-mono text-base"><span data-testid="admin-gift-card-code">{newCode}</span><button type="button" onClick={() => navigator.clipboard?.writeText(newCode)} className="rounded-lg border border-emerald-300 p-1" title="Copy gift card code"><Copy size={14} /></button></span>}{bulkCodes.length > 0 && <span className="mt-3 block space-y-1 text-xs"><span className="font-semibold">One-time bulk codes:</span>{bulkCodes.map(item => <span key={item.userId} className="flex items-center justify-between gap-2 rounded-lg bg-white/70 px-2 py-1 font-mono"><span>{item.name || item.email || item.userId}: {item.code}</span><button type="button" onClick={() => navigator.clipboard?.writeText(item.code)} title="Copy gift card code"><Copy size={12} /></button></span>)}</span>}</div>}
      {loading ? <Loader size="lg" /> : <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_430px]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 px-5 py-4"><div><h2 className="font-bold text-slate-900">Issued cards</h2><p className="mt-1 text-xs text-slate-500">Full codes are shown only at issuance. Search recipient details or last four digits.</p></div><label className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Status<select className="input mt-1 bg-white text-sm" value={cardStatus} onChange={event => setCardStatus(event.target.value)} data-testid="gift-card-status-filter"><option value="">All statuses</option><option value="active">Active</option><option value="disabled">Disabled</option><option value="depleted">Depleted</option><option value="expired">Expired</option></select></label></div>
          <CustomerAudienceToolbar search={cardSearchInput} onSearchChange={setCardSearchInput} onSearchSubmit={applyCardSearch} groupId={cardGroupId} onGroupChange={setCardGroupId} groups={groups} loadingGroups={loadingGroups} placeholder="Last four, recipient name or email" searchLabel="Search issued cards" groupHint="Issued cards are filtered to the selected customer group." testId="gift-card-list" />
          <div className="divide-y divide-slate-100">{cards.map(card => <div key={card._id} className={'flex min-w-0 items-center gap-3 px-5 py-4 ' + (selected?._id === card._id ? 'bg-fuchsia-50' : '')} data-testid={'admin-gift-card-row-' + card._id}><button type="button" onClick={() => choose(card)} className="flex min-w-0 flex-1 items-center gap-3 text-left"><span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-fuchsia-50 text-fuchsia-600"><Gift size={17} /></span><span className="min-w-0 flex-1"><span className="block font-mono text-sm font-bold text-slate-800">•••• {card.codeLast4}</span><span className="block max-w-full truncate break-all text-xs text-slate-500" title={card.recipientName || card.recipientEmail || card.recipientUser?.name || 'No recipient'}>{card.recipientUser?.name || card.recipientName || card.recipientEmail || 'No recipient'} · {card.status}</span></span><span className="flex-shrink-0 text-right"><span className="block text-sm font-black text-slate-900">{formatPrice(card.balance || 0, settings)}</span><span className="block text-[10px] uppercase tracking-wide text-slate-400">remaining</span></span></button>{['active', 'disabled'].includes(card.status) && <button type="button" onClick={() => toggle(card)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title={card.status === 'active' ? 'Disable gift card' : 'Enable gift card'}>{card.status === 'active' ? <PowerOff size={15} /> : <Power size={15} />}</button>}</div>)}</div>
          {cards.length === 0 && <p className="px-5 py-10 text-center text-sm text-slate-400">No gift cards found.</p>}
          <div className="border-t border-slate-100 px-5 py-4"><Pagination currentPage={cardPagination.page || 1} totalPages={cardPagination.pages || 1} onPageChange={page => loadCards(page)} /></div>
          {selected && <div className="border-t border-slate-100 px-5 py-4"><h3 className="font-bold text-slate-900">Ledger for •••• {selected.codeLast4}</h3><div className="mt-3 space-y-2 text-xs">{transactions.map(transaction => <div key={transaction._id} className="flex justify-between rounded-lg bg-slate-50 px-3 py-2"><span>{transaction.direction} · {transaction.source}</span><strong>{formatPrice(transaction.amount, settings)}</strong></div>)}</div></div>}
        </section>
        <div className="space-y-6">
          <section className="rounded-2xl border border-fuchsia-100 bg-fuchsia-50/50 p-5 shadow-sm" data-testid="admin-gift-card-bulk-form">
            <div className="mb-4 flex items-center gap-2"><UsersRound size={18} className="text-fuchsia-600" /><div><h2 className="font-bold text-slate-900">Bulk issue to customers</h2><p className="text-xs text-slate-500">{selectedRecipientIds.size ? `${selectedRecipientIds.size} selected customer${selectedRecipientIds.size === 1 ? '' : 's'}` : recipientGroupId ? 'Selected customer group' : 'Select customers or a group'}</p></div></div>
            <CustomerAudienceToolbar search={recipientSearchInput} onSearchChange={setRecipientSearchInput} onSearchSubmit={applyRecipientSearch} groupId={recipientGroupId} onGroupChange={changeRecipientGroup} groups={groups} loadingGroups={loadingGroups} selectedCount={selectedRecipientIds.size} visibleCount={customers.length} allVisibleSelected={allRecipientsSelected} onToggleAll={toggleAllRecipients} onClearSelection={() => setSelectedRecipientIds(new Set())} testId="gift-card-recipient" />
            <div className="max-h-56 overflow-y-auto rounded-xl border border-fuchsia-100 bg-white">{loadingCustomers ? <div className="p-5"><Loader size="sm" /></div> : customers.map(row => { const id = String(row.user._id); return <label key={id} className="flex cursor-pointer items-center gap-3 border-b border-slate-100 px-3 py-2 last:border-b-0 hover:bg-fuchsia-50"><input type="checkbox" checked={selectedRecipientIds.has(id)} onChange={() => toggleRecipient(id)} data-testid={`gift-card-recipient-select-${id}`} className="h-4 w-4 rounded border-slate-300 text-fuchsia-600" /><span className="min-w-0"><span className="block truncate text-xs font-semibold text-slate-800">{row.user.name || row.user.email || row.user.phone}</span><span className="block truncate text-[11px] text-slate-500">{row.user.email || row.user.phone || 'No contact'}</span></span></label>; })}</div>
            {!loadingCustomers && customers.length === 0 && <p className="px-2 py-3 text-center text-xs text-slate-500">No customer recipients found.</p>}
            <div className="mt-3"><Pagination currentPage={recipientPagination.page || 1} totalPages={recipientPagination.pages || 1} onPageChange={page => loadCustomers(page)} /></div>
            <form onSubmit={createBulk} className="mt-4 space-y-3"><label className="block text-xs font-semibold text-slate-600">Amount per customer<input className="input mt-1" type="number" min="0.01" step="0.01" value={bulkForm.amount} onChange={event => setBulkForm({ ...bulkForm, amount: event.target.value })} required data-testid="gift-card-bulk-amount" /></label><label className="block text-xs font-semibold text-slate-600">Expiry (optional)<input className="input mt-1" type="datetime-local" value={bulkForm.expiresAt} onChange={event => setBulkForm({ ...bulkForm, expiresAt: event.target.value })} data-testid="gift-card-bulk-expires" /></label><label className="block text-xs font-semibold text-slate-600">Sender<input className="input mt-1" maxLength={120} value={bulkForm.senderName} onChange={event => setBulkForm({ ...bulkForm, senderName: event.target.value })} data-testid="gift-card-bulk-sender" /></label><label className="block text-xs font-semibold text-slate-600">Message<textarea className="input mt-1 min-h-20" maxLength={500} value={bulkForm.message} onChange={event => setBulkForm({ ...bulkForm, message: event.target.value })} data-testid="gift-card-bulk-message" /></label><button type="submit" disabled={bulkSaving || (!selectedRecipientIds.size && !recipientGroupId)} className="btn-primary w-full text-sm" data-testid="gift-card-bulk-submit">{bulkSaving ? 'Issuing…' : 'Issue to selected audience'}</button></form>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" data-testid="admin-gift-card-create-form">
            <div className="mb-4 flex items-center gap-2"><Gift size={18} className="text-fuchsia-600" /><div><h2 className="font-bold text-slate-900">Issue one Gift Card</h2><p className="text-xs text-slate-500">Generate a secure one-time bearer code.</p></div></div>
            <form onSubmit={create} className="space-y-3"><label className="block text-xs font-semibold text-slate-600">Amount<input className="input mt-1" type="number" min="0.01" step="0.01" value={form.amount} onChange={event => setForm({ ...form, amount: event.target.value })} required data-testid="gift-card-amount" /></label><label className="block text-xs font-semibold text-slate-600">Expiry (optional)<input className="input mt-1" type="datetime-local" value={form.expiresAt} onChange={event => setForm({ ...form, expiresAt: event.target.value })} data-testid="gift-card-expires" /></label><div className="grid grid-cols-1 gap-2 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-600">Recipient<input data-testid="gift-card-recipient" className="input mt-1" maxLength={120} value={form.recipientName} onChange={event => setForm({ ...form, recipientName: event.target.value })} /></label><label className="text-xs font-semibold text-slate-600">Sender<input data-testid="gift-card-sender" className="input mt-1" maxLength={120} value={form.senderName} onChange={event => setForm({ ...form, senderName: event.target.value })} /></label></div><div className="grid grid-cols-1 gap-2 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-600">Email<input data-testid="gift-card-email" className="input mt-1" type="email" maxLength={160} value={form.recipientEmail} onChange={event => setForm({ ...form, recipientEmail: event.target.value })} /></label><label className="text-xs font-semibold text-slate-600">Phone<input data-testid="gift-card-phone" className="input mt-1" type="tel" maxLength={30} value={form.recipientPhone} onChange={event => setForm({ ...form, recipientPhone: event.target.value })} /></label></div><label className="block text-xs font-semibold text-slate-600">Message<textarea data-testid="gift-card-message" className="input mt-1 min-h-20" maxLength={500} value={form.message} onChange={event => setForm({ ...form, message: event.target.value })} /></label><button type="submit" disabled={saving} className="btn-primary w-full text-sm" data-testid="gift-card-create-submit">{saving ? 'Issuing…' : 'Issue gift card'}</button></form>
          </section>
        </div>
      </div>}
    </div>
  </>;
}
