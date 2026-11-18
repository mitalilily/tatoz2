import { useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Check, ChevronRight, Image, ListChecks, Loader2, RotateCcw, Send, Sparkles, X } from 'lucide-react';
import { adminPageAPI } from '../../../services/api';
import { applyAILayout, hydratePageBuilder, savePage } from '../../../store/slices/pageBuilderSlice';
import { SECTION_REGISTRY } from '../../sections/registry';

const SUGGESTIONS = [
  'Make this page feel more premium and editorial',
  'Move the hero to the top and add a featured product showcase below it',
  'Add 24 px top and bottom padding to every section',
];

function buildCatalog() {
  return Object.entries(SECTION_REGISTRY).map(([type, entry]) => {
    let defaults = {};
    try { defaults = entry.defaults?.() || {}; } catch (_) { /* use empty defaults */ }
    return { type, label: entry.label, category: entry.category, defaults };
  });
}

function resultText(result, applied = false) {
  const imageCount = (result.images || []).reduce((total, item) => total + (item.count || 0), 0);
  const imageSummary = imageCount
    ? ` I placed ${imageCount} web image${imageCount === 1 ? '' : 's'} after the approval.`
    : '';
  const visualChecks = Array.isArray(result.visualChecks) ? result.visualChecks : [];
  const verifiedVisuals = visualChecks.filter(check => check.verified).length;
  const verificationSummary = visualChecks.length
    ? ` Visual check: ${verifiedVisuals}/${visualChecks.length} requested visual asset${visualChecks.length === 1 ? '' : 's'} verified.`
    : '';
  const warningSummary = result.warnings?.length ? ` ${result.warnings.join(' ')}` : '';
  const partialSummary = result.status === 'applied_with_warnings'
    ? ' Some requested changes need review; adjust the request if necessary.'
    : '';
  const reviewSummary = applied
    ? ' Review the preview, then Save or Publish when ready.'
    : '';
  return `${result.message || (applied ? 'The approved plan has been applied.' : 'I prepared a plan for this page.')}${imageSummary}${verificationSummary}${warningSummary}${partialSummary}${reviewSummary}`;
}

function isApprovalIntent(value) {
  return /^(?:yes|y|ok|okay|sure|confirm|apply|apply changes|build|build it|build preview|do it|go ahead|looks good|proceed|approved?)\s*[!.]*$/i.test(String(value || '').trim());
}

function PlanList({ items = [], emptyText = 'No additional steps.' }) {
  if (!items.length) return <div className="text-[11px] text-slate-500">{emptyText}</div>;
  return (
    <ul className="space-y-1.5">
      {items.map((item, index) => {
        const text = typeof item === 'string' ? item : item.details;
        return (
          <li key={`${text}-${index}`} className="flex items-start gap-2 text-[11px] leading-4 text-slate-700">
            <span className="mt-1 flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[9px] font-bold text-indigo-700">{index + 1}</span>
            <span>{text}</span>
          </li>
        );
      })}
    </ul>
  );
}

function ImpactSummary({ impact }) {
  if (!impact || !impact.totalChanges) return null;
  const tone = impact.level === 'high'
    ? 'border-red-200 bg-red-50 text-red-800'
    : impact.level === 'medium'
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : 'border-emerald-200 bg-emerald-50 text-emerald-800';
  return (
    <div data-testid="page-builder-ai-impact" className={`mt-3 rounded-lg border px-2.5 py-2 text-[11px] ${tone}`}>
      <div className="font-semibold">Change impact: {impact.level}</div>
      <div className="mt-0.5">{impact.summary}</div>
    </div>
  );
}

