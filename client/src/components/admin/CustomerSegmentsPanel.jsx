import { useEffect, useMemo, useState } from 'react';
import { Filter, Plus, Play, Eye, Edit3, Trash2, X } from 'lucide-react';
import { adminAPI } from '../../services/api';
import Modal from '../common/Modal';
import Loader from '../common/Loader';
import toast from 'react-hot-toast';

const DEFAULT_CONDITION = { field: 'orders_count', operator: 'gte', value: 1 };

const defaultForm = () => ({
  name: '',
  description: '',
  match: 'all',
  isActive: true,
  conditions: [{ ...DEFAULT_CONDITION }],
});

const fieldFor = (fields, key) => fields.find(field => field.field === key) || fields[0] || {
  field: key,
  label: key,
  type: 'string',
  operators: ['eq'],
};

const payloadFor = form => ({
  name: form.name,
  description: form.description,
  isActive: form.isActive,
  definition: {
    match: form.match,
    conditions: form.conditions.map(condition => ({
      ...condition,
      value: ['in', 'not_in'].includes(condition.operator)
        ? String(condition.value || '').split(',').map(value => value.trim()).filter(Boolean)
        : condition.value,
    })),
  },
});

const CustomerSegmentsPanel = ({ onFilter }) => {
  const [segments, setSegments] = useState([]);
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(defaultForm());
  const [editingId, setEditingId] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const response = await adminAPI.getCustomerSegments();
      setSegments(response.data.segments || []);
      setFields(response.data.fields || []);
    } catch {
      toast.error('Could not load customer segments');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const activeField = useMemo(() => fieldFor(fields, form.conditions[0]?.field), [fields, form.conditions]);

  const openCreate = () => {
    setEditingId(null);
    setForm(defaultForm());
    setPreview(null);
    setFormOpen(true);
  };

  const openEdit = segment => {
    setEditingId(segment._id);
    setForm({
      name: segment.name,
      description: segment.description || '',
      match: segment.definition?.match || 'all',
      isActive: segment.isActive !== false,
      conditions: (segment.definition?.conditions || []).map(condition => ({
        ...condition,
        value: Array.isArray(condition.value) ? condition.value.join(', ') : condition.value,
      })),
    });
    setPreview(null);
    setFormOpen(true);
  };

  const updateCondition = (index, patch) => {
    setForm(current => ({
      ...current,
      conditions: current.conditions.map((condition, conditionIndex) => conditionIndex === index
        ? { ...condition, ...patch }
        : condition),
    }));
  };

  const changeField = (index, fieldName) => {
    const field = fieldFor(fields, fieldName);
    updateCondition(index, {
      field: fieldName,
      operator: field.operators[0],
      value: field.type === 'boolean' ? true : field.type === 'number' ? 0 : '',
    });
  };

  const previewForm = async () => {
    if (!form.name.trim()) { toast.error('Give the segment a name first'); return; }
    setBusy(true);
    try {
      const response = await adminAPI.previewCustomerSegment(payloadFor(form));
      setPreview(response.data.preview);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not preview segment');
    } finally { setBusy(false); }
  };

  const saveForm = async () => {
    if (!form.name.trim()) { toast.error('Segment name is required'); return; }
    setBusy(true);
    try {
      if (editingId) await adminAPI.updateCustomerSegment(editingId, payloadFor(form));
      else await adminAPI.createCustomerSegment(payloadFor(form));
      toast.success(editingId ? 'Segment updated' : 'Segment created');
      setFormOpen(false);
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not save segment');
    } finally { setBusy(false); }
  };

  const apply = async segment => {
    setBusy(true);
    try {
      const response = await adminAPI.applyCustomerSegment(segment._id);
      toast.success(`${response.data.count} customer${response.data.count === 1 ? '' : 's'} matched`);
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not apply segment');
    } finally { setBusy(false); }
  };

  const remove = async segment => {
    if (!window.confirm(`Delete ${segment.name}?`)) return;
    try {
      await adminAPI.deleteCustomerSegment(segment._id);
      toast.success('Segment deleted');
      await load();
      onFilter?.('');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not delete segment');
    }
  };

  return (
    <div className="card p-4 space-y-3" data-testid="customer-segments-panel">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-900 flex items-center gap-2"><Filter size={17} className="text-primary-600" />Customer Segments</h2>
          <p className="text-xs text-gray-500 mt-1">Build tenant-scoped audiences from authoritative orders, carts, location and customer signals.</p>
        </div>
        <button onClick={openCreate} data-testid="customer-segment-create" className="btn-primary px-3 py-2 text-xs flex items-center gap-1.5"><Plus size={14} />New segment</button>
      </div>

      {loading ? <div className="flex justify-center py-4"><Loader /></div> : segments.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 p-4 text-xs text-gray-500">No dynamic segments yet. Create one to preview and materialize an audience.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {segments.map(segment => (
            <div key={segment._id} className="rounded-xl border border-gray-100 bg-gray-50 p-3" data-testid={`customer-segment-card-${segment._id}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-gray-800 truncate">{segment.name}</p>
                  <p className="text-[11px] text-gray-500 truncate">{segment.description || `${segment.definition?.match === 'any' ? 'Any' : 'All'} conditions`}</p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${segment.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>{segment.isActive ? 'Active' : 'Inactive'}</span>
              </div>
              <div className="flex items-center gap-3 mt-3 text-xs text-gray-500">
                <span><strong className="text-gray-800">{segment.memberCount || 0}</strong> members</span>
                <span>{segment.definition?.conditions?.length || 0} rule{segment.definition?.conditions?.length === 1 ? '' : 's'}</span>
                {segment.lastEvaluatedAt && <span>Updated {new Date(segment.lastEvaluatedAt).toLocaleDateString('en-IN')}</span>}
              </div>
              <div className="flex flex-wrap gap-1.5 mt-3">
                <button onClick={() => onFilter?.(segment._id)} data-testid={`customer-segment-filter-${segment._id}`} className="px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 text-[11px] text-gray-700 hover:border-primary-300 flex items-center gap-1"><Eye size={12} />Use in table</button>
                <button onClick={() => apply(segment)} disabled={busy} data-testid={`customer-segment-apply-${segment._id}`} className="px-2.5 py-1.5 rounded-lg bg-primary-50 text-primary-700 text-[11px] hover:bg-primary-100 flex items-center gap-1"><Play size={12} />Apply rules</button>
                <button onClick={() => openEdit(segment)} data-testid={`customer-segment-edit-${segment._id}`} className="p-1.5 rounded-lg text-gray-500 hover:bg-white" aria-label={`Edit ${segment.name}`}><Edit3 size={13} /></button>
                <button onClick={() => remove(segment)} data-testid={`customer-segment-delete-${segment._id}`} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50" aria-label={`Delete ${segment.name}`}><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={formOpen} onClose={() => setFormOpen(false)} title={editingId ? 'Edit Customer Segment' : 'Create Customer Segment'} size="lg">
        <div className="space-y-4" data-testid="customer-segment-form">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Segment name *</label>
              <input data-testid="customer-segment-name" value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} className="input text-sm" placeholder="High value customers" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">Match</label>
              <select data-testid="customer-segment-match" value={form.match} onChange={event => setForm(current => ({ ...current, match: event.target.value }))} className="input bg-white text-sm">
                <option value="all">All conditions</option>
                <option value="any">Any condition</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 mb-1 block">Description</label>
            <input value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} className="input text-sm" placeholder="Used for retention campaigns" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between"><p className="text-sm font-semibold text-gray-800">Rules</p><button type="button" onClick={() => setForm(current => ({ ...current, conditions: [...current.conditions, { ...DEFAULT_CONDITION }] }))} disabled={form.conditions.length >= 12} className="text-xs text-primary-600 hover:text-primary-800">+ Add rule</button></div>
            {form.conditions.map((condition, index) => {
              const field = fieldFor(fields, condition.field);
              return (
                <div key={`${index}-${condition.field}`} className="grid grid-cols-1 md:grid-cols-[1.2fr_0.8fr_1fr_auto] gap-2 items-center" data-testid={`customer-segment-condition-${index}`}>
                  <select data-testid={`customer-segment-field-${index}`} value={condition.field} onChange={event => changeField(index, event.target.value)} className="input bg-white text-xs">
                    {fields.map(option => <option key={option.field} value={option.field}>{option.label}</option>)}
                  </select>
                  <select data-testid={`customer-segment-operator-${index}`} value={condition.operator} onChange={event => updateCondition(index, { operator: event.target.value })} className="input bg-white text-xs">
                    {field.operators.map(operator => <option key={operator} value={operator}>{operator.replace('_', ' ')}</option>)}
                  </select>
                  {field.type === 'boolean' ? (
                    <select data-testid={`customer-segment-value-${index}`} value={String(condition.value)} onChange={event => updateCondition(index, { value: event.target.value === 'true' })} className="input bg-white text-xs"><option value="true">Yes</option><option value="false">No</option></select>
                  ) : (
                    <input data-testid={`customer-segment-value-${index}`} type={field.type === 'number' ? 'number' : 'text'} value={condition.value} onChange={event => updateCondition(index, { value: event.target.value })} className="input text-xs" placeholder={['in', 'not_in'].includes(condition.operator) ? 'Comma separated' : 'Value'} />
                  )}
                  <button type="button" disabled={form.conditions.length === 1} onClick={() => setForm(current => ({ ...current, conditions: current.conditions.filter((_, conditionIndex) => conditionIndex !== index) }))} className="p-2 text-gray-400 hover:text-red-500 disabled:opacity-30" aria-label="Remove rule"><X size={14} /></button>
                </div>
              );
            })}
          </div>
          {preview && <div className="rounded-xl bg-primary-50 border border-primary-100 p-3 text-xs" data-testid="customer-segment-preview"><p className="font-semibold text-primary-800">Preview: {preview.count} matching customers</p><p className="text-primary-700 mt-1">{preview.sample?.slice(0, 3).map(customer => customer.name || customer.email || customer.phone).filter(Boolean).join(', ') || 'No sample customers yet.'}</p></div>}
          <div className="flex gap-2 justify-end"><button type="button" onClick={() => setFormOpen(false)} className="btn-secondary px-4 text-sm">Cancel</button><button type="button" onClick={previewForm} disabled={busy} data-testid="customer-segment-preview-button" className="btn-secondary px-4 text-sm flex items-center gap-1.5"><Eye size={14} />Preview</button><button type="button" onClick={saveForm} disabled={busy} data-testid="customer-segment-save" className="btn-primary px-4 text-sm">{editingId ? 'Save changes' : 'Create segment'}</button></div>
        </div>
      </Modal>
    </div>
  );
};

export default CustomerSegmentsPanel;
