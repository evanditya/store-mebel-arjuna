interface Variant { variant_type?: string; price: number | null; original_price?: number | null; price_modifier: number; stock?: number; }
interface ProductCardProps {
  product: { name: string; slug: string; price: number; original_price: number | null; primary_image: string; sold_count: number; rating: number; stock?: number; variants?: Variant[] };
  formatPrice: (price: number) => string;
  formatSoldCount: (count: number) => string;
  onClick: () => void;
}

function getEffectiveBase(price: number, originalPrice: number | null): number {
  return (originalPrice && originalPrice < price) ? originalPrice : price;
}

function getPriceRange(basePrice: number, originalPrice: number | null, variants?: Variant[]): { min: number; max: number } {
  const effectiveBase = getEffectiveBase(basePrice, originalPrice);
  if (!variants || variants.length === 0) return { min: effectiveBase, max: effectiveBase };
  const filtered = variants.filter((v) => v.variant_type !== "_combinations");
  if (filtered.length === 0) return { min: effectiveBase, max: effectiveBase };
  const prices = filtered.map((v) => {
    if (v.price != null) return (v.original_price != null && v.original_price < v.price) ? v.original_price : v.price;
    return effectiveBase + (v.price_modifier || 0);
  });
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

export default function ProductCard({ product, formatPrice, formatSoldCount, onClick }: ProductCardProps) {
  const hasDiscount = !!(product.original_price && product.original_price < product.price);
  const { min, max } = getPriceRange(product.price, product.original_price, product.variants);
  const hasRange = min !== max;

  const realVariants = (product.variants || []).filter((v) => v.variant_type !== "_combinations");
  const totalStock = realVariants.length > 0
    ? realVariants.reduce((s, v) => s + (v.stock ?? 0), 0)
    : (product.stock ?? null);
  const isOutOfStock = totalStock != null && totalStock === 0;

  return (
    <div
      className={`bg-white rounded-lg border overflow-hidden transition ${isOutOfStock ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:shadow-md"}`}
      onClick={isOutOfStock ? undefined : onClick}
      data-testid={`product-card-${product.slug}`}
    >
      <div className="aspect-square relative">
        <img src={product.primary_image} alt={product.name} className="w-full h-full object-cover" loading="lazy" />
        {hasDiscount && !isOutOfStock && (
          <span className="absolute top-2 left-2 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded">{Math.round((1 - product.original_price! / product.price) * 100)}%</span>
        )}
        {isOutOfStock && (
          <div className="absolute inset-0 flex items-end justify-center pb-3 bg-black/20">
            <span className="bg-gray-800/90 text-white text-xs font-semibold px-3 py-1 rounded-full tracking-wide">Not Available</span>
          </div>
        )}
      </div>
      <div className="p-3">
        <h3 className="text-sm line-clamp-2 mb-1">{product.name}</h3>
        <p className={`font-bold text-sm ${isOutOfStock ? "text-gray-400" : "text-red-600"}`}>
          {hasRange ? `${formatPrice(min)} - ${formatPrice(max)}` : formatPrice(min)}
        </p>
        {hasDiscount && !isOutOfStock && <p className="text-xs text-gray-400 line-through">{formatPrice(product.price)}</p>}
        <div className="flex items-center justify-between mt-1 text-xs text-gray-400">
          <span>{formatSoldCount(product.sold_count)}</span>
          {!isOutOfStock && totalStock != null && totalStock <= 10 && (
            <span className="text-orange-500 font-medium">Sisa {totalStock}</span>
          )}
          {!isOutOfStock && totalStock != null && totalStock > 10 && (
            <span>Stok: {totalStock}</span>
          )}
        </div>
      </div>
    </div>
  );
}