function QualitySummary({ quality }) {
  if (!quality || typeof quality.score !== 'number') return null;
  const tone = quality.level === 'good'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
    : quality.level === 'review'
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : 'border-red-200 bg-red-50 text-red-800';
  return (
    <div data-testid="page-builder-ai-quality" className={`mt-3 rounded-lg border px-2.5 py-2 text-[11px] ${tone}`}>
      <div className="font-semibold">Plan quality: {quality.score}/100 · {quality.level.replace('_', ' ')}</div>
      <div className="mt-0.5">{quality.summary}</div>
      {quality.issues?.slice(0, 2).map(issue => (
        <div key={issue.code} className="mt-1">• {issue.message}</div>
      ))}
    </div>
  );
}

function ContextSummary({ pageContext }) {
  if (!pageContext?.goal?.label) return null;
  return (
    <div data-testid="page-builder-ai-context" className="mt-3 rounded-lg border border-indigo-100 bg-white px-2.5 py-2 text-[11px] text-indigo-800">
      <span className="font-semibold">AI context: </span>
      {pageContext.goal.label}
      {' · '}
      {pageContext.layout?.sectionCount || 0} current section{pageContext.layout?.sectionCount === 1 ? '' : 's'}
      {' · '}
      {pageContext.catalog?.totalProducts || 0} active product{pageContext.catalog?.totalProducts === 1 ? '' : 's'}
      {pageContext.responsive?.mode === 'separate' ? ' · separate mobile layout' : ''}
    </div>
  );
}

