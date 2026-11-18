import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { X, Calendar } from 'lucide-react';
import { adminPageAPI } from '../../../services/api';
import { fetchPage } from '../../../store/slices/pageBuilderSlice';

function localIsoForInput(d) {
  if (!d) return '';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

export default function SchedulePopover({ open, onClose }) {
  const dispatch = useDispatch();
  const page = useSelector(s => s.pageBuilder.page);
  const [when, setWhen] = useState(() => localIsoForInput(page?.scheduledPublishAt) || '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setWhen(localIsoForInput(page?.scheduledPublishAt) || '');
  }, [open, page?.scheduledPublishAt]);

  if (!open || !page) return null;

  const onSchedule = async () => {
    if (!when) return;
    setBusy(true);
    try {
      const iso = new Date(when).toISOString();
      await adminPageAPI.schedule(page._id, iso);
      toast.success('Scheduled');
      await dispatch(fetchPage(page._id));
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Schedule failed');
    } finally {
      setBusy(false);
    }
  };
  const onClear = async () => {
    setBusy(true);
    try {
      await adminPageAPI.schedule(page._id, null);
      toast.success('Schedule cleared');
      await dispatch(fetchPage(page._id));
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Clear failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute right-4 top-14 w-[360px] bg-white rounded-xl shadow-xl border border-gray-200">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="font-bold text-gray-900 flex items-center gap-2"><Calendar size={16} /> Schedule publish</div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={16} /></button>
        </div>
        <div className="p-4">
          <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1">Publish at</div>
          <input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" min={localIsoForInput(new Date(Date.now() + 60_000))} />
          {page.scheduledPublishAt && (
            <div className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              Currently scheduled for: {new Date(page.scheduledPublishAt).toLocaleString()}
            </div>
          )}
          <div className="mt-4 flex gap-2 justify-end">
            {page.scheduledPublishAt && <button onClick={onClear} disabled={busy} className="text-sm px-3 py-1.5 rounded text-red-600 hover:bg-red-50">Clear schedule</button>}
            <button onClick={onClose} disabled={busy} className="text-sm px-3 py-1.5 rounded text-gray-700 hover:bg-gray-50">Cancel</button>
            <button onClick={onSchedule} disabled={busy || !when} className="text-sm px-4 py-1.5 rounded bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-50">Schedule</button>
          </div>
        </div>
      </div>
    </div>
  );
}
