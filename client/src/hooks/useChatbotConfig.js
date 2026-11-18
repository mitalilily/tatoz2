import { useEffect, useState } from 'react';
import { chatAPI } from '../services/api';

const FALLBACK = {
  enabled: true,
  requireLogin: true,
  botName: 'AI Assistant',
  welcomeMessage: 'How can I help you today? Select a category to start.',
  placeholder: 'Type a message...',
  primaryColor: '#0f172a',
  showProductCards: true,
  escalationMessage: 'This conversation has been escalated to our team. They will review and respond.',
  quickReplies: [],
  categories: [],
  faqs: [],
};

let memoryCache = null;
let memoryCacheAt = 0;
let requestPromise = null;
const CACHE_TTL = 60 * 1000;

// Shared public chatbot config for the widget + full page. Cached for 60s so
// opening the widget never blocks on the network twice in a row.
const useChatbotConfig = ({ enabled = true } = {}) => {
  const [config, setConfig] = useState(memoryCache || FALLBACK);
  const [loading, setLoading] = useState(enabled && !memoryCache);

  useEffect(() => {
    let cancelled = false;
    if (!enabled) {
      setLoading(false);
      return undefined;
    }
    if (memoryCache && Date.now() - memoryCacheAt < CACHE_TTL) {
      setConfig(memoryCache);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    if (!requestPromise) {
      requestPromise = chatAPI.getConfig().finally(() => { requestPromise = null; });
    }
    requestPromise
      .then((res) => {
        if (cancelled) return;
        const next = { ...FALLBACK, ...(res.data?.config || {}) };
        memoryCache = next;
        memoryCacheAt = Date.now();
        setConfig(next);
      })
      .catch(() => {
        if (!cancelled && !memoryCache) setConfig(FALLBACK);
        else if (!cancelled) setConfig(memoryCache);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [enabled]);

  return { config, loading };
};

export default useChatbotConfig;
