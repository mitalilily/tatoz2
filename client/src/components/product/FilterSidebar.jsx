import { useEffect, useState } from 'react';
import { ChevronDown, Star } from 'lucide-react';
import { categoryChildren } from '../../utils/categoryTree';

const PRICE_BANDS = [
  { label: 'Under ₹500', min: '', max: '500' },
  { label: '₹500 to ₹1,000', min: '500', max: '1000' },
  { label: '₹1,000 to ₹5,000', min: '1000', max: '5000' },
  { label: 'Over ₹5,000', min: '5000', max: '' },
];

const RATING_OPTIONS = [
  { value: '4', label: '4 Stars & Up' },
  { value: '3', label: '3 Stars & Up' },
  { value: '2', label: '2 Stars & Up' },
];

const AVAILABILITY_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'in_stock', label: 'In Stock' },
  { value: 'preorder', label: 'Pre-order' },
  { value: 'backorder', label: 'Back-order' },
];

function Section({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-gray-200 py-4 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-[15px] font-bold text-gray-900">{title}</span>
        <ChevronDown
          size={16}
          className={`text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <div className="mt-2.5">{children}</div>}
    </div>
  );
}

function FilterRow({ active, onClick, children, ariaLabel }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={active}
      className={`block w-full rounded px-1 py-1 text-left text-[13px] leading-5 transition-colors hover:text-orange-700 hover:underline ${
        active ? 'font-semibold text-orange-700' : 'text-gray-700'
      }`}
    >
      {children}
    </button>
  );
}

function Stars({ count }) {
  return (
    <span className="inline-flex items-center gap-px" aria-hidden="true">
      {[...Array(5)].map((_, i) => (
        <Star
          key={i}
          size={13}
          className={i < count ? 'fill-amber-500 text-amber-500' : 'fill-gray-200 text-gray-200'}
        />
      ))}
    </span>
  );
}

/**
 * Amazon-style filter sidebar.
 * Controlled component — all state lives in the parent via `filters` + `onUpdate`.
 */
const FilterSidebar = ({
  filters,
  categories = [],
  vendors = [],
  brands = [],
  currencySymbol = '₹',
  onUpdate,
  onClear,
  activeCount = 0,
  lockedCategoryId = '',
}) => {
  const [priceMin, setPriceMin] = useState(filters.minPrice || '');
  const [priceMax, setPriceMax] = useState(filters.maxPrice || '');

  // Keep the custom price inputs in sync when filters reset elsewhere (e.g. Clear all).
  useEffect(() => { setPriceMin(filters.minPrice || ''); }, [filters.minPrice]);
  useEffect(() => { setPriceMax(filters.maxPrice || ''); }, [filters.maxPrice]);

  const applyPrice = () => {
    onUpdate('minPrice', priceMin);
    onUpdate('maxPrice', priceMax);
  };

  const renderCategory = (category, depth = 0) => (
    <div key={category._id} className={depth ? 'pl-4' : ''}>
      <FilterRow
        active={String(filters.category) === String(category._id)}
        onClick={() => onUpdate('category', String(filters.category) === String(category._id) ? '' : category._id)}
        ariaLabel={`Filter by ${category.name}`}
      >
        {category.name}
      </FilterRow>
      {categoryChildren(category).map(child => renderCategory(child, depth + 1))}
    </div>
  );

  return (
    <div className="text-sm">
      <div className="flex items-center justify-between pb-1">
        <span className="text-[15px] font-bold text-gray-900">
          Filters{activeCount > 0 && (
            <span className="ml-2 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-800">
              {activeCount}
            </span>
          )}
        </span>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="text-[13px] text-cyan-800 hover:text-orange-700 hover:underline"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Department */}
      {!lockedCategoryId && (
        <Section title="Department">
          <div className="space-y-0.5">
            <FilterRow
              active={!filters.category}
              onClick={() => onUpdate('category', '')}
              ariaLabel="All departments"
            >
              All Departments
            </FilterRow>
            {categories.map(category => renderCategory(category))}
          </div>
        </Section>
      )}

      {vendors.length > 0 && (
        <Section title="Seller">
          <div className="space-y-0.5" data-testid="vendor-filter-options">
            <FilterRow
              active={!filters.vendor}
              onClick={() => onUpdate('vendor', '')}
              ariaLabel="All sellers"
            >
              All Sellers
            </FilterRow>
            {vendors.map(vendor => (
              <FilterRow
                key={vendor._id}
                active={String(filters.vendor || '') === String(vendor._id)}
                onClick={() => onUpdate('vendor', String(filters.vendor || '') === String(vendor._id) ? '' : vendor._id)}
                ariaLabel={`Filter by seller ${vendor.storeName}`}
              >
                {vendor.storeName}
              </FilterRow>
            ))}
          </div>
        </Section>
      )}

      {brands.length > 0 && (
        <Section title="Brand">
          <div className="space-y-0.5" data-testid="brand-filter-options">
            <FilterRow
              active={!filters.brand}
              onClick={() => onUpdate('brand', '')}
              ariaLabel="All brands"
            >
              All Brands
            </FilterRow>
            {brands.map(brand => (
              <FilterRow
                key={brand._id || brand.slug}
                active={String(filters.brand || '') === String(brand.slug || brand._id)}
                onClick={() => onUpdate('brand', String(filters.brand || '') === String(brand.slug || brand._id) ? '' : (brand.slug || brand._id))}
                ariaLabel={`Filter by brand ${brand.name}`}
              >
                {brand.name}
              </FilterRow>
            ))}
          </div>
        </Section>
      )}

      {/* Customer reviews */}
      <Section title="Customer Reviews">
        <div className="space-y-0.5">
          {RATING_OPTIONS.map(o => {
            const stars = Number(o.value);
            const active = String(filters.minRating) === o.value;
            return (
              <FilterRow
                key={o.value}
                active={active}
                onClick={() => onUpdate('minRating', active ? '' : o.value)}
                ariaLabel={`${o.label} filter`}
              >
                <span className="inline-flex items-center gap-1.5">
                  <Stars count={stars} />
                  <span>{o.label}</span>
                </span>
              </FilterRow>
            );
          })}
        </div>
      </Section>

      {/* Price */}
      <Section title="Price">
        <div className="space-y-0.5">
          {PRICE_BANDS.map(band => {
            const active =
              String(filters.minPrice || '') === band.min &&
              String(filters.maxPrice || '') === band.max;
            return (
              <FilterRow
                key={band.label}
                active={active}
                onClick={() => {
                  const nextMin = active ? '' : band.min;
                  const nextMax = active ? '' : band.max;
                  setPriceMin(nextMin);
                  setPriceMax(nextMax);
                  onUpdate('minPrice', nextMin);
                  onUpdate('maxPrice', nextMax);
                }}
                ariaLabel={`Price ${band.label}`}
              >
                {band.label}
              </FilterRow>
            );
          })}
        </div>
        <div className="mt-3 flex items-center gap-1.5">
          <input
            type="number"
            min="0"
            value={priceMin}
            onChange={e => setPriceMin(e.target.value)}
            placeholder="Min"
            aria-label="Minimum price"
            className="w-full min-w-0 rounded border border-gray-400 bg-white px-2 py-1 text-[13px] shadow-inner focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
          <span className="text-gray-400">–</span>
          <input
            type="number"
            min="0"
            value={priceMax}
            onChange={e => setPriceMax(e.target.value)}
            placeholder="Max"
            aria-label="Maximum price"
            className="w-full min-w-0 rounded border border-gray-400 bg-white px-2 py-1 text-[13px] shadow-inner focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
          />
          <button
            type="button"
            onClick={applyPrice}
            className="shrink-0 rounded-full border border-gray-400 bg-white px-3 py-1 text-[13px] text-gray-700 shadow-sm hover:bg-gray-100"
          >
            Go
          </button>
        </div>
        {(filters.minPrice || filters.maxPrice) && (
          <p className="mt-1.5 text-xs text-gray-500">
            {currencySymbol}{filters.minPrice || '0'} – {currencySymbol}{filters.maxPrice || '∞'}
          </p>
        )}
      </Section>

      {/* Availability */}
      <Section title="Availability">
        <div className="space-y-0.5">
          {AVAILABILITY_OPTIONS.map(o => {
            const active = String(filters.availability || '') === o.value;
            return (
              <FilterRow
                key={o.label}
                active={active}
                onClick={() => onUpdate('availability', active ? '' : o.value)}
                ariaLabel={`Availability ${o.label}`}
              >
                {o.label}
              </FilterRow>
            );
          })}
        </div>
      </Section>

      {/* Deals */}
      <Section title="Deals">
        {[
          { key: 'flashDeal', label: 'Flash Deals' },
          { key: 'featured', label: "Today's Featured" },
        ].map(deal => {
          const checked = filters[deal.key] === 'true';
          return (
            <label
              key={deal.key}
              className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-[13px] text-gray-700 hover:text-orange-700"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={e => onUpdate(deal.key, e.target.checked ? 'true' : '')}
                className="h-4 w-4 rounded border-gray-400 accent-orange-600"
              />
              <span className={checked ? 'font-semibold text-orange-700' : ''}>{deal.label}</span>
            </label>
          );
        })}
      </Section>

      {/* Size & Color */}
      <Section title="Size & Colour" defaultOpen={false}>
        <label className="mb-1 block text-xs font-medium text-gray-500" htmlFor="filter-size">
          Size
        </label>
        <input
          id="filter-size"
          value={filters.size || ''}
          onChange={e => onUpdate('size', e.target.value)}
          placeholder="e.g. M, 42, A4"
          className="mb-3 w-full rounded border border-gray-400 bg-white px-2 py-1.5 text-[13px] shadow-inner focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        />
        <label className="mb-1 block text-xs font-medium text-gray-500" htmlFor="filter-color">
          Colour
        </label>
        <input
          id="filter-color"
          value={filters.color || ''}
          onChange={e => onUpdate('color', e.target.value)}
          placeholder="e.g. Red, Blue"
          className="w-full rounded border border-gray-400 bg-white px-2 py-1.5 text-[13px] shadow-inner focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
        />
      </Section>
    </div>
  );
};

export default FilterSidebar;
