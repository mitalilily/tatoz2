import { Package, AlertTriangle } from 'lucide-react';

export default function StockCounter({ data = {} }) {
  const count = data.count || 5;
  const threshold = data.threshold || 5;
  const isLow = count <= threshold;
  const message = data.message || 'Only {count} left!';

  return (
    <div className={`py-3 px-6 ${isLow ? 'bg-red-50' : 'bg-green-50'}`}>
      <div className="flex items-center justify-center gap-2">
        {isLow ? <AlertTriangle size={16} className="text-red-600" /> : <Package size={16} className="text-green-600" />}
        <span className={`text-sm font-semibold ${isLow ? 'text-red-700' : 'text-green-700'}`}>
          {message.replace('{count}', count)}
        </span>
      </div>
    </div>
  );
}