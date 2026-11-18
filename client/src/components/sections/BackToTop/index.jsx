import { useState, useEffect } from 'react';
import { ArrowUp } from 'lucide-react';

export default function BackToTop({ data = {} }) {
  const [visible, setVisible] = useState(false);
  const scrollDepth = data.scrollDepth || 300;

  useEffect(() => {
    const toggle = () => setVisible(window.scrollY > scrollDepth);
    window.addEventListener('scroll', toggle);
    return () => window.removeEventListener('scroll', toggle);
  }, [scrollDepth]);

  if (!visible) return null;

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className="fixed bottom-6 right-6 z-50 w-12 h-12 bg-gray-800 text-white rounded-full shadow-lg hover:bg-gray-900 flex items-center justify-center transition"
      aria-label="Back to top"
    >
      <ArrowUp size={20} />
    </button>
  );
}