import { Ruler } from 'lucide-react';

export default function SizeGuide({ data = {} }) {
  const sizes = data.sizes || [
    { size: 'S', chest: '36', waist: '28', length: '26' },
    { size: 'M', chest: '38', waist: '30', length: '27' },
    { size: 'L', chest: '40', waist: '32', length: '28' },
    { size: 'XL', chest: '42', waist: '34', length: '29' },
  ];

  return (
    <div className="py-6 px-8 bg-white">
      <div className="max-w-2xl mx-auto">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Ruler size={18} className="text-gray-600" />
          Size Guide
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="px-4 py-2 text-left font-semibold">Size</th>
                <th className="px-4 py-2 text-left font-semibold">Chest (in)</th>
                <th className="px-4 py-2 text-left font-semibold">Waist (in)</th>
                <th className="px-4 py-2 text-left font-semibold">Length (in)</th>
              </tr>
            </thead>
            <tbody>
              {sizes.map(row => (
                <tr key={row.size} className="border-b">
                  <td className="px-4 py-2 font-medium">{row.size}</td>
                  <td className="px-4 py-2">{row.chest}</td>
                  <td className="px-4 py-2">{row.waist}</td>
                  <td className="px-4 py-2">{row.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.tips && <p className="text-xs text-gray-500 mt-3">{data.tips}</p>}
      </div>
    </div>
  );
}