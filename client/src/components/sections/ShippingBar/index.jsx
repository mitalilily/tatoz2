import { Truck } from 'lucide-react';

export default function ShippingBar({ data = {} }) {
  const threshold = data.threshold || 499;
  const message = data.message || 'Free shipping on orders over ₹{threshold}!';
  const progress = Math.min(100, (75 / threshold) * 100);

  return (
    <div className="bg-indigo-50 py-3 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <Truck size={18} className="text-indigo-600 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="min-w-0 break-anywhere text-sm font-medium text-indigo-900">
                {message.replace('{threshold}', `₹${threshold}`)}
              </span>
              <span className="text-xs text-indigo-700">{Math.round(progress)}%</span>
            </div>
            <div className="h-2 bg-indigo-200 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-600 rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
