function parseEmbed(url) {
  if (!url) return null;
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/);
  if (yt) return { type: 'youtube', id: yt[1] };
  const vm = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vm) return { type: 'vimeo', id: vm[1] };
  return null;
}

const ASPECT = { '16/9': 'aspect-video', '4/3': 'aspect-[4/3]', '1/1': 'aspect-square', '9/16': 'aspect-[9/16]' };

export default function Video({ data = {} }) {
  if (!data.videoUrl) return <div className="py-8 text-center text-sm text-gray-400">Video — no URL set</div>;
  const aspect = ASPECT[data.aspectRatio] || ASPECT['16/9'];
  const embed = parseEmbed(data.videoUrl);
  return (
    <section className="container mx-auto px-4">
      {data.heading && <h2 className="text-2xl md:text-3xl font-bold text-gray-900 text-center mb-6">{data.heading}</h2>}
      <div className={`relative ${aspect} max-w-4xl mx-auto rounded-xl overflow-hidden bg-black shadow-md`}>
        {embed?.type === 'youtube' && (
          <iframe
            data-page-builder-media="content"
            className="absolute inset-0 w-full h-full"
            src={`https://www.youtube.com/embed/${embed.id}?${data.autoplay ? 'autoplay=1&' : ''}${data.muted ? 'mute=1&' : ''}${data.loop ? `loop=1&playlist=${embed.id}&` : ''}rel=0`}
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            title="video"
          />
        )}
        {embed?.type === 'vimeo' && (
          <iframe
            data-page-builder-media="content"
            className="absolute inset-0 w-full h-full"
            src={`https://player.vimeo.com/video/${embed.id}?${data.autoplay ? 'autoplay=1&' : ''}${data.muted ? 'muted=1&' : ''}${data.loop ? 'loop=1&' : ''}`}
            loading="lazy"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            title="video"
          />
        )}
        {!embed && (
          <video
            data-page-builder-media="content"
            className="absolute inset-0 w-full h-full"
            src={data.videoUrl}
            poster={data.posterUrl || undefined}
            preload={data.autoplay ? 'auto' : 'metadata'}
            controls
            autoPlay={data.autoplay}
            muted={data.muted}
            loop={data.loop}
            playsInline
          />
        )}
      </div>
    </section>
  );
}
