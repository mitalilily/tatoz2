import { Link } from 'react-router-dom';

const ASPECT = { auto: '', banner: 'aspect-[3/1]', square: 'aspect-square', wide: 'aspect-[16/9]' };

export default function ImageBanner({ data = {} }) {
  if (!data.imageUrl) return <div className="py-8 text-center text-sm text-gray-400">Image Banner — no image set</div>;
  const aspect = ASPECT[data.aspectRatio] || ASPECT.banner;
  const inner = (
    <div className={`relative w-full ${aspect} overflow-hidden ${data.fullBleed ? '' : 'rounded-xl'}`}>
      <img data-page-builder-media="content" src={data.imageUrl} alt={data.altText || ''} loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover" />
    </div>
  );
  const content = data.link ? <Link to={data.link} className="block">{inner}</Link> : inner;
  return (
    <div className={data.fullBleed ? '' : 'container mx-auto px-4'}>
      {content}
    </div>
  );
}
