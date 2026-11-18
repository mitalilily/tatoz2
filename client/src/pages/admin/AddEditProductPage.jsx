import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import { Bot, Upload, ImageIcon, Sparkles, Eye, Save, ArrowLeft, X, Plus, CheckCircle, Tag, Info, Layers, Trash2, GripVertical, Code, GalleryHorizontal, AlertCircle, BarChart3 } from 'lucide-react';
import { productAPI, categoryAPI, brandAPI, vendorAPI, aiAPI } from '../../services/api';
import toast from 'react-hot-toast';
import Loader from '../../components/common/Loader';
import Toggle from '../../components/common/Toggle';
import { useSEO } from '../../context/SEOContext';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { PLATFORM_NAME } from '../../constants/branding';
import { buildCategoryTree, flattenCategoryTree, categoryPath } from '../../utils/categoryTree';

const QUILL_MODULES = {
  toolbar: [
    [{ header: [2, 3, 4, false] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ color: [] }, { background: [] }],
    [{ list: 'ordered' }, { list: 'bullet' }],
    [{ indent: '-1' }, { indent: '+1' }],
    ['blockquote', 'code-block'],
    ['link', 'image'],
    ['clean'],
  ],
};

const QUILL_FORMATS = [
  'header', 'bold', 'italic', 'underline', 'strike',
  'color', 'background', 'list', 'indent',
  'blockquote', 'code-block', 'link', 'image',
];

// Returns true if the string is a full HTML document or contains tags Quill will mangle
const isRawHTML = (v) => {
  if (!v) return false;
  const t = v.trimStart();
  return t.startsWith('<!DOCTYPE') || t.startsWith('<html') || t.includes('<style') || t.includes('<script');
};

const DescriptionEditor = ({ value, onChange }) => {
  // Preserve support for existing HTML descriptions while making AI output easy
  // to review and edit before the product is saved.
  const [htmlMode, setHtmlMode] = useState(() => isRawHTML(value));

  useEffect(() => {
    if (isRawHTML(value)) setHtmlMode(true);
  }, [value]);

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-sm font-medium text-gray-700">
          <span>Product Detail Description <span className="text-red-500">*</span></span>
          <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-700">AI assisted</span>
        </label>
        <button
          type="button"
          onClick={() => setHtmlMode(m => !m)}
          className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition-colors ${htmlMode ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'}`}
        >
          <Code size={12} />{htmlMode ? 'Rich Text' : 'HTML'}
        </button>
      </div>
      <p className="mb-2 text-xs text-gray-500">AI drafts safe HTML product copy here. Review and edit it before saving.</p>
      {htmlMode ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          rows={14}
          className="input resize-y font-mono text-xs leading-relaxed"
          placeholder="Paste or write HTML here..."
        />
      ) : (
        <div className="rounded-xl overflow-hidden border border-gray-200">
          <ReactQuill
            theme="snow"
            value={value}
            onChange={onChange}
            modules={QUILL_MODULES}
            formats={QUILL_FORMATS}
            placeholder="Write detailed product description..."
            style={{ minHeight: 200 }}
          />
        </div>
      )}
    </div>
  );
};

const TABS = [
 { id: 'details', label: 'Product Details', icon: Tag },
 { id: 'cro', label: 'CRO', icon: BarChart3 },
 { id: 'variants', label: 'Variants', icon: Layers },
 { id: 'ai', label: 'AI Analyze', icon: Bot },
 { id: 'seo', label: 'SEO & Meta', icon: Eye },
 { id: 'settings', label: 'Settings', icon: Info },
];

const AI_PROGRESS_STAGES = [
 { label: 'Images received', doneAt: 12, icon: '01' },
 { label: 'Images uploaded securely', doneAt: 32, icon: '02' },
 { label: 'Product angles analysed', doneAt: 67, icon: '03' },
 { label: 'Description, CRO & SEO drafted', doneAt: 72, icon: '04' },
 { label: 'Attributes and tags polished', doneAt: 98, icon: '05' },
 { label: 'Final checks complete', doneAt: 100, icon: '06' },
];

const PRESET_VARIANTS = [
 { name: 'Size', options: ['XS', 'S', 'M', 'L', 'XL', 'XXL'] },
 { name: 'Shoe Size', options: ['6', '7', '8', '9', '10', '11', '12'] },
 { name: 'Color', options: [] },
 { name: 'Material', options: ['Cotton', 'Polyester', 'Silk', 'Linen', 'Wool', 'Denim'] },
 { name: 'Pattern', options: ['Solid', 'Striped', 'Checked', 'Printed', 'Floral'] },
 { name: 'Fit', options: ['Regular', 'Slim', 'Loose', 'Oversized'] },
 { name: 'Length', options: ['Short', 'Knee-length', 'Midi', 'Full Length'] },
 { name: 'Storage', options: ['64GB', '128GB', '256GB', '512GB', '1TB'] },
 { name: 'RAM', options: ['4GB', '8GB', '16GB', '32GB'] },
];

const emptyCRO = {
 promotionalMessage: '',
 customRating: { enabled: false, value: 5, reviewCount: 0, summary: '' },
 reasonsToBuy: ['', '', '', ''],
 socialProof: { enabled: false, period: '24h', count: 0, min: 0, max: 0, customLabel: '' },
 stockDisplay: { enabled: false, value: 0, min: 0, max: 0 },
 soldDisplay: { enabled: false, count: 0, min: 0, max: 0, label: 'sold recently' },
 visitorDisplay: { enabled: false, count: 0, min: 0, max: 0 },
 etaText: '',
 benefits: [],
 testimonialReviews: [],
 faqs: [],
};

const normalizeCRO = (cro = {}) => ({
 ...emptyCRO,
 ...cro,
 customRating: { ...emptyCRO.customRating, ...(cro.customRating || {}) },
 socialProof: { ...emptyCRO.socialProof, ...(cro.socialProof || {}) },
 stockDisplay: { ...emptyCRO.stockDisplay, ...(cro.stockDisplay || {}) },
 soldDisplay: { ...emptyCRO.soldDisplay, ...(cro.soldDisplay || {}) },
 visitorDisplay: { ...emptyCRO.visitorDisplay, ...(cro.visitorDisplay || {}) },
 reasonsToBuy: [...(cro.reasonsToBuy || []), '', '', '', ''].slice(0, 4),
 benefits: cro.benefits || [],
 testimonialReviews: cro.testimonialReviews || [],
 faqs: cro.faqs || [],
});

const emptyForm = {
 title: '', description: '', shortDescription: '', price: '', comparePrice: '',
 discount: 0, category: '', brand: '', sku: '', barcode: '', hsnCode: '', gstRate: '', costPrice: '', wholesalePrice: '', stock: 0, lowStockThreshold: 10,
 variantType: 'simple', productKind: 'physical', lifecycleStatus: 'active',
 tags: [], isActive: true, isFeatured: false, isFlashDeal: false, flashDealExpiry: '',
 seo: {
  metaTitle: '', metaDescription: '', keywords: [], altText: '', slug: '',
  canonical: '', focusKeyword: '', robots: 'index, follow',
  ogTitle: '', ogDescription: '', ogImage: '',
 },
 attributes: { color: [], material: '', features: [] },
 variants: [], videos: [], specifications: [],
 aiGenerated: false, aiConfidenceScore: 0,
 bulkOrderEnabled: false, bulkOrderTiers: [],
 weight: '', dimensions: { length: '', width: '', height: '' },
 cro: emptyCRO,
};

