import { lazy, Suspense } from 'react';
import 'react-quill-new/dist/quill.snow.css';
import { Field, Select } from '../../admin/pageBuilder/inputs';

const ReactQuill = lazy(() => import('react-quill-new'));

const MODULES = {
  toolbar: [
    [{ header: [2, 3, false] }],
    ['bold', 'italic', 'underline', 'link'],
    [{ list: 'ordered' }, { list: 'bullet' }],
    ['blockquote'],
    ['clean'],
  ],
};

export default function RichTextSettings({ data, onChange }) {
  return (
    <div>
      <Field label="Content">
        <div className="bg-white">
          <Suspense fallback={<div className="h-24 animate-pulse bg-gray-100 rounded" />}>
            <ReactQuill
              theme="snow"
              value={data.html || ''}
              onChange={html => { if (html !== (data.html || '')) onChange({ html }); }}
              modules={MODULES}
            />
          </Suspense>
        </div>
      </Field>
      <Field label="Align">
        <Select value={data.align || 'left'} onChange={e => onChange({ align: e.target.value })} options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }]} />
      </Field>
      <Field label="Max width">
        <Select value={data.maxWidth || 'normal'} onChange={e => onChange({ maxWidth: e.target.value })}
          options={[{ value: 'narrow', label: 'Narrow' }, { value: 'normal', label: 'Normal' }, { value: 'wide', label: 'Wide' }, { value: 'full', label: 'Full' }]} />
      </Field>
    </div>
  );
}
