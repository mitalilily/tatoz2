import { useEffect, useState } from 'react';
import { CheckSquare, Search, UsersRound, X } from 'lucide-react';
import { adminAPI } from '../../services/api';

export const useCustomerGroups = () => {
  const [groups, setGroups] = useState([]);
  const [loadingGroups, setLoadingGroups] = useState(true);

  const loadGroups = async () => {
    setLoadingGroups(true);
    try {
      const response = await adminAPI.getCustomerSegments();
      setGroups(response.data.segments || []);
    } catch (_) {
      setGroups([]);
    } finally {
      setLoadingGroups(false);
    }
  };

  useEffect(() => { loadGroups(); }, []);
  return { groups, loadingGroups, reloadGroups: loadGroups };
};

export default function CustomerAudienceToolbar({
  search,
  onSearchChange,
  onSearchSubmit,
  groupId,
  onGroupChange,
  groups = [],
  selectedCount = 0,
  visibleCount = 0,
  allVisibleSelected = false,
  onToggleAll,
  onClearSelection,
  placeholder = 'Search name, email or phone',
  searchLabel = 'Search customers',
  groupLabel = 'Customer group',
  groupHint = 'Bulk actions can target the selected customer group even when its members are not on this page.',
  testId = 'customer-audience',
  loadingGroups = false,
}) {
  return (
    <div className="space-y-3 border-b border-slate-100 bg-slate-50/70 px-5 py-4" data-testid={`${testId}-toolbar`}>
      <div className="flex flex-wrap items-end gap-3">
        <form onSubmit={onSearchSubmit} className="min-w-[220px] flex-1">
          <label className="block text-[11px] font-bold uppercase tracking-wide text-slate-500" htmlFor={`${testId}-search`}>{searchLabel}</label>
          <div className="mt-1 flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input id={`${testId}-search`} value={search} onChange={event => onSearchChange(event.target.value)} className="input w-full pl-9 text-sm" placeholder={placeholder} data-testid={`${testId}-search`} />
            </div>
            <button type="submit" className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-700" data-testid={`${testId}-search-submit`}>Search</button>
          </div>
        </form>
        <label className="min-w-[220px] flex-1 text-[11px] font-bold uppercase tracking-wide text-slate-500" htmlFor={`${testId}-group`}>
          {groupLabel}
          <select id={`${testId}-group`} value={groupId} onChange={event => onGroupChange(event.target.value)} className="input mt-1 w-full bg-white text-sm" data-testid={`${testId}-group`} disabled={loadingGroups}>
            <option value="">All customer groups</option>
            {groups.map(group => <option key={group._id} value={group._id}>{group.name} ({group.memberCount || 0})</option>)}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 text-slate-500">
          <UsersRound size={14} className="text-indigo-500" />
          <span>{loadingGroups ? 'Loading groups…' : `${groups.length} customer group${groups.length === 1 ? '' : 's'} available`}</span>
        </div>
        {onToggleAll && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-700">{selectedCount} selected</span>
            <button type="button" onClick={onToggleAll} disabled={!visibleCount} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-semibold text-slate-600 hover:border-indigo-300 disabled:cursor-not-allowed disabled:opacity-50" data-testid={`${testId}-select-all`}><CheckSquare size={13} />{allVisibleSelected ? 'Unselect visible' : 'Select visible'}</button>
            {selectedCount > 0 && <button type="button" onClick={onClearSelection} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 font-semibold text-slate-500 hover:bg-white hover:text-rose-600" data-testid={`${testId}-clear-selection`}><X size={13} />Clear</button>}
          </div>
        )}
      </div>
      {groupId && <p className="rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs text-indigo-700">{groupHint}</p>}
    </div>
  );
}
