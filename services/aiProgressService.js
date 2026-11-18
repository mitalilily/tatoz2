// Short-lived in-memory progress for the admin product-analysis request.
// The progress endpoint is protected by the same admin middleware as the
// analysis endpoint, and entries are removed shortly after completion.
const progress = new Map();
const ENTRY_TTL_MS = 60 * 1000;

const clamp = value => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));

const scheduleRemoval = id => {
  setTimeout(() => progress.delete(id), ENTRY_TTL_MS).unref?.();
};

const beginProgress = id => {
  if (!id) return null;
  const entry = {
    id,
    progress: 0,
    stage: 'starting',
    message: 'Preparing your product images',
    status: 'running',
    updatedAt: Date.now(),
  };
  progress.set(id, entry);
  return entry;
};

const updateProgress = (id, value, stage, message) => {
  const entry = progress.get(id);
  if (!entry) return null;
  const nextProgress = clamp(value);
  // Concurrent image workers can finish out of order. Never let a slower
  // callback move a real progress bar backwards.
  if (nextProgress >= entry.progress) {
    entry.progress = nextProgress;
    if (stage) entry.stage = stage;
    if (message) entry.message = message;
  }
  entry.updatedAt = Date.now();
  return entry;
};

const completeProgress = (id, message = 'Analysis complete') => {
  const entry = updateProgress(id, 100, 'complete', message);
  if (entry) {
    entry.status = 'complete';
    scheduleRemoval(id);
  }
  return entry;
};

const failProgress = (id, message = 'Analysis failed') => {
  const entry = progress.get(id);
  if (!entry) return null;
  entry.status = 'error';
  entry.stage = 'error';
  entry.message = message;
  entry.updatedAt = Date.now();
  scheduleRemoval(id);
  return entry;
};

const getProgress = id => progress.get(id) || null;

module.exports = { beginProgress, updateProgress, completeProgress, failProgress, getProgress };
