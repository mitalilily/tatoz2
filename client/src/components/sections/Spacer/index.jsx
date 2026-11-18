const HEIGHT = { xs: 'h-2', sm: 'h-4', md: 'h-8', lg: 'h-16', xl: 'h-24', '2xl': 'h-40' };
export default function Spacer({ data = {} }) {
  const h = HEIGHT[data.height] || HEIGHT.md;
  return (
    <div className={`container mx-auto px-4 ${h} flex items-center`}>
      {data.showRule && <hr className="w-full border-gray-200" />}
    </div>
  );
}
