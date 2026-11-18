import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { legalAPI } from '../../services/api';
import SEO from '../../components/common/SEO';
import Loader from '../../components/common/Loader';

const SLUGS = {
 'returns-refunds': { title: 'Returns & Refunds', description: 'Our returns and refunds policy' },
 'faq': { title: 'FAQ', description: 'Frequently asked questions' },
 'privacy-policy': { title: 'Privacy Policy', description: 'How we handle your data' },
 'terms-of-service': { title: 'Terms of Service', description: 'Terms and conditions of use' },
 'shipping-policy': { title: 'Shipping Policy', description: 'Shipping timelines, charges, and delivery details' },
};

const LegalPage = () => {
 const { slug } = useParams();
 const [page, setPage] = useState(null);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState('');

 const meta = SLUGS[slug] || { title: 'Legal', description: '' };

 useEffect(() => {
 const fetchPage = async () => {
 setLoading(true);
 setError('');
 try {
 const res = await legalAPI.getPage(slug);
 setPage(res.data.page);
 } catch {
 setError('Page not found or unavailable.');
 } finally {
 setLoading(false);
 }
 };
 fetchPage();
 }, [slug]);

 if (loading) return <div className="page-container py-16"><Loader /></div>;

 if (error) {
 return (
 <div className="page-container py-16 text-center animate-fade-in">
 <SEO title={meta.title} description={meta.description} />
 <h1 className="text-2xl font-bold text-gray-900 mb-2">{meta.title}</h1>
 <p className="text-gray-500">{error}</p>
 </div>
 );
 }

 const sanitizedContent = DOMPurify.sanitize(
 page.content || '<p class="text-gray-400 italic">Content coming soon.</p>'
 );

 return (
 <div className="page-container py-6 sm:py-8 animate-fade-in">
 <SEO title={page.title} description={meta.description} />
 <div className="max-w-3xl mx-auto">
 <h1 className="break-anywhere text-2xl font-bold text-gray-900 mb-2 sm:text-3xl">{page.title}</h1>
 <p className="text-sm text-gray-400 mb-8">
 Last updated: {new Date(page.updatedAt).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}
 </p>
 <div
 className="prose prose-gray max-w-none prose-headings:font-semibold prose-a:text-primary-600 prose-li:marker:text-primary-500"
 dangerouslySetInnerHTML={{ __html: sanitizedContent }}
 />
 </div>
 </div>
 );
};

export default LegalPage;
