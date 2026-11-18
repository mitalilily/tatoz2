import { useState } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';

export default function AnnouncementBar({ data = {} }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  if (!data.text) return null;
  const style = { backgroundColor: data.backgroundColor || '#111827', color: data.textColor || '#ffffff' };
  return (
    <div style={style} className="w-full text-xs sm:text-sm py-2 px-4">
      <div className="container mx-auto flex items-center justify-center gap-3 text-center">
        <span>{data.text}</span>
        {data.linkLabel && data.linkUrl && (
          (data.linkUrl.startsWith('http') || data.linkUrl.startsWith('#'))
            ? <a href={data.linkUrl} className="font-semibold underline">{data.linkLabel}</a>
            : <Link to={data.linkUrl} className="font-semibold underline">{data.linkLabel}</Link>
        )}
        {data.dismissible && (
          <button onClick={() => setHidden(true)} className="ml-auto opacity-70 hover:opacity-100 flex-shrink-0" title="Dismiss"><X size={14} /></button>
        )}
      </div>
    </div>
  );
}
