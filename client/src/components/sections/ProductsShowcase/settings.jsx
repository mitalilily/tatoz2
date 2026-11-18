import { useEffect, useState } from 'react';
import { Field, TextInput, Select, NumberInput } from '../../admin/pageBuilder/inputs';
import { productAPI, categoryAPI, brandAPI } from '../../../services/api';
import { PRODUCT_CARD_VARIANT_OPTIONS } from '../../page/componentVariants';
import GridControls from '../../admin/pageBuilder/GridControls';

export default function ProductsShowcaseSettings({ data, onChange }) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [cats, setCats] = useState([]);
  const [brands, setBrands] = useState([]);

  useEffect(() => {
    categoryAPI.getAll().then(r => setCats(r.data?.categories || [])).catch(() => {});
    brandAPI.getAll().then(r => setBrands(r.data?.brands || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (data.source !== 'manual' || !search) { setResults([]); return; }
    let cancelled = false;
    const id = setTimeout(() => {
      productAPI.getAll({ search, limit: 10 })
        .then(r => { if (!cancelled) setResults(r.data?.products || []); })
        .catch(() => { if (!cancelled) setResults([]); });
    }, 250);
    return () => { cancelled = true; clearTimeout(id); };
  }, [search, data.source]);

  const ids = data.manualProductIds || [];
  const addProduct = (p) => { if (!ids.includes(p._id)) onChange({ manualProductIds: [...ids, p._id] }); };
  const removeProduct = (id) => onChange({ manualProductIds: ids.filter(x => x !== id) });

  return (
    <div>
      <GridControls data={data} onChange={onChange} defaultColumns={4} />
      <Field label="Heading"><TextInput value={data.heading || ''} onChange={e => onChange({ heading: e.target.value })} /></Field>
      <Field label="Source">
        <Select data-testid="page-builder-products-source" value={data.source || 'collection'} onChange={e => onChange({ source: e.target.value })} options={[{ value: 'collection', label: 'Auto from collection' }, { value: 'manual', label: 'Manually pick products' }]} />
      </Field>
      {data.source === 'collection' && (
        <>
          <Field label="Collection">
            <Select value={data.collection || 'featured'} onChange={e => onChange({ collection: e.target.value, collectionRef: null })}
              options={[
                { value: 'featured', label: 'Featured' },
                { value: 'newest', label: 'Newest' },
                { value: 'bestsellers', label: 'Bestsellers' },
                { value: 'all', label: 'All products' },
                { value: 'category', label: 'Category' },
                { value: 'brand', label: 'Brand' },
              ]} />
          </Field>
          {data.collection === 'category' && (
            <Field label="Category">
              <Select value={data.collectionRef || ''} onChange={e => onChange({ collectionRef: e.target.value })}
                options={[{ value: '', label: 'Select…' }, ...cats.map(c => ({ value: c._id, label: c.name }))]} />
            </Field>
          )}
          {data.collection === 'brand' && (
            <Field label="Brand">
              <Select value={data.collectionRef || ''} onChange={e => onChange({ collectionRef: e.target.value })}
                options={[{ value: '', label: 'Select…' }, ...brands.map(b => ({ value: b._id, label: b.name }))]} />
            </Field>
          )}
        </>
      )}
      {data.source === 'manual' && (
        <Field label={`Picked products (${ids.length})`}>
          <div className="space-y-2">
            <TextInput data-testid="page-builder-products-search" placeholder="Search products…" value={search} onChange={e => setSearch(e.target.value)} />
            {results.length > 0 && (
              <div className="border border-gray-200 rounded-md max-h-48 overflow-y-auto">
                {results.map(p => (
                  <button data-testid={`page-builder-products-result-${p._id}`} key={p._id} onClick={() => addProduct(p)} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2">
                    {(p.thumbnail || p.images?.[0]?.url || p.images?.[0]) && <img src={p.thumbnail || p.images?.[0]?.url || p.images?.[0]} className="w-8 h-8 object-cover rounded" alt="" />}
                    <span className="flex-1 truncate">{p.title || p.name || p.slug || 'Untitled product'}</span>
                    {ids.includes(p._id) && <span className="text-xs text-green-600">✓ Added</span>}
                  </button>
                ))}
              </div>
            )}
            {ids.length > 0 && (
              <div className="space-y-1">
                {ids.map(id => (
                  <div data-testid={`page-builder-products-picked-${id}`} key={id} className="flex items-center justify-between bg-gray-50 rounded px-2 py-1 text-sm">
                    <span className="font-mono text-xs text-gray-600 truncate">{id}</span>
                    <button onClick={() => removeProduct(id)} className="text-red-600 text-xs">×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Field>
      )}
      <Field label="Layout">
        <Select value={data.layout || 'horizontalScroll'} onChange={e => onChange({ layout: e.target.value })}
          options={[{ value: 'horizontalScroll', label: 'Horizontal scroll' }, { value: 'grid', label: 'Grid' }]} />
      </Field>
      <Field label="Product card style">
        <Select
          data-testid="page-builder-product-card-variant"
          value={data.cardVariant || 'classic'}
          onChange={e => onChange({ cardVariant: e.target.value })}
          options={PRODUCT_CARD_VARIANT_OPTIONS.map(option => ({ value: option.value, label: option.label }))}
        />
      </Field>
      <Field label="Max products"><NumberInput value={data.count ?? 8} min={1} max={48} onChange={e => onChange({ count: Number(e.target.value) })} /></Field>
      <Field label="See all link (optional)"><TextInput value={data.seeAllLink || ''} placeholder="/search?featured=1" onChange={e => onChange({ seeAllLink: e.target.value })} /></Field>
    </div>
  );
}
