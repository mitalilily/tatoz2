import { Link } from 'react-router-dom';

export default function ImageText({ data = {} }) {
  const imageFirst = data.imagePosition !== 'right';
  const Image = (
    <div className="md:w-1/2">
      {data.imageUrl ? (
        <img data-page-builder-media="content" src={data.imageUrl} alt={data.heading || ''} loading="lazy" decoding="async" className="w-full aspect-[4/3] object-cover rounded-xl" />
      ) : <div className="w-full aspect-[4/3] bg-gray-100 rounded-xl" />}
    </div>
  );
  const Text = (
    <div className="md:w-1/2 flex flex-col justify-center px-2 md:px-6 py-4">
      {data.heading && <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">{data.heading}</h2>}
      {data.body && <p className="text-gray-600 leading-relaxed">{data.body}</p>}
      {data.ctaLabel && (
        <Link to={data.ctaLink || '/'} className="mt-5 inline-block self-start px-5 py-2.5 bg-gray-900 text-white font-semibold rounded-lg hover:bg-gray-800">
          {data.ctaLabel}
        </Link>
      )}
    </div>
  );
  return (
    <section className="container mx-auto px-4">
      <div className="flex flex-col md:flex-row gap-6 items-stretch">
        {imageFirst ? Image : Text}
        {imageFirst ? Text : Image}
      </div>
    </section>
  );
}
