import { lazy, Suspense } from 'react';
import 'react-quill-new/dist/quill.snow.css';
import { Field, TextInput, Select } from '../../admin/pageBuilder/inputs';

const ReactQuill = lazy(() => import('react-quill-new'));

const QUILL_MODULES = {
  toolbar: [['bold', 'italic', 'link'], [{ list: 'ordered' }, { list: 'bullet' }], ['clean']],
};

export default function TabsSettings({ data, onChange }) {
  const tabs = data.tabs || [];
  const updateTab = (i, patch) => {
    const current = tabs[i] || {};
    if (Object.entries(patch).every(([key, value]) => current[key] === value)) return;
    const next = tabs.slice();
    next[i] = { ...current, ...patch };
    onChange({ tabs: next });
  };
  const addTab = () => onChange({ tabs: [...tabs, { label: `Tab ${tabs.length + 1}`, bodyHtml: '' }] });
  const removeTab = (i) => onChange({ tabs: tabs.filter((_, j) => j !== i) });
  return (
    <div>
      <Field label="Heading (optional)"><TextInput value={data.heading || ''} onChange={e => onChange({ heading: e.target.value })} /></Field>
      <Field label="Style">
        <Select value={data.style || 'underline'} onChange={e => onChange({ style: e.target.value })}
          options={[{ value: 'underline', label: 'Underline' }, { value: 'pills', label: 'Pills' }]} />
      </Field>
      <div className="border-t border-gray-200 pt-3 mt-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-700 mb-2">Tabs ({tabs.length})</div>
        {tabs.map((t, i) => (
          <div key={i} className="border border-gray-200 rounded-md p-3 mb-3 bg-gray-50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-700">Tab {i + 1}</span>
              <button onClick={() => removeTab(i)} className="text-xs text-red-600">Remove</button>
            </div>
            <Field label="Label"><TextInput value={t.label || ''} onChange={e => updateTab(i, { label: e.target.value })} /></Field>
            <Field label="Body">
              <div className="bg-white">
                <Suspense fallback={<div className="h-24 animate-pulse bg-gray-100 rounded" />}>
                  <ReactQuill theme="snow" value={t.bodyHtml || ''} onChange={html => updateTab(i, { bodyHtml: html })} modules={QUILL_MODULES} />
                </Suspense>
              </div>
            </Field>
          </div>
        ))}
        <button onClick={addTab} className="w-full py-2 border border-dashed border-gray-300 rounded-md text-sm text-gray-600 hover:bg-gray-50">+ Add tab</button>
      </div>
    </div>
  );
}
