import { useState, useEffect, useCallback } from 'react';
import { Sparkles } from 'lucide-react';
import { aiAPI } from '../../services/api';

const AiCreditsPill = ({ variant = 'header' }) => {
 const [credits, setCredits] = useState(null);

 const fetchCredits = useCallback(async () => {
 try {
 const res = await aiAPI.getCredits();
 setCredits(res.data.credits);
 } catch {}
 }, []);

 useEffect(() => {
 fetchCredits();
 }, [fetchCredits]);

 // Listen for credit updates from AI operations
 useEffect(() => {
 const handler = (e) => {
 if (e.detail?.aiCredits !== undefined) setCredits(e.detail.aiCredits);
 };
 window.addEventListener('ai-credits-updated', handler);
 return () => window.removeEventListener('ai-credits-updated', handler);
 }, []);

 if (credits === null) return null;

 const isLow = credits < 200;
 const isEmpty = credits <= 0;

 if (variant === 'sidebar') {
 const padded = String(credits).padStart(8, '0');
 const groups = [padded.slice(0, 2), padded.slice(2, 4), padded.slice(4, 6), padded.slice(6, 8)];
 const balanceClass = isEmpty ? 'text-red-500' : isLow ? 'text-amber-500' : 'text-indigo-600';

 return (
 <div
  className="relative px-1 pb-2"
  title={`AI Credits: ${credits}. Credit cost varies by AI service.`}
 >
  <div
   className="relative overflow-hidden rounded-xl border border-white/90 bg-gradient-to-br from-white via-indigo-50/80 to-slate-100 p-3 shadow-md ring-1 ring-slate-200/80"
   style={{ aspectRatio: '1.7/1' }}
  >
  <div className="relative flex h-full flex-col justify-between">
   <div className="flex items-start justify-between">
    <div className="flex items-center gap-2">
     <div className="flex h-6 w-8 items-center justify-center rounded-md border border-amber-300/70 bg-gradient-to-br from-amber-200 to-amber-400 shadow-sm">
      <div className="grid h-3.5 w-5 grid-cols-3 grid-rows-2 gap-px rounded-[2px] border border-amber-600/30 p-px">
       {[...Array(6)].map((_, index) => <span key={index} className="rounded-[1px] bg-amber-600/25" />)}
      </div>
     </div>
     <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className="text-slate-400">
      <path d="M12 2a10 10 0 0 1 0 20M12 6a6 6 0 0 1 0 12M12 10a2 2 0 0 1 0 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
     </svg>
    </div>
    <div className="flex items-center gap-1 text-slate-400">
     <Sparkles size={12} className="text-indigo-500" />
     <span className="text-[8px] font-bold uppercase tracking-[0.16em]">AI credits</span>
    </div>
   </div>
   <div className="flex items-center gap-2">
    {groups.map((group, index) => <span key={`credit-group-${index}`} className="font-mono text-xs font-semibold tracking-[0.16em] text-slate-600">{group}</span>)}
   </div>
   <div className="flex items-end justify-between">
    <div>
     <p className="text-[7px] font-medium uppercase tracking-[0.14em] text-slate-400">Available credits</p>
     <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">AI platform</p>
    </div>
    <div className="text-right">
     <p className="text-[7px] font-medium uppercase tracking-[0.14em] text-slate-400">Balance</p>
     <p className={`mt-0.5 font-mono text-base font-bold ${balanceClass}`}>{credits.toLocaleString()}</p>
    </div>
   </div>
  </div>
 </div>
 </div>
 );
 }

 return (
 <div
 className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${
 isEmpty
 ? 'bg-red-100 text-red-700 border border-red-200'
 : isLow
 ? 'bg-amber-100 text-amber-700 border border-amber-200'
 : 'bg-gradient-to-r from-indigo-50 to-purple-50 text-indigo-700 border border-indigo-200'
 }`}
 title={`AI Credits: ${credits}. Credit cost varies by AI service.`}
 >
 <Sparkles size={12} className={isEmpty ? 'text-red-500' : isLow ? 'text-amber-500' : 'text-indigo-500'} />
 <span>{credits.toLocaleString()}</span>
 <span className="text-[10px] font-medium opacity-60">credits</span>
 </div>
 );
};

export default AiCreditsPill;
