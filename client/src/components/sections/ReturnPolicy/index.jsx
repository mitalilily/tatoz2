import { RefreshCw, ShieldCheck } from 'lucide-react';

export default function ReturnPolicy({ data = {} }) {
  const days = data.days || 7;
  const iconType = data.iconType || 'refresh';

  return (
    <div className="py-4 px-6 bg-gray-50">
      <div className="flex items-center justify-center gap-4">
        {iconType === 'refresh' ? (
          <RefreshCw size={24} className="text-green-600" />
        ) : (
          <ShieldCheck size={24} className="text-green-600" />
        )}
        <div className="text-center">
          <p className="text-sm font-semibold text-gray-900">Easy {days}-Day Returns</p>
          {data.text && <p className="text-xs text-gray-500 mt-0.5">{data.text}</p>}
        </div>
      </div>
    </div>
  );
}