function RecommendationList({ recommendations = [], onUse }) {
  if (!recommendations.length) return null;
  return (
    <div data-testid="page-builder-ai-recommendations" className="mt-3 border-t border-indigo-100 pt-2">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-indigo-700">Recommended directions</div>
        <div className="text-[10px] text-indigo-500">Choose the tradeoff</div>
      </div>
      <div className="space-y-1.5">
        {recommendations.map(item => (
          <div key={item.key} className={`rounded-lg border px-2.5 py-2 ${item.recommended ? 'border-indigo-300 bg-white' : 'border-indigo-100 bg-indigo-50/50'}`}>
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-slate-800">
                  <span>{item.rank}. {item.title}</span>
                  {item.recommended && <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[9px] text-indigo-700">Recommended</span>}
                </div>
                <div className="mt-0.5 text-[10px] leading-4 text-slate-600">{item.summary}</div>
                <div className="mt-0.5 text-[10px] leading-4 text-slate-500"><span className="font-semibold">Tradeoff:</span> {item.tradeoff}</div>
              </div>
              <span className="flex-shrink-0 rounded-md bg-slate-100 px-1.5 py-1 text-[9px] font-semibold text-slate-600">{item.fitScore}/100</span>
            </div>
            {onUse && (
              <button
                type="button"
                data-testid={`page-builder-ai-recommendation-${item.key}`}
                onClick={() => onUse(item)}
                className="mt-1.5 rounded-md border border-indigo-200 bg-white px-2 py-1 text-[10px] font-semibold text-indigo-700 hover:border-indigo-400 hover:bg-indigo-50"
              >Use this direction</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function VisualCriticSummary({ critique }) {
  if (!critique || typeof critique.score !== 'number') return null;
  const tone = critique.level === 'good'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
    : critique.level === 'review'
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : 'border-red-200 bg-red-50 text-red-800';
  return (
    <div data-testid="page-builder-ai-visual-critic" data-screenshot-captured={critique.screenshot?.captured ? 'true' : 'false'} className={`rounded-lg border px-2.5 py-2 text-[11px] ${tone}`}>
      <div className="flex items-center justify-between gap-2 font-semibold">
        <span>Rendered preview audit: {critique.score}/100 · {String(critique.level).replace('_', ' ')}</span>
        {critique.screenshot?.captured && <span className="text-[9px] font-medium">Screenshot checked</span>}
      </div>
      <div className="mt-0.5">{critique.summary}</div>
      {critique.issues?.slice(0, 2).map(item => (
        <div key={item.code} className="mt-1">• {item.message}</div>
      ))}
    </div>
  );
}

export default function PageBuilderAIChat({ pageId }) {
  const dispatch = useDispatch();
  const page = useSelector(s => s.pageBuilder.page);
  const layout = useSelector(s => s.pageBuilder.layout);
  const mobileLayout = useSelector(s => s.pageBuilder.mobileLayout);
  const editingMobileLayout = useSelector(s => s.pageBuilder.editingMobileLayout);
  const previewCritique = useSelector(s => s.pageBuilder.previewCritique);
  const storageKey = `page-builder-ai:${pageId}`;
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingPlan, setPendingPlan] = useState(null);
  const [appliedContext, setAppliedContext] = useState(() => {
    if (typeof window === 'undefined') return null;
    try {
      const saved = JSON.parse(window.localStorage.getItem(`${storageKey}:applied`) || 'null');
      return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : null;
    } catch (_) {
      return null;
    }
  });
  const [planFeedback, setPlanFeedback] = useState(() => {
    if (typeof window === 'undefined') return null;
    try {
      const saved = JSON.parse(window.localStorage.getItem(`${storageKey}:feedback`) || 'null');
      return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : null;
    } catch (_) {
      return null;
    }
  });
  const [lastCheckpoint, setLastCheckpoint] = useState(() => {
    if (typeof window === 'undefined') return null;
    try {
      const saved = JSON.parse(window.localStorage.getItem(`${storageKey}:checkpoint`) || 'null');
      return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : null;
    } catch (_) {
      return null;
    }
  });
  const [decisionLedger, setDecisionLedger] = useState(() => {
    if (typeof window === 'undefined') return {};
    try {
      const saved = JSON.parse(window.localStorage.getItem(`${storageKey}:decisions`) || 'null');
      return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
    } catch (_) {
      return {};
    }
  });
  const [storageHydrated, setStorageHydrated] = useState(false);
  const [messages, setMessages] = useState(() => {
    if (typeof window === 'undefined') return [{ role: 'assistant', text: 'Tell me the outcome you want. I will inspect the page, explain the plan, ask when a choice matters, and wait for your approval before changing the preview.' }];
    try {
      const saved = JSON.parse(window.localStorage.getItem(`${storageKey}:messages`) || 'null');
      return Array.isArray(saved) && saved.length ? saved.slice(-20) : [{ role: 'assistant', text: 'Tell me the outcome you want. I will inspect the page, explain the plan, ask when a choice matters, and wait for your approval before changing the preview.' }];
    } catch (_) {
      return [{ role: 'assistant', text: 'Tell me the outcome you want. I will inspect the page, explain the plan, ask when a choice matters, and wait for your approval before changing the preview.' }];
    }
  });
  const scrollRef = useRef(null);
  const promptRef = useRef(null);
  const catalog = useMemo(buildCatalog, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !storageHydrated) return;
    try {
      window.localStorage.setItem(`${storageKey}:messages`, JSON.stringify(messages.slice(-20)));
      window.localStorage.setItem(`${storageKey}:decisions`, JSON.stringify(decisionLedger));
      if (appliedContext) window.localStorage.setItem(`${storageKey}:applied`, JSON.stringify(appliedContext));
      else window.localStorage.removeItem(`${storageKey}:applied`);
      if (planFeedback) window.localStorage.setItem(`${storageKey}:feedback`, JSON.stringify(planFeedback));
      else window.localStorage.removeItem(`${storageKey}:feedback`);
      if (lastCheckpoint) window.localStorage.setItem(`${storageKey}:checkpoint`, JSON.stringify(lastCheckpoint));
      else window.localStorage.removeItem(`${storageKey}:checkpoint`);
      if (pendingPlan) window.localStorage.setItem(`${storageKey}:pending`, JSON.stringify(pendingPlan));
      else window.localStorage.removeItem(`${storageKey}:pending`);
    } catch (_) {}
  }, [appliedContext, decisionLedger, lastCheckpoint, messages, pendingPlan, planFeedback, storageKey, storageHydrated]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = JSON.parse(window.localStorage.getItem(`${storageKey}:pending`) || 'null');
      if (saved && (saved.kind === 'confirmation' || saved.kind === 'clarification')) setPendingPlan(saved);
      const applied = JSON.parse(window.localStorage.getItem(`${storageKey}:applied`) || 'null');
      if (applied && typeof applied === 'object' && !Array.isArray(applied)) setAppliedContext(applied);
      const feedback = JSON.parse(window.localStorage.getItem(`${storageKey}:feedback`) || 'null');
      if (feedback && typeof feedback === 'object' && !Array.isArray(feedback)) setPlanFeedback(feedback);
      const checkpoint = JSON.parse(window.localStorage.getItem(`${storageKey}:checkpoint`) || 'null');
      if (checkpoint && typeof checkpoint === 'object' && !Array.isArray(checkpoint)) setLastCheckpoint(checkpoint);
    } catch (_) {}
    setStorageHydrated(true);
  }, [storageKey]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open, pendingPlan, busy]);

  const addMessage = message => setMessages(current => [...current.slice(-19), message]);

  const activeTarget = () => {
    const target = editingMobileLayout && mobileLayout ? 'mobile' : 'desktop';
    return {
      target,
      targetLayout: target === 'mobile' ? mobileLayout : layout,
    };
  };

  const requestPlan = async (value, { answers = {}, decisions = {}, userText = value, resetPending = true } = {}) => {
    const text = String(value || '').trim();
    if (!text || busy || !pageId) return;
    const knownDecisions = { ...decisionLedger, ...decisions, ...answers };

    // Treat a natural-language approval as the same action as the button. This
    // keeps the chat conversational without accidentally sending "yes" back
    // to the model as a new, ambiguous design request.
    if (!answers || Object.keys(answers).length === 0) {
      if (pendingPlan?.kind === 'confirmation' && isApprovalIntent(text)) {
        addMessage({ role: 'user', text });
        await applyPlan();
        return;
      }
    }

    const { target, targetLayout } = activeTarget();
    if (resetPending) setPendingPlan(null);
    setPrompt('');
    setOpen(true);
    if (userText) addMessage({ role: 'user', text: userText });
    setBusy(true);
    try {
      const response = await adminPageAPI.aiEdit(pageId, {
        mode: 'plan',
        prompt: text,
        answers,
        decisionLedger: knownDecisions,
        context: (appliedContext || planFeedback)
          ? { lastApplied: appliedContext, lastAdjusted: planFeedback }
          : undefined,
        target,
        layout: targetLayout,
        catalog,
      });
      const result = response.data || {};
      const resolvedDecisionLedger = result.decisionLedger || knownDecisions;
      setDecisionLedger(resolvedDecisionLedger);

      if (result.requiresClarification) {
        setPendingPlan({
          kind: 'clarification',
          prompt: text,
          target,
          questions: result.questions || [],
          answers: {},
          decisionLedger: resolvedDecisionLedger,
          quality: result.quality || null,
          pageContext: result.pageContext || null,
          recommendations: result.recommendations || [],
        });
        addMessage({
          role: 'assistant',
          text: result.message || 'I need a couple of decisions before I make this change.',
          decisionSummary: result.decisionSummary,
          quality: result.quality || null,
          pageContext: result.pageContext || null,
          recommendations: result.recommendations || [],
        });
      } else if (result.requiresConfirmation && result.proposal) {
        setPendingPlan({
          kind: 'confirmation',
          prompt: text,
          target,
          proposal: result.proposal,
          plan: result.plan || [],
          changes: result.changes || [],
          assumptions: result.assumptions || [],
          sectionOrder: result.sectionOrder || [],
          resolvedProductSource: result.resolvedProductSource || null,
          imageSearches: result.imageSearches || [],
          impact: result.impact || null,
          quality: result.quality || null,
          pageContext: result.pageContext || null,
          decisionLedger: resolvedDecisionLedger,
          contextUsed: result.contextUsed === true,
          feedbackUsed: result.feedbackUsed === true,
          recommendations: result.recommendations || [],
        });
        addMessage({
          role: 'assistant',
          text: result.message || 'I prepared a plan for your review.',
          decisionSummary: result.decisionSummary,
          quality: result.quality || null,
          pageContext: result.pageContext || null,
          recommendations: result.recommendations || [],
        });
      } else if (result.layout) {
        // Backward-compatible fallback for an older server response.
        dispatch(applyAILayout({ layout: result.layout, target }));
        addMessage({ role: 'assistant', text: resultText(result, true) });
      } else {
        addMessage({ role: 'assistant', text: 'I could not create a safe page plan. Please make the request more specific.', error: true });
      }
    } catch (error) {
      addMessage({
        role: 'assistant',
        error: true,
        text: error.response?.data?.error || error.response?.data?.message || error.message || 'I could not plan this page change. Please try again.',
      });
    } finally {
      setBusy(false);
    }
  };

  const continueClarification = () => {
    if (!pendingPlan || pendingPlan.kind !== 'clarification') return;
    const missing = pendingPlan.questions.find(question => question.required !== false && !pendingPlan.answers?.[question.id]?.trim());
    if (missing) {
      addMessage({ role: 'assistant', error: true, text: `Please answer: ${missing.question}` });
      return;
    }
    const answerSummary = pendingPlan.questions
      .map(question => `${question.question} ${pendingPlan.answers?.[question.id] || ''}`)
      .join(' · ');
    requestPlan(pendingPlan.prompt, {
      answers: pendingPlan.answers,
      decisions: pendingPlan.decisionLedger || decisionLedger,
      userText: `Answers: ${answerSummary}`,
    });
  };

  const useRecommendation = recommendation => {
    if (!recommendation) return;
    const base = pendingPlan?.prompt || 'Improve this page';
    setPendingPlan(null);
    setPrompt(`${base}. Use a ${String(recommendation.title || 'balanced').toLowerCase()} approach and explain the tradeoff before applying.`);
    setOpen(true);
    setTimeout(() => promptRef.current?.focus(), 0);
  };

  const applyPlan = async () => {
    if (!pendingPlan || pendingPlan.kind !== 'confirmation' || busy) return;
    const plan = pendingPlan;
    const { target, targetLayout } = activeTarget();
    setBusy(true);
    try {
      const response = await adminPageAPI.aiEdit(pageId, {
        mode: 'apply',
        prompt: plan.prompt,
        target,
        layout: targetLayout,
        catalog,
        proposal: plan.proposal,
      });
      const result = response.data || {};
      if (!result.layout) throw new Error('The approved plan did not return a layout.');
      dispatch(applyAILayout({ layout: result.layout, target }));
      if (result.checkpoint) await dispatch(savePage()).unwrap();
      setPendingPlan(null);
      setPlanFeedback(null);
      setLastCheckpoint(result.checkpoint || null);
      setAppliedContext({
        prompt: plan.prompt,
        changes: result.changes || [],
        imageSearches: result.imageSearches || plan.imageSearches || [],
        warnings: result.warnings || [],
        visualChecks: result.visualChecks || [],
        quality: result.quality || null,
        recommendations: result.recommendations || plan.recommendations || [],
      });
      addMessage({
        role: 'assistant',
        text: resultText(result, true),
        changes: result.changes || [],
        warning: result.status === 'applied_with_warnings' || result.warnings?.length > 0,
        applied: true,
        checkpoint: result.checkpoint || null,
        impact: result.impact || null,
        quality: result.quality || null,
        pageContext: result.pageContext || null,
        recommendations: result.recommendations || plan.recommendations || [],
      });
    } catch (error) {
      addMessage({
        role: 'assistant',
        error: true,
        text: error.response?.data?.error || error.response?.data?.message || error.message || 'I could not apply the approved plan. Please try again.',
      });
    } finally {
      setBusy(false);
    }
  };

  const rollbackAIChange = async () => {
    if (!lastCheckpoint || busy || !pageId) return;
    setBusy(true);
    try {
      const response = await adminPageAPI.rollbackAICheckpoint(pageId, lastCheckpoint.id, {
        builderRevision: page?.builderRevision,
      });
      if (!response.data?.page) throw new Error('The AI checkpoint did not return the restored page.');
      dispatch(hydratePageBuilder(response.data.page));
      setLastCheckpoint(null);
      setAppliedContext(null);
      setPlanFeedback(null);
      addMessage({ role: 'assistant', text: 'The latest AI change was rolled back. The previous draft is restored.' });
    } catch (error) {
      addMessage({
        role: 'assistant',
        error: true,
        text: error.response?.data?.error || error.response?.data?.message || error.message || 'I could not roll back the AI change. Reload the latest draft and try again.',
      });
    } finally {
      setBusy(false);
    }
  };

  const askForAdjustment = () => {
    if (pendingPlan?.kind === 'confirmation') {
      setPlanFeedback({
        prompt: pendingPlan.prompt,
        changes: pendingPlan.changes || [],
        imageSearches: pendingPlan.imageSearches || [],
        warnings: [],
        visualChecks: [],
      });
    }
    setPendingPlan(null);
    addMessage({ role: 'assistant', text: 'No problem. Tell me what you want to adjust in the plan.' });
    setTimeout(() => promptRef.current?.focus(), 0);
  };

  const onKeyDown = event => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      requestPlan(prompt);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="page-builder-ai-open"
        className="fixed bottom-5 left-1/2 z-40 inline-flex -translate-x-1/2 items-center gap-2 rounded-full bg-slate-950 px-4 py-2.5 text-white shadow-xl shadow-slate-900/20 transition-colors hover:bg-indigo-700"
      >
        <Sparkles size={16} className="text-indigo-300" />
        <span className="text-xs font-semibold">Design with AI</span>
        <span className="text-[10px] text-slate-400">Plan, review, apply</span>
      </button>
    );
  }

  return (
    <div data-testid="page-builder-ai-chat" className="fixed bottom-4 left-1/2 z-40 w-[min(720px,calc(100vw-2rem))] -translate-x-1/2">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/20">
        <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-950 px-4 py-3 text-white">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-300"><Sparkles size={16} /></div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">Design with AI</div>
            <div className="text-[11px] text-slate-400">Plan first · ask when needed · apply only after approval</div>
          </div>
          <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Close AI designer"><X size={16} /></button>
        </div>

        <div ref={scrollRef} className="max-h-[28rem] space-y-2 overflow-y-auto bg-slate-50 px-4 py-3">
          <VisualCriticSummary critique={previewCritique} />
          {messages.map((message, index) => (
            <div key={message.role + '-' + index} className={'flex ' + (message.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div className={
                'max-w-[91%] rounded-2xl px-3 py-2 text-xs leading-5 ' +
                (message.role === 'user'
                  ? 'rounded-br-md bg-indigo-600 text-white'
                  : message.error
                    ? 'rounded-bl-md border border-red-100 bg-red-50 text-red-700'
                    : message.warning
                      ? 'rounded-bl-md border border-amber-200 bg-amber-50 text-amber-800'
                    : 'rounded-bl-md border border-slate-200 bg-white text-slate-700')
              }
              data-testid={message.applied ? 'page-builder-ai-apply-result' : undefined}
              >
                <div>{message.text}</div>
                {message.decisionSummary && (
                  <div className="mt-2 border-t border-slate-100 pt-2 text-[11px] text-slate-500">
                    <span className="font-semibold text-slate-700">Why this plan: </span>{message.decisionSummary}
                  </div>
                )}
                {message.changes?.length > 0 && (
                  <div className="mt-2 border-t border-slate-100 pt-2"><PlanList items={message.changes} /></div>
                )}
                <ImpactSummary impact={message.impact} />
                <QualitySummary quality={message.quality} />
                <ContextSummary pageContext={message.pageContext} />
                <RecommendationList recommendations={message.recommendations} onUse={message.applied ? null : useRecommendation} />
                {message.checkpoint && message.checkpoint.id === lastCheckpoint?.id && (
                  <button
                    type="button"
                    data-testid="page-builder-ai-undo-checkpoint"
                    onClick={rollbackAIChange}
                    disabled={busy}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-indigo-700 hover:border-indigo-300 hover:bg-indigo-50 disabled:opacity-50"
                  ><RotateCcw size={12} /> Undo AI change</button>
                )}
                {message.warning && (
                  <button
                    type="button"
                    data-testid="page-builder-ai-adjust-after-warning"
                    onClick={askForAdjustment}
                    className="mt-2 rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-amber-800 hover:border-amber-400"
                  >Adjust request</button>
                )}
              </div>
            </div>
          ))}

          {pendingPlan?.kind === 'clarification' && (
            <div data-testid="page-builder-ai-clarification" className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-slate-700">
              <div className="mb-2 flex items-center gap-2 font-semibold text-amber-900"><span className="flex h-6 w-6 items-center justify-center rounded-lg bg-white text-amber-600"><ListChecks size={14} /></span> I need your confirmation on these choices</div>
              <div className="space-y-3">
                {pendingPlan.questions.map(question => (
                  <div key={question.id}>
                    <div className="mb-1.5 text-[11px] font-medium leading-4">{question.question}</div>
                    {question.options?.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {question.options.map(option => {
                          const active = pendingPlan.answers?.[question.id] === option;
                          return (
                            <button
                              key={option}
                              type="button"
                              data-testid={`page-builder-ai-option-${question.id}-${option.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                              onClick={() => setPendingPlan(current => ({ ...current, answers: { ...(current.answers || {}), [question.id]: option } }))}
                              className={`rounded-full border px-2.5 py-1 text-[10px] transition-colors ${active ? 'border-indigo-500 bg-indigo-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-700'}`}
                            >{option}</button>
                          );
                        })}
                      </div>
                    )}
                    {!question.options?.length && (
                      <input
                        data-testid={`page-builder-ai-answer-${question.id}`}
                        value={pendingPlan.answers?.[question.id] || ''}
                        onChange={event => setPendingPlan(current => ({ ...current, answers: { ...(current.answers || {}), [question.id]: event.target.value } }))}
                        className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[11px] outline-none focus:border-indigo-400"
                        placeholder="Type your answer…"
                      />
                    )}
                  </div>
                ))}
              </div>
              <button type="button" data-testid="page-builder-ai-continue" onClick={continueClarification} disabled={busy} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-3 py-2 text-[11px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">Continue <ChevronRight size={13} /></button>
            </div>
          )}

          {pendingPlan?.kind === 'confirmation' && (
            <div data-testid="page-builder-ai-plan" className="rounded-2xl border border-indigo-200 bg-indigo-50 p-3 text-xs text-slate-700">
              <div className="mb-2 flex items-center gap-2 font-semibold text-indigo-900"><span className="flex h-6 w-6 items-center justify-center rounded-lg bg-white text-indigo-600"><ListChecks size={14} /></span> Build preview from this plan</div>
              {pendingPlan.contextUsed && (
                <div data-testid="page-builder-ai-context-memory" className="mb-3 rounded-lg border border-indigo-100 bg-white px-2.5 py-2 text-[11px] text-indigo-800">
                  Continuing from the last applied AI change; current preview remains the source of truth.
                </div>
              )}
              {pendingPlan.feedbackUsed && (
                <div data-testid="page-builder-ai-adjustment-memory" className="mb-3 rounded-lg border border-amber-100 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800">
                  I incorporated your adjustment to the previous plan and will avoid repeating it unchanged.
                </div>
              )}
              <ContextSummary pageContext={pendingPlan.pageContext} />
              <ImpactSummary impact={pendingPlan.impact} />
              <QualitySummary quality={pendingPlan.quality} />
              <RecommendationList recommendations={pendingPlan.recommendations} onUse={useRecommendation} />
              <PlanList items={pendingPlan.changes.length ? pendingPlan.changes : pendingPlan.plan} emptyText="The request is already reflected in the current layout." />
              {Object.keys(pendingPlan.decisionLedger || {}).length > 0 && (
                <div data-testid="page-builder-ai-confirmed-decisions" className="mt-3 border-t border-indigo-100 pt-2">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-indigo-700">Confirmed brief</div>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(pendingPlan.decisionLedger).map(([key, value]) => (
                      <span key={key} className="rounded-full border border-indigo-200 bg-white px-2 py-1 text-[10px] text-indigo-800">{value}</span>
                    ))}
                  </div>
                </div>
              )}
              {pendingPlan.resolvedProductSource && (
                <div data-testid="page-builder-ai-resolved-source" className="mt-3 border-t border-indigo-100 pt-2 text-[11px] text-indigo-800">
                  <span className="font-semibold">Catalog match: </span>
                  {pendingPlan.resolvedProductSource.name}
                  {' · '}
                  {pendingPlan.resolvedProductSource.productCount} active product{pendingPlan.resolvedProductSource.productCount === 1 ? '' : 's'}
                  {' · '}
                  {pendingPlan.resolvedProductSource.type}
                </div>
              )}
              {pendingPlan.imageSearches?.length > 0 && (
                <div data-testid="page-builder-ai-image-searches" className="mt-3 border-t border-indigo-100 pt-2">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-indigo-700">Visual assets to find after approval</div>
                  <PlanList items={pendingPlan.imageSearches.map(search => `Search “${search.query}” for ${search.target}.`)} />
                </div>
              )}
              {pendingPlan.sectionOrder?.length > 0 && (
                <div className="mt-3 border-t border-indigo-100 pt-2">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-indigo-700">Preview section order</div>
                  <PlanList items={pendingPlan.sectionOrder} />
                </div>
              )}
              {pendingPlan.assumptions.length > 0 && (
                <div className="mt-3 border-t border-indigo-100 pt-2 text-[11px] text-indigo-800"><span className="font-semibold">Assumptions: </span>{pendingPlan.assumptions.join(' · ')}</div>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={applyPlan} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-[11px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">{busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Build preview</button>
                <button type="button" onClick={askForAdjustment} disabled={busy} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-600 hover:border-indigo-300 hover:text-indigo-700 disabled:opacity-50">Adjust plan</button>
              </div>
            </div>
          )}

          {busy && (
            <div className="flex items-center gap-2 text-xs text-slate-500"><Loader2 size={14} className="animate-spin text-indigo-600" />{pendingPlan?.kind === 'confirmation' ? 'Applying your approved plan…' : 'Inspecting sections and preparing a precise plan…'}</div>
          )}
        </div>

        <div className="border-t border-slate-100 bg-white px-4 py-3">
          {messages.filter(message => message.role === 'user').length === 0 && (
            <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
              {SUGGESTIONS.map(suggestion => (
                <button key={suggestion} type="button" onClick={() => requestPlan(suggestion)} className="flex-shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[10px] text-slate-600 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700">{suggestion}</button>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-500/10">
            <textarea
              ref={promptRef}
              value={prompt}
              onChange={event => setPrompt(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder="e.g. Add 24 px top/bottom padding everywhere and show featured products below the hero…"
              rows={2}
              data-testid="page-builder-ai-input"
              disabled={busy}
              className="min-h-[42px] flex-1 resize-none bg-transparent px-1 py-1 text-xs text-slate-800 outline-none placeholder:text-slate-400 disabled:opacity-60"
            />
            <button type="button" data-testid="page-builder-ai-send" onClick={() => requestPlan(prompt)} disabled={busy || !prompt.trim()} className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400" aria-label="Send prompt">
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            </button>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-400"><Check size={11} className="text-emerald-500" /> Nothing changes until you approve the plan. <Image size={11} className="ml-auto text-slate-300" /></div>
        </div>
      </div>
    </div>
  );
}
