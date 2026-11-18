function buildEmbed(url) {
  if (!url) return null;
  // Instagram post / reel
  const ig = url.match(/instagram\.com\/(?:p|reel|tv)\/([\w-]+)/);
  if (ig) return `https://www.instagram.com/p/${ig[1]}/embed/`;
  // TikTok
  const tt = url.match(/tiktok\.com\/(?:@[\w.-]+\/video|embed\/v2)\/(\d+)/);
  if (tt) return `https://www.tiktok.com/embed/v2/${tt[1]}`;
  // YouTube (incl shorts)
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}?rel=0`;
  // Twitter / X — no native embed iframe; return null and we'll show a fallback
  return null;
}

const ASPECT = { '9/16': 'aspect-[9/16]', '1/1': 'aspect-square', '16/9': 'aspect-video', '4/5': 'aspect-[4/5]' };
const WIDTH = { narrow: 'max-w-sm', normal: 'max-w-md', wide: 'max-w-2xl' };

export default function SocialEmbed({ data = {} }) {
  const src = buildEmbed(data.embedUrl);
  const aspect = ASPECT[data.aspectRatio] || ASPECT['9/16'];
  const w = WIDTH[data.maxWidth] || WIDTH.narrow;
  return (
    <section className="container mx-auto px-4">
      {data.heading && <h2 className="text-2xl md:text-3xl font-bold text-gray-900 text-center mb-6">{data.heading}</h2>}
      <div className={`${w} mx-auto`}>
        {src ? (
          <div className={`relative ${aspect} rounded-xl overflow-hidden bg-gray-100 ring-1 ring-gray-200`}>
            <iframe data-page-builder-media="content" className="absolute inset-0 w-full h-full" src={src} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen title="social-embed" />
          </div>
        ) : data.embedUrl ? (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center">
            <a href={data.embedUrl} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline break-all">{data.embedUrl}</a>
            <div className="text-xs text-gray-400 mt-2">This URL doesn't have a recognized embed format — showing as a link.</div>
          </div>
        ) : (
          <div className="py-6 text-center text-sm text-gray-400">Social embed — paste an Instagram, TikTok, or YouTube URL</div>
        )}
      </div>
    </section>
  );
}
