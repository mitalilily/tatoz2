import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { CheckCircle2, Clock3, FileWarning, ScrollText, UploadCloud } from 'lucide-react';
import toast from 'react-hot-toast';
import { vendorAPI } from '../../services/api';
import Loader from '../../components/common/Loader';

const DOC_SLOTS = [
  ['gstCertificate', 'GST certificate'],
  ['panCard', 'PAN card'],
  ['businessProof', 'Business proof'],
  ['bankProof', 'Bank proof (cancelled cheque / statement)'],
  ['fssaiCertificate', 'FSSAI certificate (Food/FMCG only)'],
];

const CHECKLIST_LABELS = {
  profile: 'Store profile',
  bank: 'Payout bank details',
  tax: 'Tax identity (PAN / GSTIN)',
  docs: 'KYC documents',
  agreement: 'Seller agreement',
};

const stateTone = (state) => {
  if (state === 'approved') return 'bg-emerald-50 text-emerald-700';
  if (state === 'rejected') return 'bg-rose-50 text-rose-700';
  if (state === 'changes_requested') return 'bg-amber-50 text-amber-700';
  return 'bg-sky-50 text-sky-700';
};

export default function VendorOnboardingStatusPage() {
  const { isAuthenticated } = useSelector((s) => s.auth);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const load = () => {
    setLoading(true);
    vendorAPI.getOnboardingStatus()
      .then((r) => setData(r.data?.data || null))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const uploadDocs = async (event) => {
    const files = event.target.files;
    if (!files?.length) return;
    const form = new FormData();
    const slot = event.target.dataset.slot;
    form.append(slot, files[0]);
    setUploading(true);
    try {
      await vendorAPI.uploadOnboardingDocuments(form);
      toast.success('Document submitted for review');
      load();
    } catch (e) { toast.error(e.response?.data?.message || e.message || 'Upload failed'); }
    finally { setUploading(false); event.target.value = ''; }
  };

  const acceptAgreement = async () => {
    try {
      await vendorAPI.acceptOnboardingAgreement(data?.currentAgreementVersion);
      toast.success('Agreement accepted');
      load();
    } catch (e) { toast.error(e.response?.data?.message || e.message || 'Could not accept agreement'); }
  };

  const resubmit = async () => {
    try {
      await vendorAPI.resubmitOnboarding();
      toast.success('Application resubmitted for review');
      load();
    } catch (e) { toast.error(e.response?.data?.message || e.message || 'Resubmit failed'); }
  };

  if (!isAuthenticated) {
    return <div className="mx-auto max-w-lg px-4 py-16 text-center"><h1 className="text-2xl font-bold">Sign in to track your application</h1><Link to="/login?redirect=/vendor/onboarding" className="mt-6 inline-block rounded-lg bg-indigo-600 px-6 py-2.5 font-medium text-white">Sign in</Link></div>;
  }
  if (loading) return <div className="flex justify-center py-16"><Loader /></div>;
  if (!data) {
    return <div className="mx-auto max-w-lg px-4 py-16 text-center"><FileWarning className="mx-auto text-gray-300" size={48} /><h1 className="mt-4 text-2xl font-bold">No seller application found</h1><p className="mt-2 text-sm text-gray-500">Start one and it will appear here with a live review checklist.</p><Link to="/vendor/register" className="mt-6 inline-block rounded-lg bg-indigo-600 px-6 py-2.5 font-medium text-white">Become a seller</Link></div>;
  }

  const state = data.onboarding?.state || data.status;
  const sla = data.onboarding?.slaDueAt ? new Date(data.onboarding.slaDueAt) : null;
  const docs = data.verification?.documents || {};
  const agreed = (data.agreements || []).length > 0;

  return <div className="mx-auto max-w-4xl space-y-6 px-4 py-10" data-testid="vendor-onboarding-status-page">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-xs font-bold uppercase tracking-widest text-indigo-600">Seller application</p><h1 className="mt-1 text-2xl font-bold text-gray-900">{data.storeName}</h1></div>
      <span data-testid="onboarding-state" className={`rounded-full px-3 py-1 text-sm font-semibold capitalize ${stateTone(state)}`}>{String(state).replaceAll('_', ' ')}</span>
    </header>

    {sla && ['pending', 'changes_requested'].includes(state) && <p className="flex items-center gap-2 text-sm text-gray-500"><Clock3 size={15} /> Review expected by {sla.toLocaleDateString()}.</p>}
    {data.onboarding?.reasonCode && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm"><p className="font-semibold text-amber-800">Reviewer note · {data.onboarding.reasonCode}</p><p className="mt-1 text-amber-700">{data.onboarding.reasonNote || data.verification?.rejectionReason || 'Please review the flagged sections and resubmit.'}</p></div>}

    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <h2 className="font-bold text-gray-900">Completion checklist</h2>
      <div className="mt-3 space-y-2">
        {Object.entries(CHECKLIST_LABELS).map(([key, label]) => {
          const done = key === 'agreement' ? agreed : data.checklist?.[key];
          return <div key={key} className="flex items-center gap-3 text-sm"><CheckCircle2 size={17} className={done ? 'text-emerald-500' : 'text-gray-200'} /><span className={done ? 'text-gray-800' : 'text-gray-400'}>{label}</span></div>;
        })}
      </div>
    </section>

    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2"><UploadCloud size={18} className="text-indigo-600" /><h2 className="font-bold text-gray-900">KYC documents</h2></div>
      <p className="mt-1 text-xs text-gray-500">Images or PDFs, up to 8 MB each. Uploading moves your file to review.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {DOC_SLOTS.map(([slot, label]) => { const required = (data.requiredDocumentSlots || []).includes(slot); const locked = slot === 'gstCertificate' && Boolean(docs[slot]); return <label key={slot} className={`block rounded-xl border p-4 text-sm ${locked ? 'border-emerald-200 bg-emerald-50/40' : 'border-gray-200 hover:border-indigo-300'}`}><span className="font-medium text-gray-800">{label} {required && <span className="text-rose-500">*</span>}</span><span className="mt-1 block text-xs text-gray-400">{locked ? 'Submitted and locked — contact admin through a support ticket to change GST' : docs[slot] ? 'Submitted — choose a file to replace' : required ? 'Required before approval' : 'Optional'}</span>{!locked && <input data-slot={slot} type="file" accept="image/*,.pdf" className="mt-2 w-full text-xs" onChange={uploadDocs} disabled={uploading} />}</label>; })}
      </div>
    </section>

    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2"><ScrollText size={18} className="text-indigo-600" /><h2 className="font-bold text-gray-900">Seller agreement {data.currentAgreementVersion}</h2></div>
      {agreed
        ? <p className="mt-2 text-sm text-emerald-600">Accepted — you are covered by the marketplace participation, commission and returns terms.</p>
        : <><p className="mt-2 text-sm text-gray-500">Accept the marketplace participation, commission, returns and SLA terms to finish your application.</p><button data-testid="onboarding-accept-agreement" onClick={acceptAgreement} className="mt-3 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white">Accept agreement</button></>}
    </section>

    {['rejected', 'changes_requested'].includes(state) && <div className="flex justify-end"><button data-testid="onboarding-resubmit" onClick={resubmit} className="rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white">Resubmit for review</button></div>}
    <p className="text-center text-sm text-gray-500">Need to change GST or ask about your application? <Link className="font-semibold text-indigo-600" to="/support">Create a support ticket</Link>.</p>
  </div>;
}
