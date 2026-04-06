interface Variant { variant_type?: string; price: number | null; price_modifier: number; }
interface ProductCardProps {
  product: { name: string; slug: string; price: number; original_price: number | null; primary_image: string; sold_count: number; rating: number; variants?: Variant[] };
  formatPrice: (price: number) => string;
  formatSoldCount: (count: number) => string;
  onClick: () => void;
}

function getPriceRange(basePrice: number, variants?: Variant[]): { min: number; max: number } {
  if (!variants || variants.length === 0) return { min: basePrice, max: basePrice };
  const filtered = variants.filter((v) => v.variant_type !== "_combinations");
  if (filtered.length === 0) return { min: basePrice, max: basePrice };
  const prices = filtered.map((v) => v.price != null ? v.price : basePrice + (v.price_modifier || 0));
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

export default function ProductCard({ product, formatPrice, formatSoldCount, onClick }: ProductCardProps) {
  const { min, max } = getPriceRange(product.price, product.variants);
  const hasRange = min !== max;

  return (
    <div className="bg-white rounded-lg border overflow-hidden cursor-pointer hover:shadow-md transition" onClick={onClick} data-testid={`product-card-${product.slug}`}>
      <div className="aspect-square relative">
        <img src={product.primary_image} alt={product.name} className="w-full h-full object-cover" />
        {product.original_price && product.original_price > min && (
          <span className="absolute top-2 left-2 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded">{Math.round((1 - min / product.original_price) * 100)}%</span>
        )}
      </div>
      <div className="p-3">
        <h3 className="text-sm line-clamp-2 mb-1">{product.name}</h3>
        <p className="text-red-600 font-bold text-sm">
          {hasRange ? `${formatPrice(min)} - ${formatPrice(max)}` : formatPrice(min)}
        </p>
        {product.original_price && product.original_price > min && <p className="text-xs text-gray-400 line-through">{formatPrice(product.original_price)}</p>}
        <div className="flex items-center gap-2 mt-1 text-xs text-gray-400"><span>{formatSoldCount(product.sold_count)}</span></div>
      </div>
    </div>
  );
}
