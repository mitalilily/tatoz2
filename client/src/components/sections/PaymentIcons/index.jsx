import { CreditCard } from 'lucide-react';

const PAYMENT_ICONS = [
  { id: 'upi', label: 'UPI', color: 'bg-green-500' },
  { id: 'card', label: 'Cards', color: 'bg-blue-500' },
  { id: 'netbanking', label: 'Net Banking', color: 'bg-purple-500' },
  { id: 'wallet', label: 'Wallets', color: 'bg-orange-500' },
  { id: 'cod', label: 'COD', color: 'bg-gray-500' },
];

export default function PaymentIcons({ data = {} }) {
  const enabled = data.enabled || ['upi', 'card', 'netbanking', 'wallet', 'cod'];

  return (
    <div className="py-4 px-6 bg-gray-50">
      <div className="flex flex-wrap items-center justify-center gap-4">
        {PAYMENT_ICONS.filter(p => enabled.includes(p.id)).map(p => (
          <div key={p.id} className={`w-12 h-8 rounded ${p.color} flex items-center justify-center`}>
            <span className="text-white text-xs font-semibold">{p.label.charAt(0)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}