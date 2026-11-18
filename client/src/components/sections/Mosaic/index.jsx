import { Link } from 'react-router-dom';
import { gridStyle } from '../../page/grid';

const Tile = ({ tile, radius }) => {
  const W = tile.link ? Link : 'div';
  const p = tile.link ? { to: tile.link } : {};
  return (
    <W {...p} className="relative block w-full h-full min-h-0 min-w-0 overflow-hidden bg-gray-100 group" style={{ borderRadius: radius }}>
      {tile.imageUrl
        ? <img data-page-builder-media="content" src={tile.imageUrl} alt={tile.altText || tile.heading || ''} className="absolute inset-0 w-full h-full group-hover:scale-105 transition-transform" style={{ objectFit: tile.objectFit || 'cover', objectPosition: tile.objectPosition || 'center center' }} />
        : <div className="absolute inset-0 bg-gradient-to-br from-gray-200 to-gray-300" />}
      {tile.heading && (
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent flex items-end p-4">
          <span className="text-white font-semibold text-lg drop-shadow">{tile.heading}</span>
        </div>
      )}
    </W>
  );
};

export default function Mosaic({ data = {} }) {
  const tiles = Array.isArray(data.tiles) ? data.tiles : [];
  const preset = ['1+2', '2x2', 'L', 'T'].includes(data.preset) ? data.preset : '1+2';
  const need = preset === '2x2' ? 4 : 3;
  const list = tiles.slice(0, need);
  while (list.length < need) list.push({});
  const stacked = data.layoutMode === 'stack';
  const composition = {
    '1+2': { columns: '2fr 1fr', areas: '"a b" "a c"' },
    'L': { columns: '1fr 2fr', areas: '"a b" "a c"' },
    'T': { columns: '1fr 1fr', areas: '"a a" "b c"' },
    '2x2': { columns: '1fr 1fr', areas: '"a b" "c d"' },
  }[preset];
  const style = {
    ...gridStyle(data),
    gridTemplateColumns: stacked ? 'minmax(0, 1fr)' : composition.columns,
    gridTemplateAreas: stacked ? undefined : composition.areas,
    gridTemplateRows: stacked ? undefined : 'repeat(2, minmax(0, 1fr))',
    aspectRatio: !stacked && !data.height ? (data.aspectRatio || '2/1') : undefined,
    height: !stacked && data.height ? Number(data.height) : undefined,
  };
  return (
    <section className="container mx-auto px-4">
      {data.heading && <h2 className="text-2xl font-bold text-gray-900 mb-4">{data.heading}</h2>}
      <div data-page-grid="mosaic" data-preset={preset} className="grid min-w-0" style={style}>
        {list.map((tile, index) => (
          <div key={index} className="min-w-0 min-h-0" style={{ gridArea: stacked ? undefined : 'abcd'[index], aspectRatio: stacked ? '16/9' : undefined }}>
            <Tile tile={tile} radius={data.borderRadius ?? 12} />
          </div>
        ))}
      </div>
    </section>
  );
}
