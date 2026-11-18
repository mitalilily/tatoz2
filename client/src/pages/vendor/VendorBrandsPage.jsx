import { useState, useEffect } from 'react';
import { Award, Search } from 'lucide-react';
import { vendorAPI } from '../../services/api';
import Loader from '../../components/common/Loader';

const BRAND_PLACEHOLDER = 'https://via.placeholder.com/200/fbbf24/1e1b4b?text=Brand';

export default function VendorBrandsPage() {
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    vendorAPI.getBrands().then(r => setBrands(r.data.data || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const filtered = brands.filter(b =>
    !search || b.name.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="text-center py-12"><Loader /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Award className="text-primary-600" size={28} /> Brands
        </h1>
        <p className="text-gray-500 mt-1">Browse available brands</p>
      </div>

      <div className="relative max-w-md">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search brands..." className="input pl-10 w-full"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-center py-12 text-gray-400">No brands found</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {filtered.map(brand => (
            <div key={brand._id} className="bg-white rounded-xl border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
              <div className="h-28 bg-gray-50 flex items-center justify-center p-4">
                <img
                  src={brand.image || BRAND_PLACEHOLDER}
                  alt={brand.name}
                  className="max-h-full max-w-full object-contain"
                />
              </div>
              <div className="p-3 text-center">
                <h3 className="font-medium text-gray-900">{brand.name}</h3>
                {brand.description && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{brand.description}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
