import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

function compute(endsAt) {
  if (!endsAt) return null;
  const ms = new Date(endsAt).getTime() - Date.now();
  if (Number.isNaN(ms)) return null;
  if (ms <= 0) return { expired: true };
  return {
    expired: false,
    days: Math.floor(ms / 86_400_000),
    hours: Math.floor((ms % 86_400_000) / 3_600_000),
    minutes: Math.floor((ms % 3_600_000) / 60_000),
    seconds: Math.floor((ms % 60_000) / 1_000),
  };
}

function Cell({ value, label, textColor }) {
  return (
    <div className="flex flex-col items-center">
      <div className="bg-black/30 rounded-lg px-3 md:px-4 py-2 md:py-3 min-w-[52px] md:min-w-[68px] text-center font-mono font-bold text-2xl md:text-3xl" style={{ color: textColor }}>
        {String(value).padStart(2, '0')}
      </div>
      <div className="text-[10px] md:text-xs mt-1 uppercase tracking-wider opacity-80" style={{ color: textColor }}>{label}</div>
    </div>
  );
}

export default function Countdown({ data = {} }) {
  const [t, setT] = useState(() => compute(data.endsAt));
  useEffect(() => {
    const id = setInterval(() => setT(compute(data.endsAt)), 1000);
    return () => clearInterval(id);
  }, [data.endsAt]);

  const style = { backgroundColor: data.backgroundColor || '#dc2626', color: data.textColor || '#ffffff' };

  return (
    <section className="container mx-auto px-4">
      <div className="rounded-2xl py-8 px-6 text-center" style={style}>
        {data.heading && <h2 className="text-2xl md:text-3xl font-bold mb-1">{data.heading}</h2>}
        {data.subheading && <p className="text-sm md:text-base opacity-90 mb-6">{data.subheading}</p>}
        {!t || t.expired ? (
          <div className="text-lg font-semibold opacity-90">{data.expiredMessage || 'Sale has ended'}</div>
        ) : (
          <div className="flex justify-center gap-2 md:gap-4">
            <Cell value={t.days} label="Days" textColor={data.textColor} />
            <Cell value={t.hours} label="Hours" textColor={data.textColor} />
            <Cell value={t.minutes} label="Minutes" textColor={data.textColor} />
            <Cell value={t.seconds} label="Seconds" textColor={data.textColor} />
          </div>
        )}
        {data.ctaLabel && (
          <Link to={data.ctaLink || '/'} className="inline-block mt-6 px-6 py-2.5 bg-white text-gray-900 font-semibold rounded-lg hover:bg-gray-100 transition">
            {data.ctaLabel}
          </Link>
        )}
      </div>
    </section>
  );
}