const CS = '₹';
const PRODUCT_TITLE_SPECIAL_CHARACTER_RE = /[@#$%]/;
const PRODUCT_TITLE_EMOJI_RE = /\p{Extended_Pictographic}/u;
const MAX_PRODUCT_NUMBER = 1000000000;

const calculateDiscount = (mrp, sellingPrice) => {
 const original = Number(mrp) || 0;
 const sale = Number(sellingPrice) || 0;
 if (!original || !sale || sale >= original) return 0;
 return Math.round(((original - sale) / original) * 10000) / 100;
};

const priceFromDiscount = (mrp, discount) => {
 const original = Number(mrp) || 0;
 const percent = Number(discount) || 0;
 if (!original) return '';
 return (original * (1 - percent / 100)).toFixed(2);
};

const CROEditor = ({ cro, setCROField, setCRONested, updateCROArray, addCROArray, removeCROArray }) => {
 const current = cro || emptyCRO;
 const reasons = [...(current.reasonsToBuy || []), '', '', '', ''].slice(0, 4);
 const benefits = current.benefits || [];
 const testimonials = current.testimonialReviews || [];
 const faqs = current.faqs || [];

 return (
  <div className="space-y-5" data-testid="product-cro-editor">
   <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4">
    <h2 className="flex items-center gap-2 font-bold text-indigo-950"><BarChart3 size={19} className="text-indigo-600" />Conversion Rate Optimisation</h2>
    <p className="mt-1 text-xs leading-5 text-indigo-800">Control the merchandising copy shown on this product page. CRO values are static display values and never change real inventory, orders, or review records.</p>
   </div>

   <section className="space-y-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
    <div><h3 className="font-bold text-gray-900">Above-the-fold CRO</h3><p className="mt-0.5 text-xs text-gray-500">These fields appear in the sticky purchase panel.</p></div>
    <div>
     <label className="mb-1.5 block text-sm font-medium text-gray-700">Promotional message</label>
     <input value={current.promotionalMessage || ''} maxLength={180} onChange={e => setCROField('promotionalMessage', e.target.value)} className="input" placeholder="Limited-time launch offer — free delivery today" />
    </div>
    <div className="rounded-xl border border-gray-200 p-3">
     <div className="flex items-center justify-between gap-3">
      <div><p className="text-sm font-semibold text-gray-800">Custom rating and review count</p><p className="text-xs text-gray-500">When enabled, this replaces the live product rating on the storefront.</p></div>
      <Toggle checked={!!current.customRating?.enabled} onChange={() => setCRONested('customRating', 'enabled', !current.customRating?.enabled)} aria-label="Use custom rating" />
     </div>
     {current.customRating?.enabled && <div className="mt-3 grid gap-3 sm:grid-cols-3">
      <label className="text-xs font-semibold text-gray-600">Stars (0–5)<input type="number" min="0" max="5" step="0.1" value={current.customRating.value ?? 5} onChange={e => setCRONested('customRating', 'value', e.target.value)} className="input mt-1" /></label>
      <label className="text-xs font-semibold text-gray-600">Review count<input type="number" min="0" value={current.customRating.reviewCount ?? 0} onChange={e => setCRONested('customRating', 'reviewCount', e.target.value)} className="input mt-1" /></label>
      <label className="text-xs font-semibold text-gray-600">Review label<input value={current.customRating.summary || ''} maxLength={160} onChange={e => setCRONested('customRating', 'summary', e.target.value)} className="input mt-1" placeholder="Loved by verified buyers" /></label>
     </div>}
    </div>
   </section>

   <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
    <div className="mb-3"><h3 className="font-bold text-gray-900">Four reasons to buy</h3><p className="mt-0.5 text-xs text-gray-500">Keep these short, specific, and benefit-led. The heading below is the storefront section title.</p></div>
    <label className="mb-3 block text-xs font-semibold text-gray-600">Section heading<input value={current.reasonsTitle || ''} maxLength={80} onChange={e => setCROField('reasonsTitle', e.target.value)} className="input mt-1" placeholder="Why you’ll love it" /></label>
    <div className="grid gap-3 sm:grid-cols-2">
     {reasons.map((reason, index) => <div key={index} className="flex items-center gap-2"><span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-bold text-indigo-600">{index + 1}</span><input value={reason || ''} maxLength={180} onChange={e => updateCROArray('reasonsToBuy', index, e.target.value)} className="input" placeholder={`Reason ${index + 1}`} /></div>)}
    </div>
   </section>

   <section className="space-y-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
    <div><h3 className="font-bold text-gray-900">Live urgency and activity signals</h3><p className="mt-0.5 text-xs text-gray-500">Enable only the signals you want shoppers to see. Set a Min–Max range: sales signals slowly climb inside it, stock counts down toward Min. Keep Max at 0 for a fixed number.</p></div>
    <div className="rounded-xl border border-gray-200 p-3">
     <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-gray-800">Sold in a recent period</p><p className="text-xs text-gray-500">Shoppers see a number that slowly climbs from Min to Max.</p></div><Toggle checked={!!current.socialProof?.enabled} onChange={() => setCRONested('socialProof', 'enabled', !current.socialProof?.enabled)} aria-label="Show recent sales" /></div>
     {current.socialProof?.enabled && <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <label className="text-xs font-semibold text-gray-600">Period<select value={current.socialProof.period || '24h'} onChange={e => setCRONested('socialProof', 'period', e.target.value)} className="input mt-1 bg-white"><option value="24h">Last 24 hours</option><option value="48h">Last 48 hours</option><option value="7d">Last 1 week</option><option value="custom">Custom label</option></select></label>
      <label className="text-xs font-semibold text-gray-600">Custom label<input value={current.socialProof.customLabel || ''} maxLength={80} onChange={e => setCRONested('socialProof', 'customLabel', e.target.value)} className="input mt-1" placeholder="sold this week" /></label>
      <label className="text-xs font-semibold text-gray-600">Min<input type="number" min="0" value={current.socialProof.min ?? 0} onChange={e => setCRONested('socialProof', 'min', e.target.value)} className="input mt-1" /></label>
      <label className="text-xs font-semibold text-gray-600">Max<input type="number" min="0" value={current.socialProof.max ?? 0} onChange={e => setCRONested('socialProof', 'max', e.target.value)} className="input mt-1" /></label>
     </div>}
    </div>
    <div className="grid gap-3 md:grid-cols-3">
     <div className="rounded-xl border border-gray-200 p-3"><div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold text-gray-800">Stock left</p><Toggle checked={!!current.stockDisplay?.enabled} onChange={() => setCRONested('stockDisplay', 'enabled', !current.stockDisplay?.enabled)} aria-label="Show stock left range" /></div>{current.stockDisplay?.enabled && <div className="mt-3 grid grid-cols-2 gap-2"><label className="text-xs font-semibold text-gray-600">Min<input type="number" min="0" value={current.stockDisplay.min ?? 0} onChange={e => setCRONested('stockDisplay', 'min', e.target.value)} className="input mt-1" placeholder="6" /></label><label className="text-xs font-semibold text-gray-600">Max<input type="number" min="0" value={current.stockDisplay.max ?? 0} onChange={e => setCRONested('stockDisplay', 'max', e.target.value)} className="input mt-1" placeholder="12" /></label></div>}</div>
     <div className="rounded-xl border border-gray-200 p-3"><div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold text-gray-800">Sold last</p><Toggle checked={!!current.soldDisplay?.enabled} onChange={() => setCRONested('soldDisplay', 'enabled', !current.soldDisplay?.enabled)} aria-label="Show sold count range" /></div>{current.soldDisplay?.enabled && <div className="mt-3 space-y-2"><div className="grid grid-cols-2 gap-2"><label className="text-xs font-semibold text-gray-600">Min<input type="number" min="0" value={current.soldDisplay.min ?? 0} onChange={e => setCRONested('soldDisplay', 'min', e.target.value)} className="input mt-1" placeholder="24" /></label><label className="text-xs font-semibold text-gray-600">Max<input type="number" min="0" value={current.soldDisplay.max ?? 0} onChange={e => setCRONested('soldDisplay', 'max', e.target.value)} className="input mt-1" placeholder="40" /></label></div><input value={current.soldDisplay.label || ''} maxLength={80} onChange={e => setCRONested('soldDisplay', 'label', e.target.value)} className="input" placeholder="sold recently" /></div>}</div>
     <div className="rounded-xl border border-gray-200 p-3"><div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold text-gray-800">Visitors live now</p><Toggle checked={!!current.visitorDisplay?.enabled} onChange={() => setCRONested('visitorDisplay', 'enabled', !current.visitorDisplay?.enabled)} aria-label="Show visitor count range" /></div>{current.visitorDisplay?.enabled && <div className="mt-3 grid grid-cols-2 gap-2"><label className="text-xs font-semibold text-gray-600">Min<input type="number" min="0" value={current.visitorDisplay.min ?? 0} onChange={e => setCRONested('visitorDisplay', 'min', e.target.value)} className="input mt-1" placeholder="12" /></label><label className="text-xs font-semibold text-gray-600">Max<input type="number" min="0" value={current.visitorDisplay.max ?? 0} onChange={e => setCRONested('visitorDisplay', 'max', e.target.value)} className="input mt-1" placeholder="24" /></label></div>}</div>
    </div>
    <div><label className="mb-1.5 block text-sm font-medium text-gray-700">Estimated arrival text</label><input value={current.etaText || ''} maxLength={120} onChange={e => setCROField('etaText', e.target.value)} className="input" placeholder="Get it by Thursday, 18 September" /></div>
   </section>

   <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
    <div className="mb-3"><h3 className="font-bold text-gray-900">Product benefits</h3><p className="mt-0.5 text-xs text-gray-500">These appear as a benefit list below the purchase panel.</p></div>
    <div className="space-y-2">
     {benefits.map((benefit, index) => <div key={index} className="flex gap-2"><input value={benefit || ''} maxLength={180} onChange={e => updateCROArray('benefits', index, e.target.value)} className="input" placeholder="Benefit or product outcome" /><button type="button" onClick={() => removeCROArray('benefits', index)} className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remove benefit ${index + 1}`}><X size={15} /></button></div>)}
     <button type="button" onClick={() => addCROArray('benefits', '')} className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600"><Plus size={14} /> Add benefit</button>
    </div>
   </section>

   <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
    <div className="mb-3 flex items-start justify-between gap-3"><div><h3 className="font-bold text-gray-900">Testimonial slider</h3><p className="mt-0.5 text-xs text-gray-500">Optional admin-authored testimonials. If empty, approved customer reviews are used.</p></div><button type="button" onClick={() => addCROArray('testimonialReviews', { name: '', rating: 5, text: '', location: '', verified: true })} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700"><Plus size={14} /> Add review</button></div>
    <div className="space-y-3">
     {testimonials.map((review, index) => <div key={index} className="rounded-xl border border-gray-200 p-3"><div className="mb-2 flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-wide text-gray-400">Testimonial {index + 1}</span><button type="button" onClick={() => removeCROArray('testimonialReviews', index)} className="text-gray-400 hover:text-red-600" aria-label={`Remove testimonial ${index + 1}`}><Trash2 size={15} /></button></div><div className="grid gap-2 sm:grid-cols-3"><input value={review.name || ''} onChange={e => updateCROArray('testimonialReviews', index, { ...review, name: e.target.value })} className="input" placeholder="Customer name" /><input value={review.location || ''} onChange={e => updateCROArray('testimonialReviews', index, { ...review, location: e.target.value })} className="input" placeholder="City or location" /><input type="number" min="0" max="5" step="0.1" value={review.rating ?? 5} onChange={e => updateCROArray('testimonialReviews', index, { ...review, rating: e.target.value })} className="input" placeholder="Rating" /></div><textarea value={review.text || ''} maxLength={500} onChange={e => updateCROArray('testimonialReviews', index, { ...review, text: e.target.value })} className="input mt-2 resize-none" rows={2} placeholder="What did this customer say?" /><label className="mt-2 flex items-center gap-2 text-xs text-gray-500"><input type="checkbox" checked={review.verified !== false} onChange={e => updateCROArray('testimonialReviews', index, { ...review, verified: e.target.checked })} /> Verified purchase label</label></div>)}
     {!testimonials.length && <p className="rounded-xl bg-gray-50 p-3 text-xs text-gray-500">No custom testimonials yet. The storefront will use approved customer reviews automatically.</p>}
    </div>
   </section>

   <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
    <div className="mb-3 flex items-start justify-between gap-3"><div><h3 className="font-bold text-gray-900">Product-specific FAQ</h3><p className="mt-0.5 text-xs text-gray-500">Answer common buying questions directly on the product page.</p></div><button type="button" onClick={() => addCROArray('faqs', { question: '', answer: '' })} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700"><Plus size={14} /> Add FAQ</button></div>
    <div className="space-y-3">
     {faqs.map((faq, index) => <div key={index} className="rounded-xl border border-gray-200 p-3"><div className="mb-2 flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-wide text-gray-400">FAQ {index + 1}</span><button type="button" onClick={() => removeCROArray('faqs', index)} className="text-gray-400 hover:text-red-600" aria-label={`Remove FAQ ${index + 1}`}><Trash2 size={15} /></button></div><input value={faq.question || ''} onChange={e => updateCROArray('faqs', index, { ...faq, question: e.target.value })} className="input" placeholder="Question" /><textarea value={faq.answer || ''} maxLength={1000} onChange={e => updateCROArray('faqs', index, { ...faq, answer: e.target.value })} className="input mt-2 resize-none" rows={3} placeholder="Answer" /></div>)}
     {!faqs.length && <p className="rounded-xl bg-gray-50 p-3 text-xs text-gray-500">No product FAQs added yet.</p>}
    </div>
   </section>
  </div>
 );
};

const AddEditProductPage = ({ mode = 'admin' }) => {
 const { id } = useParams();
 const navigate = useNavigate();
 const isEdit = !!id;
 const { seoConfig } = useSEO();
 const [activeTab, setActiveTab] = useState('details');
 const baseNav = mode === 'vendor' ? '/vendor' : '/admin';
 const [categories, setCategories] = useState([]);
 const [brands, setBrands] = useState([]);
 const [loading, setLoading] = useState(isEdit);
 const [saving, setSaving] = useState(false);
 const [analyzing, setAnalyzing] = useState(false);
 const [aiData, setAiData] = useState(null);
 const [uploadedImages, setUploadedImages] = useState([]);
 const [aiImages, setAiImages] = useState([]); // {file, preview, status: 'pending'|'uploading'|'done'|'error'}
 const [variantUploading, setVariantUploading] = useState('');
 const [aiProgress, setAiProgress] = useState(0);
 const [aiProgressMessage, setAiProgressMessage] = useState('Preparing your product images');
 const [form, setForm] = useState(emptyForm);
 const activeAIStage = AI_PROGRESS_STAGES.find(stage => aiProgress < stage.doneAt) || AI_PROGRESS_STAGES[AI_PROGRESS_STAGES.length - 1];
 const completedAIStages = AI_PROGRESS_STAGES.filter(stage => aiProgress >= stage.doneAt).length;

 const setField = (key, value) => setForm(f => ({ ...f, [key]: value }));
 const setSEO = (key, value) => setForm(f => ({ ...f, seo: { ...f.seo, [key]: value } }));
 const setCROField = (key, value) => setForm(f => ({ ...f, cro: { ...normalizeCRO(f.cro), [key]: value } }));
 const setCRONested = (group, key, value) => setForm(f => ({
  ...f,
  cro: { ...normalizeCRO(f.cro), [group]: { ...normalizeCRO(f.cro)[group], [key]: value } },
 }));
 const updateCROArray = (key, index, value) => setForm(f => {
  const list = [...(normalizeCRO(f.cro)[key] || [])];
  list[index] = value;
  return { ...f, cro: { ...normalizeCRO(f.cro), [key]: list } };
 });
 const addCROArray = (key, value) => setForm(f => ({ ...f, cro: { ...normalizeCRO(f.cro), [key]: [...(normalizeCRO(f.cro)[key] || []), value] } }));
 const removeCROArray = (key, index) => setForm(f => ({ ...f, cro: { ...normalizeCRO(f.cro), [key]: (normalizeCRO(f.cro)[key] || []).filter((_, itemIndex) => itemIndex !== index) } }));
 const canonicalBase = seoConfig?.canonicalBase || (typeof window !== 'undefined' ? window.location.origin : 'https://tatoz.com');

 const updatePricing = (key, value) => setForm(current => {
  const next = { ...current, [key]: value };
  if (key === 'comparePrice' || key === 'price') {
   next.discount = calculateDiscount(
    key === 'comparePrice' ? value : current.comparePrice,
    key === 'price' ? value : current.price,
   );
  }
  if (key === 'discount' && current.comparePrice) {
   next.price = priceFromDiscount(current.comparePrice, value);
  }
  return next;
 });

 const updateVariantOption = (variantIndex, optionIndex, changes) => setForm(current => ({
  ...current,
  variants: current.variants.map((variant, vi) => vi !== variantIndex ? variant : ({
   ...variant,
   options: variant.options.map((option, oi) => oi !== optionIndex ? option : ({ ...option, ...changes })),
  })),
 }));

 const updateVariantPricing = (variantIndex, optionIndex, key, value) => setForm(current => ({
  ...current,
  variants: current.variants.map((variant, vi) => {
   if (vi !== variantIndex) return variant;
   return {
    ...variant,
    options: variant.options.map((option, oi) => {
     if (oi !== optionIndex) return option;
     const next = { ...option, [key]: value };
     if (key === 'comparePrice' || key === 'price') {
      next.discount = calculateDiscount(
       key === 'comparePrice' ? value : option.comparePrice,
       key === 'price' ? value : option.price,
      );
     }
     if (key === 'discount' && option.comparePrice) {
      next.price = priceFromDiscount(option.comparePrice, value);
     }
     return next;
    }),
   };
  }),
 }));

 // Load categories + product data (if editing)
 useEffect(() => {
 (mode === 'vendor' ? categoryAPI.getAll() : categoryAPI.adminGetAll())
 .then(res => {
  const incoming = res.data.categories || [];
  setCategories(flattenCategoryTree(buildCategoryTree(incoming)));
 })
 .catch(() => {});

 (mode === 'vendor' ? vendorAPI.getBrands() : brandAPI.adminGetAll())
 .then(res => setBrands(mode === 'vendor' ? (res.data.data || []) : (res.data.brands || [])))
 .catch(() => setBrands([]));

 if (isEdit) {
 setLoading(true);
 (mode === 'vendor' ? productAPI.vendorGetById(id) : productAPI.adminGetById(id))
 .then(res => {
 const p = res.data.product;
 setForm({
 title: p.title || '',
 description: p.description || '',
 shortDescription: p.shortDescription || '',
 price: p.price != null ? String(p.price) : '',
 comparePrice: p.comparePrice != null ? String(p.comparePrice) : '',
 discount: calculateDiscount(p.comparePrice, p.price),
 category: p.category?._id || p.category || '',
 brand: p.brand || '',
 sku: p.sku || '',
 hsnCode: p.hsnCode || '',
 gstRate: p.gstRate != null ? String(p.gstRate) : '',
 barcode: p.barcode || '',
 costPrice: p.costPrice != null ? String(p.costPrice) : '',
 wholesalePrice: p.wholesalePrice != null ? String(p.wholesalePrice) : '',
 stock: p.stock || 0,
 lowStockThreshold: p.lowStockThreshold || 10,
 bulkOrderEnabled: Boolean(p.bulkOrderEnabled),
 bulkOrderTiers: (p.bulkOrderTiers || []).map(tier => ({
  minQuantity: tier.minQuantity != null ? String(tier.minQuantity) : '',
  price: tier.price != null ? String(tier.price) : '',
  label: tier.label || '',
 })),
 tags: p.tags || [],
 isActive: p.isActive !== undefined ? p.isActive : true,
 lifecycleStatus: p.lifecycleStatus || (p.isActive === false ? 'inactive' : 'active'),
 variantType: p.variantType || (p.variants?.length ? 'variable' : 'simple'),
 productKind: p.productKind || 'physical',
 isFeatured: p.isFeatured || false,
 isFlashDeal: p.isFlashDeal || false,
 flashDealExpiry: p.flashDealExpiry
 ? new Date(p.flashDealExpiry).toISOString().slice(0, 16)
 : '',
 seo: {
 metaTitle: p.seo?.metaTitle || '',
 metaDescription: p.seo?.metaDescription || '',
 keywords: p.seo?.keywords || [],
 altText: p.seo?.altText || '',
 slug: p.seo?.slug || p.slug || '',
 canonical: p.seo?.canonical || '',
 focusKeyword: p.seo?.focusKeyword || '',
 robots: p.seo?.robots || 'index, follow',
 ogTitle: p.seo?.ogTitle || '',
 ogDescription: p.seo?.ogDescription || '',
 ogImage: p.seo?.ogImage || '',
 },
 attributes: {
 color: p.attributes?.color || [],
 material: p.attributes?.material || '',
 features: p.attributes?.features || [],
 },
 cro: normalizeCRO(p.cro),
 variants: (p.variants || []).map(v => ({
 name: v.name || '',
 options: (v.options || []).map(o => ({
 value: o.value || '',
 stock: o.stock ?? 0,
 priceModifier: o.priceModifier ?? 0,
 price: o.price != null ? String(o.price) : (p.price != null ? String(Number(p.price) + Number(o.priceModifier || 0)) : ''),
 comparePrice: o.comparePrice != null ? String(o.comparePrice) : (p.comparePrice != null ? String(p.comparePrice) : ''),
 discount: o.discount != null ? o.discount : calculateDiscount(o.comparePrice || p.comparePrice, o.price || p.price),
 images: (o.images || []).map(img => typeof img === 'string' ? { url: img } : img),
 thumbnail: o.thumbnail || o.images?.[0]?.url || '',
 })),
 videos: p.videos || [],
 specifications: p.specifications || [],
 })),
 aiGenerated: p.aiGenerated || false,
 aiConfidenceScore: p.aiConfidenceScore || 0,
 weight: p.weight != null ? String(p.weight) : '',
 dimensions: {
 length: p.dimensions?.length != null ? String(p.dimensions.length) : '',
 width: p.dimensions?.width != null ? String(p.dimensions.width) : '',
 height: p.dimensions?.height != null ? String(p.dimensions.height) : '',
 },
 });
 if (p.images?.length) {
 setUploadedImages(p.images.map(img =>
 typeof img === 'string'
 ? { url: img }
 : { url: img.url, publicId: img.publicId }
 ));
 }
 })
 .catch(err => {
 toast.error(err.message || 'Failed to load product');
 navigate(`${baseNav}/products`);
 })
 .finally(() => setLoading(false));
 }
 }, [id, isEdit, navigate, mode]);

 // Add images to the AI queue
 const onDropAI = useCallback((acceptedFiles) => {
 if (!acceptedFiles.length) return;
 const newImages = acceptedFiles.map(file => ({
 file,
 preview: URL.createObjectURL(file),
 status: 'pending',
 }));
 setAiImages(prev => [...prev, ...newImages].slice(0, 10));
 }, []);

 const { getRootProps: getAIRootProps, getInputProps: getAIInputProps, isDragActive: isAIDragActive } = useDropzone({
 onDrop: onDropAI,
 accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp'] },
 maxFiles: 10,
 maxSize: 10 * 1024 * 1024,
 multiple: true,
 });

 // Normal product gallery upload is intentionally separate from the optional AI queue.
 const onDropGallery = useCallback((acceptedFiles) => {
  if (!acceptedFiles.length) return;
  const newImages = acceptedFiles.map(file => ({
   file,
   url: URL.createObjectURL(file),
  }));
  setUploadedImages(prev => [...prev, ...newImages].slice(0, 20));
 }, []);

 const { getRootProps: getGalleryRootProps, getInputProps: getGalleryInputProps, isDragActive: isGalleryDragActive } = useDropzone({
  onDrop: onDropGallery,
  accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp'] },
  maxFiles: 20,
  maxSize: 10 * 1024 * 1024,
  multiple: true,
 });

 const handleAIAnalyze = useCallback(async () => {
 if (!aiImages.length) return;
 setAnalyzing(true);
 setAiProgress(2);
 setAiProgressMessage('Preparing your product images');
 const analysisId = window.crypto?.randomUUID?.() || `ai-${Date.now()}-${Math.random().toString(36).slice(2)}`;
 let progressTimer;
 try {
 const formData = new FormData();
 formData.append('analysisId', analysisId);
 aiImages.forEach(img => formData.append('images', img.file));
  progressTimer = window.setInterval(async () => {
   try {
    const progressResponse = await aiAPI.getAnalyzeProgress(analysisId);
    const progress = progressResponse.data || {};
    if (typeof progress.progress === 'number') setAiProgress(current => Math.max(current, Math.min(100, progress.progress)));
    if (progress.message) setAiProgressMessage(progress.message);
   } catch (error) {
    // The POST may win the race before the in-memory progress entry exists.
    // Keep polling quietly; the main request remains the source of truth.
    if (error.response?.status && error.response.status !== 404) console.warn('AI progress polling failed', error);
   }
  }, 500);
 const res = await aiAPI.analyzeImage(formData, (e) => {
 if (e.total) {
  setAiProgress(current => Math.max(current, Math.min(18, Math.round((e.loaded / e.total) * 18))));
 }
 });
 const { content = {}, analysis = {}, images: savedImages } = res.data;
 setAiData({ analysis, confidence: analysis.confidenceScore });
 setAiProgressMessage('Analysis complete — review the generated listing');
 setForm(f => ({
 ...f,
 title: content.title || f.title,
 description: content.description || f.description,
 shortDescription: content.shortDescription || f.shortDescription,
 brand: content.brand || analysis.brand || f.brand,
 tags: content.tags || f.tags,
 seo: {
 metaTitle: content.seo?.metaTitle || f.seo.metaTitle,
 metaDescription: content.seo?.metaDescription || f.seo.metaDescription,
 keywords: content.seo?.keywords || f.seo.keywords,
 altText: content.seo?.altText || f.seo.altText,
 slug: content.seo?.slug || f.seo.slug,
 canonical: content.seo?.canonical || f.seo.canonical,
 focusKeyword: content.seo?.focusKeyword || f.seo.focusKeyword,
 robots: content.seo?.robots || f.seo.robots,
 ogTitle: content.seo?.ogTitle || f.seo.ogTitle,
 ogDescription: content.seo?.ogDescription || f.seo.ogDescription,
 ogImage: content.seo?.ogImage || f.seo.ogImage,
 },
 attributes: {
 color: analysis.colors || [],
 material: analysis.material || '',
 features: content.bulletPoints || content.attributes?.features || [],
 },
 cro: content.cro ? normalizeCRO({ ...f.cro, ...content.cro }) : f.cro,
 price: content.suggestedPrice || f.price,
 aiGenerated: true,
 aiConfidenceScore: analysis.confidenceScore || 75,
 }));
 // Add all AI-saved images to the product image gallery
 if (savedImages?.length) {
 setUploadedImages(prev => {
 const existing = prev.filter(i => !i.aiAdded);
 const fresh = savedImages.map(s => ({ url: s.url, publicId: s.filename, aiAdded: true }));
 return [...fresh, ...existing];
 });
 }
 setAiProgress(100);
 toast.success(`✨ AI analysed ${aiImages.length} image${aiImages.length > 1 ? 's' : ''} and prepared the description, CRO and SEO fields. Review before saving.`);
 setActiveTab('details');
 } catch (err) {
      setAiProgress(0);
      setAiProgressMessage('Analysis could not be completed');
      toast.error(err.message || 'AI analysis failed. Check the server AI configuration.');
 } finally {
 if (progressTimer) window.clearInterval(progressTimer);
 setAnalyzing(false);
 }
 }, [aiImages]);

 const handleUploadImages = async () => {
 const toUpload = uploadedImages.filter(i => i.file);
 if (!toUpload.length) return uploadedImages;
 const formData = new FormData();
 toUpload.forEach(i => formData.append('images', i.file));
 try {
 const res = mode === 'vendor' ? await productAPI.vendorUpload(formData) : await productAPI.upload(formData);
 const cloudImages = res.data.images;
 const existing = uploadedImages.filter(i => !i.file);
 const merged = [...existing, ...cloudImages];
 setUploadedImages(merged);
 return merged;
 } catch {
 return uploadedImages;
 }
 };

 const updateBulkTier = (index, key, value) => setForm(current => ({
  ...current,
  bulkOrderTiers: current.bulkOrderTiers.map((tier, tierIndex) => (
   tierIndex === index ? { ...tier, [key]: value } : tier
  )),
 }));

 const addBulkTier = () => setForm(current => ({
  ...current,
  bulkOrderTiers: [...current.bulkOrderTiers, { minQuantity: '', price: '', label: '' }],
 }));

 const removeBulkTier = (index) => setForm(current => ({
  ...current,
  bulkOrderTiers: current.bulkOrderTiers.filter((_, tierIndex) => tierIndex !== index),
 }));

 const handleVariantImageUpload = async (variantIndex, optionIndex, files) => {
  const filesArray = [...(files || [])];
  if (!filesArray.length) return;
  const uploadKey = `${variantIndex}-${optionIndex}`;
  setVariantUploading(uploadKey);
  const formData = new FormData();
  filesArray.forEach(file => formData.append('images', file));
  try {
   const res = mode === 'vendor' ? await productAPI.vendorUpload(formData) : await productAPI.upload(formData);
   const uploaded = res.data.images || [];
   setForm(current => ({
    ...current,
    variants: current.variants.map((variant, vi) => vi !== variantIndex ? variant : ({
     ...variant,
     options: variant.options.map((option, oi) => oi !== optionIndex ? option : ({
      ...option,
      images: [...(option.images || []), ...uploaded],
      thumbnail: option.thumbnail || uploaded[0]?.url || '',
     })),
    })),
   }));
   toast.success('Variant images uploaded');
  } catch (err) {
   toast.error(err.message || 'Variant image upload failed');
  } finally {
   setVariantUploading('');
  }
 };

 const handleSave = async (lifecycleStatus = 'active') => {
 const title = String(form.title || '').trim();
 const shortDescription = String(form.shortDescription || '').trim();
 if (!title || !form.price || !form.category || !form.description.trim()) {
  toast.error('Title, Selling Price, Category, and Description are required');
  setActiveTab('details');
  return;
 }
 if (title.length > 200 || PRODUCT_TITLE_SPECIAL_CHARACTER_RE.test(title) || PRODUCT_TITLE_EMOJI_RE.test(title) || /<[^>]*>/.test(title)) {
  toast.error('Product title must be 200 characters or fewer and use plain supported text');
  setActiveTab('details');
  return;
 }
 if (shortDescription.length > 500) {
  toast.error('Short description must be 500 characters or fewer');
  setActiveTab('details');
  return;
 }
 const numericFields = [
  ['Selling Price', form.price, 0], ['MRP', form.comparePrice, 0], ['Cost Price', form.costPrice, 0],
  ['Wholesale Price', form.wholesalePrice, 0], ['Discount', form.discount, 0], ['Stock Quantity', form.stock, 0],
  ['Low Stock Alert', form.lowStockThreshold, 0],
 ];
 for (const [label, rawValue, min] of numericFields) {
  if (rawValue === '' || rawValue === null || rawValue === undefined) continue;
  const value = Number(rawValue);
  const integer = ['Stock Quantity', 'Low Stock Alert'].includes(label);
  if (!Number.isFinite(value) || value < min || value > (label === 'Discount' ? 100 : MAX_PRODUCT_NUMBER) || (integer && (!Number.isSafeInteger(value) || !Number.isInteger(value)))) {
   toast.error(`${label} is outside the supported range`);
   setActiveTab('details');
   return;
  }
 }
 const rate = form.gstRate === '' || form.gstRate == null ? null : Number(form.gstRate);
 if (rate !== null && (!Number.isFinite(rate) || rate < 0 || rate > 100)) {
  toast.error('GST rate must be between 0 and 100');
  setActiveTab('details');
  return;
 }
 if (form.hsnCode && !/^[A-Za-z0-9][A-Za-z0-9-]{0,19}$/.test(String(form.hsnCode).trim())) {
  toast.error('HSN code can contain only letters, numbers and hyphens');
  setActiveTab('details');
  return;
 }
 if (form.bulkOrderEnabled) {
  const tiers = (form.bulkOrderTiers || []).filter(tier => tier.minQuantity !== '' || tier.price !== '');
  const quantities = tiers.map(tier => Number(tier.minQuantity));
  const sellingPrice = Number(form.price);
  if (!tiers.length || tiers.some(tier => !Number.isSafeInteger(Number(tier.minQuantity)) || Number(tier.minQuantity) < 1 || !Number.isFinite(Number(tier.price)) || Number(tier.price) <= 0 || Number(tier.price) > MAX_PRODUCT_NUMBER || Number(tier.price) >= sellingPrice)) {
   toast.error('Add at least one valid bulk-order tier with quantity and price');
   setActiveTab('details');
   return;
 }
  if (new Set(quantities).size !== quantities.length) {
   toast.error('Bulk-order tier quantities must be unique');
  setActiveTab('details');
  return;
  }
  const sortedTierPrices = [...tiers].sort((left, right) => Number(left.minQuantity) - Number(right.minQuantity)).map(tier => Number(tier.price));
  if (sortedTierPrices.some((price, index) => index > 0 && price >= sortedTierPrices[index - 1])) {
   toast.error('Bulk-order prices must decrease as quantity increases');
   setActiveTab('details');
   return;
  }
 }
 setSaving(true);
 try {
 const finalImages = await handleUploadImages();
 const productData = {
 ...form,
 price: parseFloat(form.price),
 comparePrice: form.comparePrice ? parseFloat(form.comparePrice) : undefined,
 discount: calculateDiscount(form.comparePrice, form.price),
 hsnCode: String(form.hsnCode || '').trim(),
 barcode: String(form.barcode || '').trim(),
 costPrice: form.costPrice === '' || form.costPrice == null ? 0 : Number(form.costPrice),
 wholesalePrice: form.wholesalePrice === '' || form.wholesalePrice == null ? undefined : Number(form.wholesalePrice),
 bulkOrderEnabled: Boolean(form.bulkOrderEnabled),
 bulkOrderTiers: (form.bulkOrderTiers || [])
  .filter(tier => tier.minQuantity !== '' || tier.price !== '')
  .map(tier => ({ minQuantity: Number(tier.minQuantity), price: Number(tier.price), label: String(tier.label || '').trim() })),
 gstRate: form.gstRate === '' || form.gstRate == null ? undefined : Number(form.gstRate),
 stock: parseInt(form.stock) || 0,
 variantType: form.variantType || ((form.variants || []).length ? 'variable' : 'simple'),
 productKind: form.productKind || 'physical',
 lifecycleStatus,
 slug: form.seo.slug || undefined,
 variants: (form.variants || []).map(variant => ({
  ...variant,
  options: (variant.options || []).map(option => ({
   ...option,
   stock: Number(option.stock) || 0,
   price: option.price === '' || option.price == null ? undefined : Number(option.price),
   comparePrice: option.comparePrice === '' || option.comparePrice == null ? undefined : Number(option.comparePrice),
   discount: calculateDiscount(option.comparePrice, option.price),
   priceModifier: Number(option.priceModifier) || 0,
   images: option.images || [],
   thumbnail: option.thumbnail || option.images?.[0]?.url || '',
  })),
 })),
 images: finalImages.map(i => ({
 url: i.url,
 alt: form.seo.altText || form.title,
 publicId: i.publicId || '',
 })),
 thumbnail: finalImages[0]?.url,
 isActive: lifecycleStatus === 'active',
 };
 if (isEdit) {
 if (mode === 'vendor') await productAPI.vendorUpdate(id, productData);
 else await productAPI.update(id, productData);
 toast.success('Product updated successfully!');
 } else {
 if (mode === 'vendor') await productAPI.vendorCreate(productData);
 else await productAPI.create(productData);
 toast.success('Product created successfully!');
 }
 navigate(`${baseNav}/products`);
 } catch (err) {
 toast.error(err.message || 'Failed to save product');
 } finally {
 setSaving(false);
 }
 };

 const selectedCategoryPath = categoryPath(form.category, categories);
 const categoryChildren = parentId => categories.filter(category => {
  const currentParent = category.parent?._id || category.parent;
  return parentId ? String(currentParent || '') === String(parentId) : !currentParent;
 });
 const selectCategoryLevel = (depth, value) => {
  if (value) setField('category', value);
  else setField('category', depth > 0 ? selectedCategoryPath[depth - 1]?._id || '' : '');
 };

 const TagInput = ({ tags, onChange, placeholder }) => {
 const [input, setInput] = useState('');
 const addTag = () => {
 const val = input.trim();
 if (val && !tags.includes(val)) {
 onChange([...tags, val]);
 setInput('');
 }
 };
 return (
 <div className="border border-gray-200 rounded-xl p-3 focus-within:ring-2 focus-within:ring-primary-500 bg-white">
 <div className="flex flex-wrap gap-2 mb-2">
 {tags.map((tag, i) => (
 <span key={i} className="inline-flex items-center gap-1 bg-primary-100 text-primary-700 text-xs px-2.5 py-1 rounded-full">
 {tag}
 <button type="button" onClick={() => onChange(tags.filter((_, idx) => idx !== i))}><X size={10} /></button>
 </span>
 ))}
 </div>
 <div className="flex gap-2">
 <input
 value={input}
 onChange={e => setInput(e.target.value)}
 onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
 className="flex-1 text-sm outline-none bg-transparent"
 placeholder={placeholder || 'Add and press Enter...'}
 />
 <button type="button" onClick={addTag} className="text-primary-600 hover:text-primary-700">
 <Plus size={16} />
 </button>
 </div>
 </div>
 );
 };

 if (loading) {
 return (
 <div className="flex items-center justify-center min-h-[400px]">
 <Loader size="lg" />
 </div>
 );
 }

 return (
 <div className="space-y-4">
 {/* Header */}
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-3">
 <button
 onClick={() => navigate(`${baseNav}/products`)}
 className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
 >
 <ArrowLeft size={20} className="text-gray-600" />
 </button>
 <div>
 <h1 className="text-xl font-bold text-gray-900">
 {isEdit ? 'Edit Product' : 'Add New Product'}
 </h1>
 {aiData && (
 <div className="flex items-center gap-2 mt-0.5">
 <Bot size={14} className="text-green-600" />
 <span className="text-xs text-green-600">AI Assisted Fields • Confidence: {aiData.confidence}% • HTML description, CRO &amp; SEO ready for review</span>
 </div>
 )}
 </div>
 </div>
 {mode === 'vendor' && <div data-testid="vendor-product-form-approval-note" className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-xs leading-5 text-indigo-900"><strong>Admin approval required:</strong> this product will stay hidden from shoppers and marketplace sync until an admin approves it.</div>}
 <div className="flex gap-2">
 <button data-testid="product-save-draft" onClick={() => handleSave('draft')} disabled={saving}
 className="btn-secondary text-sm py-2.5 flex items-center gap-2">
 {saving ? <Loader size="sm" /> : <Save size={14} />}{mode === 'vendor' ? 'Submit for approval' : 'Save Draft'}
 </button>
 <button data-testid="product-publish" onClick={() => handleSave('active')} disabled={saving}
 className="btn-primary text-sm py-2.5 flex items-center gap-2">
 {saving ? <Loader size="sm" /> : <CheckCircle size={14} />}
 {mode === 'vendor' ? 'Submit for approval' : isEdit ? 'Update' : 'Publish'}
 </button>
 </div>
 </div>

 {/* Tabs */}
 <div className="flex w-full max-w-full gap-1 overflow-x-auto rounded-2xl bg-gray-100 p-1">
 {TABS.map(tab => (
 <button key={tab.id} onClick={() => setActiveTab(tab.id)}
 className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition-all ${
 activeTab === tab.id
 ? 'bg-white text-primary-600 shadow-sm'
 : 'text-gray-500 hover:text-gray-700'
 }`}>
 <tab.icon size={15} />{tab.label}
 </button>
 ))}
 </div>

 {/* Tab Content */}
 <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
 <div className="min-w-0">

 {/* DETAILS TAB */}
 {activeTab === 'details' && (
 <div className="space-y-5">
 <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
 <h2 className="font-bold text-gray-900 mb-4">Basic Information</h2>
 <div className="space-y-4">
 <div>
 <label className="text-sm font-medium text-gray-700 mb-1.5 block">
 Product Title <span className="text-red-500">*</span>
 </label>
 <input data-testid="product-title" maxLength={200} value={form.title} onChange={e => setField('title', e.target.value)}
 className="input" placeholder="Enter product title" />
 </div>
 <div>
 <label className="text-sm font-medium text-gray-700 mb-1.5 block">Short Description</label>
 <input data-testid="product-short-description" maxLength={500} value={form.shortDescription} onChange={e => setField('shortDescription', e.target.value)}
 className="input" placeholder="Brief product description (shown in listings)" />
 </div>
 <DescriptionEditor value={form.description} onChange={v => setField('description', v)} />
 <div>
 <label className="text-sm font-medium text-gray-700 mb-1.5 block">Key Features / Bullet Points</label>
 <TagInput tags={form.attributes.features || []}
 onChange={v => setForm(f => ({ ...f, attributes: { ...f.attributes, features: v } }))}
 placeholder="Add feature and press Enter..." />
 </div>
 <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
  <div>
   <h3 className="text-sm font-bold text-gray-900">Category hierarchy</h3>
   <p className="mt-0.5 text-[11px] text-gray-500">Choose the complete Menu → Submenu → Category → Subcategory path.</p>
  </div>
  <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
  {['Menu', 'Submenu', 'Category', 'Subcategory'].map((label, depth) => {
   const parentId = selectedCategoryPath[depth - 1]?._id || '';
   const options = categoryChildren(parentId);
   const value = selectedCategoryPath[depth]?._id || '';
   return <div key={label} className="min-w-0">
    <label className="mb-1.5 block text-sm font-medium text-gray-700">{label}{depth === 3 && <span className="text-red-500"> *</span>}</label>
    <select value={value} onChange={e => selectCategoryLevel(depth, e.target.value)} className="input min-w-0 bg-white" disabled={depth > 0 && !parentId}>
     <option value="">{depth > 0 && !parentId ? `Select ${['menu', 'submenu', 'category', 'subcategory'][depth - 1]} first` : `Select ${label}`}</option>
     {options.map(category => <option key={category._id} value={category._id}>{category.name}</option>)}
    </select>
   </div>;
  })}
  </div>
  <div className="w-full max-w-md">
   <label className="mb-1.5 block text-sm font-medium text-gray-700">Brand</label>
   <select data-testid="product-brand" value={form.brand} onChange={e => setField('brand', e.target.value)} className="input min-w-0 bg-white">
    <option value="">Select brand (optional)</option>
    {form.brand && !brands.some(brand => String(brand.name).toLowerCase() === String(form.brand).toLowerCase()) && (
     <option value={form.brand}>{form.brand} (legacy)</option>
    )}
    {brands.map(brand => <option key={brand._id} value={brand.name}>{brand.name}</option>)}
   </select>
  </div>
 </div>
 <div className="w-full min-w-0 rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
  <div className="flex items-center justify-between gap-3 mb-3">
   <div>
    <h3 className="text-sm font-bold text-gray-900">Catalog & fulfilment</h3>
    <p className="text-[11px] text-gray-500 mt-0.5">Define how this item is sold, fulfilled, and published.</p>
   </div>
   <span className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 shadow-sm">Server validated</span>
  </div>
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
   <label className="text-xs font-semibold text-gray-700">Product type
    <select data-testid="product-kind" value={form.productKind} onChange={e => setField('productKind', e.target.value)} className="input bg-white mt-1.5">
     <option value="physical">Physical product</option>
     <option value="digital">Digital product</option>
     <option value="service">Service</option>
     <option value="subscription">Subscription</option>
    </select>
   </label>
   <label className="text-xs font-semibold text-gray-700">Catalog shape
    <select data-testid="product-variant-type" value={form.variantType} onChange={e => setField('variantType', e.target.value)} className="input bg-white mt-1.5">
     <option value="simple">Simple product</option>
     <option value="variable">Variable product</option>
    </select>
   </label>
   <label className="text-xs font-semibold text-gray-700">Barcode
    <input data-testid="product-barcode" value={form.barcode} onChange={e => setField('barcode', e.target.value)} className="input bg-white mt-1.5" placeholder="EAN / UPC / GTIN" maxLength={80} />
   </label>
  </div>
 </div>
 <div className="grid min-w-0 gap-4 xl:grid-cols-2">
 <div className="min-w-0 rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/70 to-white p-4">
 <div className="flex items-start justify-between gap-3 mb-3">
 <div>
 <h3 className="text-sm font-bold text-gray-900">Pricing</h3>
 <p className="text-[11px] text-gray-500 mt-0.5">MRP is the original price. Selling Price is what customers pay.</p>
 </div>
 <span className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-indigo-600 shadow-sm">Auto synced</span>
 </div>
 <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
 <div>
 <label className="text-xs font-semibold text-gray-700 mb-1.5 block">MRP ({CS})</label>
 <input data-testid="product-mrp" type="number" value={form.comparePrice} onChange={e => updatePricing('comparePrice', e.target.value)}
 className="input bg-white" placeholder="Original price" min="0" max={MAX_PRODUCT_NUMBER} step="0.01" />
 </div>
 <div>
 <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Selling Price ({CS}) <span className="text-red-500">*</span></label>
 <input data-testid="product-selling-price" type="number" value={form.price} onChange={e => updatePricing('price', e.target.value)}
 className="input bg-white" placeholder="Customer price" min="0" max={MAX_PRODUCT_NUMBER} step="0.01" />
 </div>
 <div>
 <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Discount (%)</label>
 <input data-testid="product-discount" type="number" value={form.discount} onChange={e => updatePricing('discount', e.target.value)}
 className="input bg-white" min="0" max="100" step="0.01" />
 </div>
 <div>
  <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Cost price ({CS})</label>
  <input data-testid="product-cost-price" type="number" value={form.costPrice} onChange={e => setField('costPrice', e.target.value)}
   className="input bg-white" placeholder="Internal cost" min="0" max={MAX_PRODUCT_NUMBER} step="0.01" />
 </div>
 <div>
  <label className="text-xs font-semibold text-gray-700 mb-1.5 block">Wholesale ({CS})</label>
  <input data-testid="product-wholesale-price" type="number" value={form.wholesalePrice} onChange={e => setField('wholesalePrice', e.target.value)}
   className="input bg-white" placeholder="Optional" min="0" max={MAX_PRODUCT_NUMBER} step="0.01" />
 </div>
 </div>
 {Number(form.comparePrice) > Number(form.price) && (
 <div className="mt-3 rounded-xl bg-white/80 px-3 py-2 text-xs text-indigo-700 border border-indigo-100">
  Selling at <strong>{CS}{Number(form.price || 0).toFixed(2)}</strong> · Save <strong>{CS}{(Number(form.comparePrice) - Number(form.price)).toFixed(2)}</strong> · <strong>{form.discount}% off</strong>
 </div>
 )}
 </div>
 <div className="min-w-0 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4">
  <div className="flex items-start justify-between gap-3">
   <div>
    <h3 className="text-sm font-bold text-gray-900">Bulk-order pricing</h3>
    <p className="text-[11px] text-gray-500 mt-0.5">Offer a lower unit price when customers purchase a larger quantity.</p>
   </div>
   <Toggle
    checked={Boolean(form.bulkOrderEnabled)}
    onChange={() => setField('bulkOrderEnabled', !form.bulkOrderEnabled)}
    aria-label="Enable bulk-order pricing"
   />
  </div>
  {form.bulkOrderEnabled && (
   <div className="mt-4">
    <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto] gap-2 px-1 pb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 sm:grid">
     <span>Min quantity</span><span>Unit price ({CS})</span><span>Label</span><span />
    </div>
    <div className="space-y-2">
     {(form.bulkOrderTiers || []).map((tier, index) => (
      <div key={index} className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto]">
       <label className="min-w-0"><span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:hidden">Min quantity</span><input type="number" min="1" step="1" value={tier.minQuantity} onChange={e => updateBulkTier(index, 'minQuantity', e.target.value)} className="input bg-white" placeholder="10" aria-label={`Bulk tier ${index + 1} minimum quantity`} /></label>
       <label className="min-w-0"><span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:hidden">Unit price</span><input type="number" min="0.01" max={MAX_PRODUCT_NUMBER} step="0.01" value={tier.price} onChange={e => updateBulkTier(index, 'price', e.target.value)} className="input bg-white" placeholder="899" aria-label={`Bulk tier ${index + 1} price`} /></label>
       <label className="min-w-0"><span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:hidden">Label</span><input value={tier.label} onChange={e => updateBulkTier(index, 'label', e.target.value)} className="input bg-white" maxLength={80} placeholder="Wholesale pack" aria-label={`Bulk tier ${index + 1} label`} /></label>
       <button type="button" onClick={() => removeBulkTier(index)} className="p-2 text-slate-400 hover:text-red-600" aria-label={`Remove bulk tier ${index + 1}`}><Trash2 size={15} /></button>
      </div>
     ))}
    </div>
    <button type="button" onClick={addBulkTier} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800">
     <Plus size={14} /> Add price tier
    </button>
    {!form.bulkOrderTiers?.length && <p className="mt-2 text-[11px] text-amber-700">Add a tier before publishing this product.</p>}
 </div>
 )}
 </div>
 </div>
 <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
 <div>
 <label className="text-sm font-medium text-gray-700 mb-1.5 block">SKU</label>
 <input data-testid="product-sku" maxLength={80} value={form.sku} onChange={e => setField('sku', e.target.value)}
 className="input" placeholder="SKU-001" />
 </div>
 <div>
 <label className="text-sm font-medium text-gray-700 mb-1.5 block">HSN Code</label>
 <input data-testid="product-hsn-code" value={form.hsnCode} onChange={e => setField('hsnCode', e.target.value)}
 className="input" placeholder="e.g. 330499" maxLength={20} />
 </div>
 <div>
 <label className="text-sm font-medium text-gray-700 mb-1.5 block">GST Rate (%)</label>
 <input data-testid="product-gst-rate" type="number" min="0" max="100" step="0.01" value={form.gstRate}
 onChange={e => setField('gstRate', e.target.value)} className="input" placeholder="Use store default" />
 </div>
 <div>
 <label className="text-sm font-medium text-gray-700 mb-1.5 block">Stock Quantity</label>
 <input data-testid="product-stock" type="number" value={form.stock} onChange={e => setField('stock', e.target.value)}
 className="input" min="0" max={MAX_PRODUCT_NUMBER} step="1" />
 </div>
 <div>
 <label className="text-sm font-medium text-gray-700 mb-1.5 block">Low Stock Alert</label>
 <input data-testid="product-low-stock-threshold" type="number" value={form.lowStockThreshold} onChange={e => setField('lowStockThreshold', e.target.value)}
 className="input" min="0" max={MAX_PRODUCT_NUMBER} step="1" />
 </div>
 </div>
 <div className="grid min-w-0 gap-4 sm:grid-cols-2">
 <div>
 <label className="text-sm font-medium text-gray-700 mb-1.5 block">Material</label>
 <input value={form.attributes.material}
 onChange={e => setForm(f => ({ ...f, attributes: { ...f.attributes, material: e.target.value } }))}
 className="input" placeholder="e.g. Cotton, Plastic, Metal" />
 </div>
 <div>
 <label className="text-sm font-medium text-gray-700 mb-1.5 block">Tags</label>
 <TagInput tags={form.tags} onChange={v => setField('tags', v)} placeholder="Add tag and press Enter..." />
 </div>
 </div>
 </div>
 </div>

 {/* Shipping Details */}
 <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
 <h2 className="font-bold text-gray-900 mb-1">Shipping Details</h2>
 <p className="text-xs text-gray-500 mb-4">Used for Shiprocket shipment creation. Leave blank to use defaults (0.5 kg, 10×10×10 cm).</p>
 <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
 <div>
 <label className="text-sm font-medium text-gray-700 mb-1.5 block">Weight (kg)</label>
 <input type="number" step="0.01" min="0" value={form.weight}
 onChange={e => setField('weight', e.target.value)}
 className="input" placeholder="0.5" />
 </div>
 <div>
 <label className="text-sm font-medium text-gray-700 mb-1.5 block">Length (cm)</label>
 <input type="number" min="0" value={form.dimensions.length}
 onChange={e => setForm(f => ({ ...f, dimensions: { ...f.dimensions, length: e.target.value } }))}
 className="input" placeholder="10" />
 </div>
 <div>
 <label className="text-sm font-medium text-gray-700 mb-1.5 block">Width (cm)</label>
 <input type="number" min="0" value={form.dimensions.width}
 onChange={e => setForm(f => ({ ...f, dimensions: { ...f.dimensions, width: e.target.value } }))}
 className="input" placeholder="10" />
 </div>
 <div>
 <label className="text-sm font-medium text-gray-700 mb-1.5 block">Height (cm)</label>
 <input type="number" min="0" value={form.dimensions.height}
 onChange={e => setForm(f => ({ ...f, dimensions: { ...f.dimensions, height: e.target.value } }))}
 className="input" placeholder="10" />
 </div>
 </div>
 </div>
 </div>
 )}
 {/* CRO TAB */}
 {activeTab === 'cro' && (
  <CROEditor
   cro={form.cro}
   setCROField={setCROField}
   setCRONested={setCRONested}
   updateCROArray={updateCROArray}
   addCROArray={addCROArray}
   removeCROArray={removeCROArray}
  />
 )}

 {/* VARIANTS TAB */}
 {activeTab === 'variants' && (
 <div className="space-y-5">
 <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
 <div className="flex items-center justify-between mb-4">
 <div>
 <h2 className="font-bold text-gray-900">Product Variants</h2>
 <p className="text-xs text-gray-500 mt-0.5">Add size, color, material, and other options for this product</p>
 </div>
 </div>

 {/* Quick Add Presets */}
 <div className="mb-5">
 <p className="text-xs font-medium text-gray-500 mb-2">Quick add variant type:</p>
 <div className="flex flex-wrap gap-2">
 {PRESET_VARIANTS.filter(p => !form.variants.some(v => v.name === p.name)).map(preset => (
 <button
 key={preset.name}
 type="button"
 onClick={() => setField('variants', [...form.variants, {
 name: preset.name,
 options: preset.options.map(v => ({
  value: v,
  stock: 0,
  price: form.price || '',
  comparePrice: form.comparePrice || '',
  discount: calculateDiscount(form.comparePrice, form.price),
  priceModifier: 0,
  images: [],
  thumbnail: '',
 })),
 }])}
 className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
 >
 + {preset.name}
 </button>
 ))}
 </div>
 </div>

 {/* Variant Groups */}
 {form.variants.length === 0 ? (
 <div className="text-center py-10 border-2 border-dashed border-gray-200 rounded-xl">
 <Layers size={32} className="text-gray-300 mx-auto mb-2" />
 <p className="text-sm text-gray-500">No variants added yet</p>
 <p className="text-xs text-gray-400 mt-1">Use the presets above or add a custom variant</p>
 </div>
 ) : (
 <div className="space-y-4">
 {form.variants.map((variant, vi) => (
 <div key={vi} className="border border-gray-200 rounded-xl overflow-hidden">
 {/* Variant Header */}
 <div className="flex items-center justify-between bg-gray-50 px-4 py-3">
 <div className="flex items-center gap-3 flex-1">
 <GripVertical size={16} className="text-gray-400" />
 <input
 value={variant.name}
 onChange={e => {
 const updated = [...form.variants];
 updated[vi] = { ...updated[vi], name: e.target.value };
 setField('variants', updated);
 }}
 className="text-sm font-semibold bg-transparent border-none outline-none text-gray-900 flex-1"
 placeholder="Variant name (e.g. Size, Color)"
 />
 </div>
 <button
 type="button"
 onClick={() => setField('variants', form.variants.filter((_, i) => i !== vi))}
 className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
 >
 <Trash2 size={15} />
 </button>
 </div>

 {/* Options Table */}
 <div className="p-3">
 {variant.options.length > 0 && (
 <div className="grid grid-cols-[1fr_80px_100px_40px] gap-2 mb-2 px-1">
 <span className="text-[10px] uppercase tracking-wide text-gray-400 font-medium">Value</span>
 <span className="text-[10px] uppercase tracking-wide text-gray-400 font-medium">Stock</span>
 <span className="text-[10px] uppercase tracking-wide text-gray-400 font-medium">Price +/-</span>
 <span />
 </div>
 )}
 <div className="space-y-2.5">
 {variant.options.map((opt, oi) => (
 <div key={oi}>
 <div className="grid grid-cols-[1fr_80px_100px_40px] gap-2 items-center">
 <input
 value={opt.value}
 onChange={e => {
 const updated = [...form.variants];
 updated[vi] = {
 ...updated[vi],
 options: updated[vi].options.map((o, i) =>
 i === oi ? { ...o, value: e.target.value } : o
 ),
 };
 setField('variants', updated);
 }}
 className="input text-sm py-1.5"
 placeholder={`e.g. ${variant.name === 'Size' ? 'M' : variant.name === 'Color' ? 'Red' : 'Option'}`}
 />
 <input
 type="number"
 value={opt.stock}
 onChange={e => {
 const updated = [...form.variants];
 updated[vi] = {
 ...updated[vi],
 options: updated[vi].options.map((o, i) =>
 i === oi ? { ...o, stock: parseInt(e.target.value) || 0 } : o
 ),
 };
 setField('variants', updated);
 }}
 className="input text-sm py-1.5"
 min="0"
 placeholder="0"
 />
 <div className="relative">
  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">₹</span>
  <input
   type="number"
   value={opt.priceModifier}
   onChange={e => {
    const updated = [...form.variants];
    updated[vi] = {
     ...updated[vi],
     options: updated[vi].options.map((o, i) =>
      i === oi ? { ...o, priceModifier: parseFloat(e.target.value) || 0 } : o
     ),
    };
    setField('variants', updated);
   }}
   className="input text-sm py-1.5 pl-6"
   step="0.01"
   placeholder="0"
  />
 </div>
 <button
  type="button"
  onClick={() => {
   const updated = [...form.variants];
   updated[vi] = {
    ...updated[vi],
    options: updated[vi].options.filter((_, i) => i !== oi),
   };
   setField('variants', updated);
  }}
  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors justify-self-center"
 >
  <X size={14} />
 </button>
 </div>
 <div className="mt-2 rounded-xl border border-indigo-100 bg-indigo-50/40 p-2.5">
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
   <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
    MRP ({CS})
    <input type="number" value={opt.comparePrice || ''}
     onChange={e => updateVariantPricing(vi, oi, 'comparePrice', e.target.value)}
     className="input mt-1 text-xs py-1.5 bg-white" min="0" step="0.01" placeholder="Use product MRP" />
   </label>
   <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
    Selling ({CS})
    <input type="number" value={opt.price || ''}
     onChange={e => updateVariantPricing(vi, oi, 'price', e.target.value)}
     className="input mt-1 text-xs py-1.5 bg-white" min="0" step="0.01" placeholder="Use product price" />
   </label>
   <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
    Discount (%)
    <input type="number" value={opt.discount ?? 0}
     onChange={e => updateVariantPricing(vi, oi, 'discount', e.target.value)}
     className="input mt-1 text-xs py-1.5 bg-white" min="0" max="100" step="0.01" />
   </label>
  </div>
  <div className="mt-2 flex flex-wrap items-center gap-2">
   {(opt.images || []).map((image, imageIndex) => (
    <div key={`${image.url}-${imageIndex}`} className="relative h-11 w-11">
     <img src={image.url} alt={`${opt.value || 'Variant'} ${imageIndex + 1}`} className="h-full w-full rounded-lg object-cover border border-white shadow-sm" />
     <button type="button" onClick={() => updateVariantOption(vi, oi, { images: (opt.images || []).filter((_, index) => index !== imageIndex) })}
      className="absolute -right-1.5 -top-1.5 h-4 w-4 rounded-full bg-red-500 text-white flex items-center justify-center"><X size={9} /></button>
    </div>
   ))}
   <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-indigo-300 bg-white px-2.5 py-2 text-[11px] font-semibold text-indigo-600 hover:bg-indigo-50">
    <Upload size={13} />{variantUploading === `${vi}-${oi}` ? 'Uploading…' : 'Add images'}
    <input type="file" accept="image/*" multiple className="hidden" disabled={variantUploading === `${vi}-${oi}`} onChange={e => handleVariantImageUpload(vi, oi, e.target.files)} />
   </label>
   <span className="text-[10px] text-gray-500">Option-specific price & gallery</span>
  </div>
 </div>
 </div>
 ))}
 </div>
 <button
 type="button"
 onClick={() => {
 const updated = [...form.variants];
 updated[vi] = {
 ...updated[vi],
 options: [...updated[vi].options, {
  value: '', stock: 0, price: form.price || '', comparePrice: form.comparePrice || '',
  discount: calculateDiscount(form.comparePrice, form.price), priceModifier: 0, images: [], thumbnail: '',
 }],
 };
 setField('variants', updated);
 }}
 className="mt-3 flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
 >
 <Plus size={14} /> Add option
 </button>
 </div>
 </div>
 ))}
 </div>
 )}

 {/* Add Custom Variant */}
 <button
 type="button"
 onClick={() => setField('variants', [...form.variants, {
  name: '', options: [{ value: '', stock: 0, price: form.price || '', comparePrice: form.comparePrice || '',
   discount: calculateDiscount(form.comparePrice, form.price), priceModifier: 0, images: [], thumbnail: '' }],
 }])}
 className="mt-4 w-full py-2.5 border-2 border-dashed border-gray-200 rounded-xl text-sm font-medium text-gray-500 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50/50 transition-colors flex items-center justify-center gap-2"
 >
 <Plus size={16} /> Add Custom Variant
 </button>
 </div>

 {/* Variant Summary */}
 {form.variants.length > 0 && (
 <div className="bg-indigo-50 rounded-2xl p-5 border border-indigo-100">
 <h3 className="text-sm font-semibold text-indigo-900 mb-3">Variant Summary</h3>
 <div className="grid grid-cols-3 gap-3">
 <div className="bg-white rounded-xl p-3 text-center">
 <p className="text-2xl font-bold text-indigo-600">{form.variants.length}</p>
 <p className="text-xs text-gray-500">Variant Types</p>
 </div>
 <div className="bg-white rounded-xl p-3 text-center">
 <p className="text-2xl font-bold text-indigo-600">
 {form.variants.reduce((sum, v) => sum + v.options.filter(o => o.value).length, 0)}
 </p>
 <p className="text-xs text-gray-500">Total Options</p>
 </div>
 <div className="bg-white rounded-xl p-3 text-center">
 <p className="text-2xl font-bold text-indigo-600">
 {form.variants.reduce((sum, v) => sum + v.options.reduce((s, o) => s + (o.stock || 0), 0), 0)}
 </p>
 <p className="text-xs text-gray-500">Variant Stock</p>
 </div>
 </div>
 </div>
 )}
 </div>
 )}

 {/* AI TAB */}
 {activeTab === 'ai' && (
 <div className="space-y-5">
 <div className="bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 rounded-2xl p-4 border border-indigo-200">
 <h2 className="font-bold text-gray-900 mb-1 flex items-center gap-2">
 <Sparkles className="text-indigo-600" size={20} />AI Product Generator
 </h2>
 <p className="text-sm text-gray-500 mb-5">
 Upload up to 10 product images. AI analyses all angles and quickly prepares the title, short copy, features, tags, pricing suggestion, and SEO fields. The detailed product description is always written by you.
 </p>

 {/* Drop zone */}
 <div {...getAIRootProps()} className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
 isAIDragActive ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 hover:border-indigo-400 hover:bg-white/60'
 }`}>
 <input {...getAIInputProps()} />
 <GalleryHorizontal size={36} className="text-indigo-400 mx-auto mb-3" />
 <p className="font-semibold text-gray-700">{isAIDragActive ? 'Drop images here' : 'Drag & drop product images'}</p>
 <p className="text-sm text-gray-400 mt-1">or click to browse • JPG, PNG, WebP • up to 10 images • 10MB each</p>
 <p className="text-xs text-indigo-500 mt-2 font-medium">✨ Multiple angles = richer product analysis and sharper listing fields</p>
 </div>

 {/* Image preview grid */}
 {aiImages.length > 0 && (
 <div className="mt-4">
 <div className="flex items-center justify-between mb-3">
 <p className="text-sm font-semibold text-gray-700">{aiImages.length} image{aiImages.length > 1 ? 's' : ''} selected</p>
 <button type="button" onClick={() => setAiImages([])} className="text-xs text-red-500 hover:text-red-600 font-medium">Clear all</button>
 </div>
 <div className="grid grid-cols-5 gap-2">
 {aiImages.map((img, i) => (
 <div key={i} className="relative group aspect-square">
 <img src={img.preview} alt={`Image ${i + 1}`} className="w-full h-full object-cover rounded-xl border border-gray-200" />
 <button
 type="button"
 onClick={() => setAiImages(prev => prev.filter((_, idx) => idx !== i))}
 className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
 ><X size={10} /></button>
 <span className="absolute bottom-1 left-1 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded-md">#{i + 1}</span>
 </div>
 ))}
 {aiImages.length < 10 && (
 <div {...getAIRootProps()} className="aspect-square border-2 border-dashed border-gray-200 rounded-xl flex items-center justify-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-colors">
 <input {...getAIInputProps()} />
 <Plus size={20} className="text-gray-400" />
 </div>
 )}
 </div>
 </div>
 )}

 {/* Analyze button */}
 {aiImages.length > 0 && !analyzing && (
 <button type="button" onClick={handleAIAnalyze}
 className="mt-4 w-full py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold rounded-xl flex items-center justify-center gap-2 shadow-md transition-all">
 <Sparkles size={18} />
 Analyse {aiImages.length} Image{aiImages.length > 1 ? 's' : ''} &amp; Prepare Listing Fields
 </button>
 )}

 {/* Unified live progress */}
 {analyzing && (
 <div className="mt-4 overflow-hidden rounded-3xl border border-indigo-200/70 bg-gradient-to-br from-white via-indigo-50/70 to-purple-50/80 p-4 shadow-[0_18px_45px_rgba(79,70,229,0.12)]" data-testid="ai-analysis-progress">
  <div className="flex items-start justify-between gap-3">
   <div className="flex min-w-0 items-center gap-3">
    <div className="relative flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-200">
     <Sparkles size={23} className="text-white" />
     <span className="absolute -right-1 -top-1 flex gap-0.5">
      {[0, 1, 2].map(dot => <span key={dot} className="h-1.5 w-1.5 rounded-full bg-white animate-bounce" style={{ animationDelay: `${dot * 140}ms` }} />)}
     </span>
    </div>
    <div className="min-w-0">
     <p className="truncate text-base font-bold text-slate-900">{activeAIStage.label}</p>
     <p className="mt-0.5 truncate text-xs text-slate-500">{aiProgressMessage}</p>
    </div>
   </div>
   <div className="flex-shrink-0 text-right">
    <p className="text-2xl font-black tracking-tight text-indigo-600">{aiProgress}%</p>
    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">live status</p>
   </div>
  </div>

  <div className="mt-4 h-3 overflow-hidden rounded-full bg-indigo-100/80 ring-1 ring-inset ring-indigo-200/50" aria-label={`AI analysis ${aiProgress}% complete`}>
   <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-500 transition-[width] duration-300 ease-out" style={{ width: `${Math.min(100, Math.max(0, aiProgress))}%` }} />
  </div>

  <div className="mt-4 grid gap-2 sm:grid-cols-2">
   {AI_PROGRESS_STAGES.map((stage, index) => {
    const complete = aiProgress >= stage.doneAt;
    const active = !complete && (index === 0 || aiProgress >= AI_PROGRESS_STAGES[index - 1].doneAt);
    return (
     <div key={stage.label} className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-xs transition-colors ${complete ? 'bg-emerald-50/80 text-emerald-700' : active ? 'bg-white/90 font-semibold text-indigo-700 shadow-sm ring-1 ring-indigo-100' : 'text-slate-400'}`}>
      {complete ? <CheckCircle size={15} className="flex-shrink-0 text-emerald-600" /> : <span className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border text-[9px] font-bold ${active ? 'border-indigo-500 text-indigo-600' : 'border-slate-300 text-slate-400'}`}>{stage.icon}</span>}
      <span className="truncate">{stage.label}{active ? '…' : ''}</span>
     </div>
    );
   })}
  </div>
  <div className="mt-3 flex items-center justify-between gap-2 border-t border-indigo-100/80 pt-3 text-[11px] text-slate-500">
   <span>{completedAIStages}/{AI_PROGRESS_STAGES.length} stages complete · {aiImages.length} image{aiImages.length === 1 ? '' : 's'}</span>
   <span className="font-medium text-indigo-600">HTML description · CRO · full SEO</span>
  </div>
 </div>
 )}
 </div>
 {aiData && (
 <div className="bg-white rounded-2xl p-4 border border-green-200 shadow-sm">
 <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
 <CheckCircle size={18} className="text-green-500" />AI Analysis Results
 </h3>
 <div className="grid grid-cols-3 gap-2 text-sm mb-4">
 {[
 { label: 'Product Type', value: aiData.analysis?.productType },
 { label: 'Brand', value: aiData.analysis?.brand || 'Not detected' },
 { label: 'Category', value: aiData.analysis?.category },
 { label: 'Colors', value: aiData.analysis?.colors?.join(', ') || 'N/A' },
 { label: 'Material', value: aiData.analysis?.material || 'N/A' },
 { label: 'Confidence', value: `${aiData.confidence}%` },
 ].map(({ label, value }) => (
 <div key={label} className="bg-gray-50 rounded-xl p-3">
 <p className="text-xs text-gray-500">{label}</p>
 <p className="font-medium text-gray-800 mt-0.5 text-xs">{value || 'N/A'}</p>
 </div>
 ))}
 </div>
 {aiData.analysis?.imageDescriptions?.length > 0 && (
 <div className="mb-4">
 <p className="text-xs font-semibold text-gray-600 mb-2">Per-image analysis</p>
 <div className="space-y-1">
 {aiData.analysis.imageDescriptions.map((desc, i) => (
 <div key={i} className="flex items-start gap-2 text-xs text-gray-600 bg-indigo-50 rounded-lg px-3 py-1.5">
 <span className="font-bold text-indigo-500 flex-shrink-0">#{i + 1}</span>{desc}
 </div>
 ))}
 </div>
 </div>
 )}
 <div className="flex items-center gap-2 p-3 bg-green-50 rounded-xl mb-3">
 <CheckCircle size={16} className="text-green-500 flex-shrink-0" />
 <p className="text-xs text-green-700 font-medium">AI listing fields are ready, including a reviewable HTML description, CRO copy and full SEO metadata. Review everything in <strong>Product Details</strong>, <strong>CRO</strong> and <strong>SEO &amp; Meta</strong> before saving.</p>
 </div>
 <button type="button" onClick={() => setActiveTab('details')}
 className="btn-primary w-full text-sm">Review &amp; Edit Generated Content →</button>
 </div>
 )}
 </div>
 )}

 {/* SEO TAB */}
 {activeTab === 'seo' && (
 <div className="space-y-4">
 <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
 <div className="mb-4 flex items-start justify-between gap-3">
  <div><h2 className="font-bold text-gray-900">URL &amp; Indexing</h2><p className="mt-0.5 text-xs text-gray-500">Control this product's canonical URL and search engine visibility.</p></div>
  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">Per-product SEO</span>
 </div>
 <div className="grid gap-3 sm:grid-cols-2">
  <div><label className="mb-1.5 block text-xs font-semibold text-gray-700">URL Slug</label><input value={form.seo.slug} onChange={e => setSEO('slug', e.target.value)} className="input" placeholder="auto-generated" /><p className="mt-1 text-[10px] text-gray-400">{canonicalBase}/product/{form.seo.slug || 'auto-generated'}</p></div>
  <div><label className="mb-1.5 block text-xs font-semibold text-gray-700">Canonical URL</label><input value={form.seo.canonical} onChange={e => setSEO('canonical', e.target.value)} className="input" placeholder={`${canonicalBase}/product/...`} /><p className="mt-1 text-[10px] text-gray-400">Leave empty to use the default product URL.</p></div>
  <div><label className="mb-1.5 block text-xs font-semibold text-gray-700">Focus Keyword</label><input value={form.seo.focusKeyword} onChange={e => setSEO('focusKeyword', e.target.value)} className="input" placeholder="e.g. swarovski eyeglasses women" /></div>
  <div><label className="mb-1.5 block text-xs font-semibold text-gray-700">Robots Tag</label><select value={form.seo.robots || 'index, follow'} onChange={e => setSEO('robots', e.target.value)} className="input bg-white"><option value="index, follow">Index, Follow (default)</option><option value="noindex, follow">Noindex, Follow</option><option value="index, nofollow">Index, Nofollow</option><option value="noindex, nofollow">Noindex, Nofollow</option></select></div>
 </div>
 {(!form.seo.robots || form.seo.robots === 'index, follow') && <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-emerald-700"><CheckCircle size={14} /> This product will be individually indexable.</p>}
 </div>
 <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
 <h2 className="mb-4 font-bold text-gray-900">Meta Tags</h2>
 <div className="space-y-3">
 <div>
  <div className="mb-1.5 flex justify-between"><label className="text-xs font-semibold text-gray-700">Meta Title (H1)</label><span className={`text-[10px] ${(form.seo.metaTitle || '').length > 60 ? 'text-red-500' : 'text-gray-400'}`}>{(form.seo.metaTitle || '').length}/60</span></div>
  <input value={form.seo.metaTitle} maxLength={60} onChange={e => setSEO('metaTitle', e.target.value)} className="input" placeholder="SEO-optimized product title" />
 </div>
 <div>
  <div className="mb-1.5 flex justify-between"><label className="text-xs font-semibold text-gray-700">Meta Description (plain text)</label><span className={`text-[10px] ${(form.seo.metaDescription || '').length > 160 ? 'text-red-500' : 'text-gray-400'}`}>{(form.seo.metaDescription || '').length}/160</span></div>
  <textarea value={form.seo.metaDescription} maxLength={160} onChange={e => setSEO('metaDescription', e.target.value)} rows={3} className="input resize-none" placeholder="One sentence summary for search results. Aim for 150-160 characters." />
 </div>
 <div><label className="mb-1.5 block text-xs font-semibold text-gray-700">Keywords</label><TagInput tags={form.seo.keywords || []} onChange={v => setSEO('keywords', v)} placeholder="Add keyword and press Enter..." /></div>
 <div><label className="mb-1.5 block text-xs font-semibold text-gray-700">Image Alt Text</label><input value={form.seo.altText} onChange={e => setSEO('altText', e.target.value)} className="input" placeholder="Descriptive alt text for the product image" /></div>
 </div>
 <div className="mt-4 rounded-xl bg-gray-50 p-3">
  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500">SERP Preview</p>
  <div className="rounded-lg bg-white p-3 shadow-sm"><p className="line-clamp-1 text-base font-medium text-blue-600">{form.seo.metaTitle || form.title || 'Product title'}</p><p className="mt-0.5 text-[10px] text-emerald-600">{canonicalBase}/product/{form.seo.slug || 'product-name'}</p><p className="mt-1 line-clamp-2 text-xs text-gray-500">{form.seo.metaDescription || form.shortDescription || form.description?.replace(/<[^>]*>/g, '').substring(0, 160) || 'Product description preview'}</p></div>
 </div>
 </div>
 <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
  <h2 className="mb-1 font-bold text-gray-900">Open Graph (Social Media)</h2>
  <p className="mb-4 text-xs text-gray-500">Customize how this product appears when shared on social platforms.</p>
  <div className="space-y-3">
   <div><label className="mb-1.5 block text-xs font-semibold text-gray-700">OG Title</label><input value={form.seo.ogTitle} onChange={e => setSEO('ogTitle', e.target.value)} className="input" placeholder="Same as meta title if empty" /></div>
   <div><label className="mb-1.5 block text-xs font-semibold text-gray-700">OG Description</label><textarea value={form.seo.ogDescription} onChange={e => setSEO('ogDescription', e.target.value)} rows={2} className="input resize-none" placeholder="Same as meta description if empty" /></div>
   <div><label className="mb-1.5 block text-xs font-semibold text-gray-700">OG Image URL</label><input value={form.seo.ogImage} onChange={e => setSEO('ogImage', e.target.value)} className="input" placeholder="https://... (1200x630px recommended)" /></div>
  </div>
  {(form.seo.ogImage || uploadedImages[0]?.url || form.title) && <div className="mt-4 flex overflow-hidden rounded-xl border border-gray-200 bg-gray-50">{(form.seo.ogImage || uploadedImages[0]?.url) && <img src={form.seo.ogImage || uploadedImages[0]?.url} alt="Open Graph preview" className="h-24 w-32 object-cover" />}<div className="p-3"><p className="line-clamp-1 text-xs font-semibold text-gray-900">{form.seo.ogTitle || form.seo.metaTitle || form.title || 'Product title'}</p><p className="mt-1 line-clamp-2 text-[10px] text-gray-500">{form.seo.ogDescription || form.seo.metaDescription || 'Social sharing description'}</p></div></div>}
 </div>
 <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
  <div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="font-bold text-gray-900">Structured Data (Auto-Generated)</h2><p className="mt-0.5 text-xs text-gray-500">4 schemas generated for this product page.</p></div><Code size={18} className="text-indigo-500" /></div>
  {[
   { name: '@Product', description: 'Product with Offer, Reviews, Specs, Return & Shipping policies', code: { '@context': 'https://schema.org', '@type': 'Product', name: form.title || 'Product', offers: { '@type': 'Offer', price: Number(form.price) || 0, priceCurrency: 'INR' } } },
   { name: '@BreadcrumbList', description: 'Navigation trail for Google rich results', code: { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: canonicalBase }, { '@type': 'ListItem', position: 2, name: form.title || 'Product' }] } },
   { name: '@Organization', description: 'Your store as the seller', code: { '@context': 'https://schema.org', '@type': 'Organization', name: seoConfig?.siteName || PLATFORM_NAME, url: canonicalBase } },
   { name: '@WebPage', description: 'Page metadata and parent site reference', code: { '@context': 'https://schema.org', '@type': 'WebPage', name: form.seo.metaTitle || form.title || 'Product', url: form.seo.canonical || `${canonicalBase}/product/${form.seo.slug || 'generated-slug'}` } },
  ].map(schema => <details key={schema.name} className="group border-b border-gray-100 py-2 last:border-0"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs"><span><strong className="text-gray-800">{schema.name}</strong><span className="ml-2 text-gray-500">{schema.description}</span></span><span className="text-indigo-500 group-open:rotate-180">⌄</span></summary><pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-gray-950 p-3 text-[10px] leading-relaxed text-emerald-300">{JSON.stringify(schema.code, null, 2)}</pre></details>)}
  <p className="mt-3 text-[10px] text-gray-500">💡 Test the published URL with Google's Rich Results Test to verify all schemas render correctly.</p>
 </div>
 </div>
 )}

 {/* SETTINGS TAB */}
 {activeTab === 'settings' && (
 <div className="space-y-5">
 <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
 <h2 className="font-bold text-gray-900 mb-4">Product Settings</h2>
 <div className="space-y-4">
 {[
 { key: 'isActive', label: 'Active / Published', desc: 'Make product visible to customers' },
 { key: 'isFeatured', label: 'Featured Product', desc: 'Show in featured section on homepage' },
 { key: 'isFlashDeal', label: 'Flash Deal', desc: 'Mark as flash/limited-time deal' },
 ].map(({ key, label, desc }) => (
 <div key={key} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
 <div>
 <p className="font-medium text-gray-800">{label}</p>
 <p className="text-xs text-gray-500">{desc}</p>
 </div>
 <Toggle checked={!!form[key]} onChange={() => setField(key, !form[key])} aria-label={label} />
 </div>
 ))}
 {form.isFlashDeal && (
 <div>
 <label className="text-sm font-medium text-gray-700 mb-1.5 block">Flash Deal Expiry</label>
 <input type="datetime-local" value={form.flashDealExpiry}
 onChange={e => setField('flashDealExpiry', e.target.value)} className="input" />
 </div>
 )}
 </div>
 </div>
 </div>
 )}
 </div>

 {/* Right Sidebar - Image Gallery */}
 <div className="space-y-4">
 <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
 <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
 <ImageIcon size={18} />Product Images
 </h3>
 {uploadedImages.length > 0 ? (
 <div className="space-y-2">
 {uploadedImages.map((img, i) => (
 <div key={i} className="relative">
 <img src={img.url} alt={`Product ${i + 1}`} className="w-full h-40 object-cover rounded-xl" />
 {i === 0 && <span className="absolute top-2 left-2 badge bg-primary-600 text-white text-xs">Main</span>}
 <button type="button"
 onClick={() => setUploadedImages(imgs => imgs.filter((_, idx) => idx !== i))}
 className="absolute top-2 right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600">
 <X size={12} />
 </button>
 </div>
 ))}
 <div {...getGalleryRootProps()} className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer mt-2 ${isGalleryDragActive ? 'border-primary-400 bg-primary-50' : 'border-gray-200 hover:border-primary-400'}`}>
 <input {...getGalleryInputProps()} />
 <p className="text-xs text-gray-400">{isGalleryDragActive ? 'Drop images here' : '+ Add more images'}</p>
 </div>
 </div>
 ) : (
 <div {...getGalleryRootProps()} className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer ${isGalleryDragActive ? 'border-primary-400 bg-primary-50' : 'border-gray-200 hover:border-primary-400'}`}>
 <input {...getGalleryInputProps()} />
 <ImageIcon size={24} className="text-gray-400 mx-auto mb-2" />
 <p className="text-sm text-gray-500">{isGalleryDragActive ? 'Drop images here' : 'Drop images or click to upload'}</p>
 <p className="text-[11px] text-gray-400 mt-1">Normal product gallery · AI analysis is optional</p>
 </div>
 )}
 </div>

 {/* Preview Card */}
 {(form.title || uploadedImages.length > 0) && (
 <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
 <h3 className="font-bold text-gray-900 mb-3">Product Preview</h3>
 <div className="card hover:shadow-md transition-shadow">
 <div className="aspect-square bg-gray-100 rounded-xl overflow-hidden">
 {uploadedImages.length > 0 ? (
 <img src={uploadedImages[0].url} alt="Preview" className="w-full h-full object-cover" />
 ) : (
 <div className="w-full h-full flex items-center justify-center text-gray-300">
 <ImageIcon size={32} />
 </div>
 )}
 </div>
 <div className="p-3">
 <p className="text-xs text-gray-400">{categories.find(c => c._id === form.category)?.name}</p>
 <p className="font-semibold text-gray-800 text-sm line-clamp-2 mt-0.5">
 {form.title || 'Product Title'}
 </p>
 <p className="font-bold text-primary-600 mt-1">{CS}{parseFloat(form.price || 0).toFixed(2)}</p>
 </div>
 </div>
 </div>
 )}
 </div>
 </div>
 </div>
 );
};

export default AddEditProductPage;
