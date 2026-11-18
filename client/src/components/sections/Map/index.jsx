import { MapPin, Phone, Clock } from 'lucide-react';

export default function Map({ data = {} }) {
  const locations = Array.isArray(data.locations) ? data.locations : [];
  return (
    <section className="container mx-auto px-4">
      {data.heading && <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-6">{data.heading}</h2>}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        <div className={`${data.showLocationList && locations.length ? 'md:col-span-2' : 'md:col-span-3'} aspect-video md:aspect-auto md:h-[420px] rounded-xl overflow-hidden ring-1 ring-gray-200 bg-gray-100`}>
          {data.embedUrl ? (
            <iframe
              data-page-builder-media="content"
              title="map"
              src={data.embedUrl}
              className="w-full h-full"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-sm text-gray-400">Paste a Google Maps embed URL in settings</div>
          )}
        </div>
        {data.showLocationList && locations.length > 0 && (
          <div className="md:col-span-1 space-y-3">
            {locations.map((l, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-xl p-4">
                {l.name && <div className="font-semibold text-gray-900 mb-1">{l.name}</div>}
                {l.address && <div className="flex items-start gap-2 text-sm text-gray-600 mb-1.5"><MapPin size={14} className="flex-shrink-0 mt-0.5 text-gray-400" />{l.address}</div>}
                {l.phone && <div className="flex items-center gap-2 text-sm text-gray-600 mb-1"><Phone size={14} className="text-gray-400" />{l.phone}</div>}
                {l.hours && <div className="flex items-center gap-2 text-sm text-gray-600"><Clock size={14} className="text-gray-400" />{l.hours}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
