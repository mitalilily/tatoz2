import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { newsletterAPI } from '../../../services/api';

export default function Newsletter({ data = {} }) {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const loc = useLocation();
  const onSubmit = async (e) => {
    e.preventDefault();
    if (!email) return;
    setSubmitting(true); setError('');
    try {
      await newsletterAPI.subscribe(email, loc.pathname);
      setDone(true); setEmail('');
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed');
    } finally {
      setSubmitting(false);
    }
  };
  const wrap = data.style === 'wide'
    ? 'bg-gray-900 text-white py-10 px-6 rounded-2xl'
    : data.style === 'inline'
    ? 'py-4'
    : 'bg-gradient-to-br from-indigo-600 to-purple-600 text-white py-10 px-6 rounded-2xl';
  return (
    <section className="container mx-auto px-4">
      <div className={wrap}>
        <div className="max-w-xl mx-auto text-center">
          {data.heading && <h2 className={`text-2xl md:text-3xl font-bold mb-2 ${data.style === 'inline' ? 'text-gray-900' : ''}`}>{data.heading}</h2>}
          {data.subheading && <p className={`mb-5 ${data.style === 'inline' ? 'text-gray-600' : 'opacity-90'}`}>{data.subheading}</p>}
          {done ? (
            <div className={`text-sm font-semibold ${data.style === 'inline' ? 'text-green-700' : ''}`}>{data.successMessage}</div>
          ) : (
            <form onSubmit={onSubmit} className="flex flex-col sm:flex-row gap-2 max-w-md mx-auto">
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder={data.placeholder} className="flex-1 px-4 py-3 rounded-lg text-gray-900 border border-gray-200" />
              <button type="submit" disabled={submitting} className={`px-5 py-3 rounded-lg font-semibold ${data.style === 'inline' ? 'bg-gray-900 text-white' : 'bg-white text-gray-900'} disabled:opacity-60`}>{submitting ? '…' : data.buttonLabel}</button>
            </form>
          )}
          {error && <div className="mt-3 text-xs text-red-200">{error}</div>}
        </div>
      </div>
    </section>
  );
}
