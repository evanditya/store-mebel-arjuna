interface Variant { variant_type?: string; price: number | null; original_price?: number | null; price_modifier: number; stock?: number; is_available?: boolean; }
interface ProductCardProps {
  product: { name: string; slug: string; price: number; original_price: number | null; primary_image: string; sold_count: number; rating: number; stock?: number; variants?: Variant[] };
  formatPrice: (price: number) => string;
  formatSoldCount: (count: number) => string;
  onClick: () => void;
}

function getEffectiveBase(price: number, originalPrice: number | null): number {
  return (originalPrice && originalPrice < price) ? originalPrice : price;
}

function computePriceInfo(basePrice: number, originalPrice: number | null, variants?: Variant[]) {
  const effectiveBase = getEffectiveBase(basePrice, originalPrice);
  // Multi-level products: real prices live in `_combinations` rows. Series/Ukuran
  // rows hold display labels with possibly bogus/range prices, so prefer combos.
  const combos = (variants || []).filter((v) => v.variant_type === "_combinations" && v.is_available !== false);
  const active = combos.length > 0
    ? combos
    : (variants || []).filter((v) => v.variant_type !== "_combinations" && v.is_available !== false);

  if (active.length === 0) {
    const hasDisc = !!(originalPrice && originalPrice < basePrice);
    return {
      saleMin: effectiveBase, saleMax: effectiveBase,
      origMin: hasDisc ? basePrice : null, origMax: hasDisc ? basePrice : null,
      maxDiscPct: hasDisc ? Math.round((1 - effectiveBase / basePrice) * 100) : 0,
    };
  }

  const salePrices = active.map((v) => {
    if (v.price != null) return (v.original_price != null && v.original_price < v.price) ? v.original_price : v.price;
    return effectiveBase + (v.price_modifier || 0);
  });
  const fullPrices = active.map((v) => {
    if (v.price != null) return v.price;
    return basePrice + (v.price_modifier || 0);
  });
  const anyHasDisc = active.some((v) => v.price != null && v.original_price != null && v.original_price < v.price);
  const maxDiscPct = anyHasDisc
    ? Math.max(...active.map((v) => {
        if (v.price != null && v.original_price != null && v.original_price < v.price)
          return Math.round((1 - v.original_price / v.price) * 100);
        return 0;
      }))
    : 0;

  return {
    saleMin: Math.min(...salePrices), saleMax: Math.max(...salePrices),
    origMin: anyHasDisc ? Math.min(...fullPrices) : null,
    origMax: anyHasDisc ? Math.max(...fullPrices) : null,
    maxDiscPct,
  };
}

export default function ProductCard({ product, formatPrice, formatSoldCount, onClick }: ProductCardProps) {
  const { saleMin, saleMax, origMin, origMax, maxDiscPct } = computePriceInfo(product.price, product.original_price, product.variants);
  const hasRange = saleMin !== saleMax;
  const hasDiscount = maxDiscPct > 0;
  const origRange = origMin != null && origMax != null;

  const allVars = product.variants || [];
  const comboVariants = allVars.filter((v) => v.variant_type === "_combinations");
  const realVariants = allVars.filter((v) => v.variant_type !== "_combinations");
  // Multi-level products: real stock lives in `_combinations` rows. Series/Ukuran
  // rows are display-only labels with stock=0, so summing them gives a false 0.
  const stockSourceVariants = comboVariants.length > 0 ? comboVariants : realVariants;
  const availableVariants = stockSourceVariants.filter((v) => v.is_available !== false);
  const allVariantsUnavailable = stockSourceVariants.length > 0 && availableVariants.length === 0;
  const totalStock = availableVariants.length > 0
    ? availableVariants.reduce((s, v) => s + (v.stock ?? 0), 0)
    : stockSourceVariants.length === 0 ? (product.stock ?? null) : 0;
  const isOutOfStock = allVariantsUnavailable || (totalStock != null && totalStock === 0);

  return (
    <div
      className={`bg-white rounded-lg border overflow-hidden transition ${isOutOfStock ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:shadow-md"}`}
      onClick={isOutOfStock ? undefined : onClick}
      data-testid={`product-card-${product.slug}`}
    >
      <div className="aspect-square relative">
        <img
          src={product.primary_image || "/images/placeholder.svg"}
          alt={product.name}
          className="w-full h-full object-cover"
          loading="lazy"
          onError={(e) => { (e.currentTarget as HTMLImageElement).src = "/images/placeholder.svg"; }}
        />
        {hasDiscount && !isOutOfStock && (
          <span className="absolute top-2 left-2 bg-red-500 text-white text-xs px-1.5 py-0.5 rounded">{maxDiscPct}%</span>
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
          {hasRange ? `${formatPrice(saleMin)} - ${formatPrice(saleMax)}` : formatPrice(saleMin)}
        </p>
        {origRange && !isOutOfStock && (
          <p className="text-xs text-gray-400 line-through">
            {origMin !== origMax ? `${formatPrice(origMin!)} - ${formatPrice(origMax!)}` : formatPrice(origMin!)}
          </p>
        )}
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
