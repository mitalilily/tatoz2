import { Truck, Shield, Headphones, RotateCcw, Clock, Check, Gift, Award, Sparkles, Zap } from 'lucide-react';
import { gridStyle } from '../../page/grid';

const ICON = { truck: Truck, shield: Shield, headphones: Headphones, rotate: RotateCcw, clock: Clock, check: Check, gift: Gift, award: Award, sparkles: Sparkles, zap: Zap };

export default function UspRow({ data = {} }) {
  const items = Array.isArray(data.items) ? data.items : [];
  if (!items.length) return <div className="py-6 text-center text-sm text-gray-400">USP row — no items</div>;
  return (
    <section className="container mx-auto px-4">
      <div data-page-grid="benefits" className="grid" style={gridStyle(data, { columns: 4 })}>
        {items.map((it, i) => {
          const Icon = ICON[it.icon] || Check;
          return (
            <div key={i} className="min-w-0 break-words flex flex-col items-center text-center px-2">
              <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3"><Icon size={22} /></div>
              {it.heading && <div className="text-sm font-bold text-gray-900">{it.heading}</div>}
              {it.subtext && <div className="text-xs text-gray-500 mt-1">{it.subtext}</div>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
