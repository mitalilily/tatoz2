export default function TrustBadges({ data = {} }) {
  const badges = Array.isArray(data.badges) ? data.badges.filter(b => b.imageUrl) : [];
  if (!badges.length) return null;
  return (
    <section className="container mx-auto px-4">
      {data.heading && <div className="text-center text-xs font-semibold uppercase tracking-wider text-gray-500 mb-4">{data.heading}</div>}
      <div className="flex flex-wrap items-center justify-center gap-4 md:gap-8">
        {badges.map((b, i) => {
          const inner = <img data-page-builder-media="content" src={b.imageUrl} alt={b.altText || ''} className="h-8 md:h-10 max-w-[120px] object-contain" />;
          if (b.link) return <a key={i} href={b.link} target="_blank" rel="noreferrer">{inner}</a>;
          return <div key={i}>{inner}</div>;
        })}
      </div>
    </section>
  );
}
