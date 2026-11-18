import { Zap } from 'lucide-react';

export default function FlashSaleBanner({ data = {} }) {
  const message = data.message || 'FLASH SALE: 20% OFF!';
  const bgColor = data.bgColor || '#ef4444';
  const animated = data.animated !== false;

  return (
    <div className="py-3 px-6" style={{ backgroundColor: bgColor }}>
      <div className={`flex items-center justify-center gap-2 text-white font-semibold ${animated ? 'animate-pulse' : ''}`}>
        <Zap size={18} className="fill-current" />
        <span>{message}</span>
        <Zap size={18} className="fill-current" />
      </div>
    </div>
  );
}