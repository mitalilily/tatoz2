const TONES = {
  slate: { band: 'border-slate-200 bg-slate-100/70', chip: 'bg-slate-900 text-white', kicker: 'text-slate-500' },
  indigo: { band: 'border-indigo-200/70 bg-indigo-50/70', chip: 'bg-indigo-600 text-white', kicker: 'text-indigo-600' },
  rose: { band: 'border-rose-200/70 bg-rose-50/70', chip: 'bg-rose-500 text-white', kicker: 'text-rose-600' },
  amber: { band: 'border-amber-200/70 bg-amber-50/70', chip: 'bg-amber-500 text-white', kicker: 'text-amber-600' },
  emerald: { band: 'border-emerald-200/70 bg-emerald-50/70', chip: 'bg-emerald-600 text-white', kicker: 'text-emerald-600' },
  fuchsia: { band: 'border-fuchsia-200/70 bg-fuchsia-50/70', chip: 'bg-fuchsia-600 text-white', kicker: 'text-fuchsia-600' },
};

/**
 * Shared account-page header: tinted band + icon medallion + kicker/title/sub.
 * Pure static styling (no animation, shadow or blur) so it stays lightweight.
 */
const AccountHeader = ({ kicker, title, sub, icon, accent = 'slate', actions }) => {
  const tone = TONES[accent] || TONES.slate;
  return (
    <div className={`mb-4 flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-4 sm:mb-6 sm:gap-4 sm:px-5 ${tone.band}`}>
      {icon && (
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone.chip}`}>
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1 basis-48">
        <p className={`text-xs font-bold uppercase tracking-[0.18em] ${tone.kicker}`}>{kicker}</p>
        <h1 className="mt-0.5 break-anywhere text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
        {sub && <p className="mt-1 max-w-2xl break-anywhere text-sm text-slate-500">{sub}</p>}
      </div>
      {actions}
    </div>
  );
};

export default AccountHeader;
