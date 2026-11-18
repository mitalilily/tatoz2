import { MessageCircle, Phone, Mail, MessageSquare } from 'lucide-react';

const ICONS = {
  chat: MessageCircle,
  phone: Phone,
  mail: Mail,
  whatsapp: MessageSquare,
};

export default function ContactCta({ data = {} }) {
  const mode = data.mode || 'inline';
  const iconType = data.iconType || 'chat';
  const IconComponent = ICONS[iconType] || MessageCircle;
  const label = data.label || 'Need help? Chat with us';
  const link = data.link || '#';

  if (mode === 'floating') {
    return (
      <a href={link} className="fixed bottom-[84px] right-4 z-50 flex max-w-[calc(100vw-2rem)] items-center gap-2 px-4 py-3 bg-indigo-600 text-white rounded-full shadow-lg hover:bg-indigo-700 transition md:bottom-6 md:right-6">
        <IconComponent size={20} />
        <span className="break-anywhere font-medium text-sm">{label}</span>
      </a>
    );
  }

  return (
    <div className="py-6 px-6 bg-indigo-50">
      <a href={link} className="flex items-center justify-center gap-3 max-w-md mx-auto px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition">
        <IconComponent size={20} />
        <span className="font-medium">{label}</span>
      </a>
    </div>
  );
}
