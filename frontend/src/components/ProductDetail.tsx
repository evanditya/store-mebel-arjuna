"use client";

import { useState, useMemo } from "react";

interface Variant { variant_type: string; variant_name: string; price: number | null; original_price: number | null; price_modifier: number; stock: number; is_available: boolean; }
interface Specification { name: string; value: string; }
interface Product { name: string; slug: string; price: number; original_price: number | null; category: string; description: string; description_images?: string[]; specifications?: Specification[]; sold_count: number; stock: number; rating: number; primary_image: string; images: string[]; variants: Variant[]; }
interface ProductDetailProps { product: Product; formatPrice: (price: number) => string; formatSoldCount: (count: number) => string; onClose: () => void; onAddToCart: (product: Product, variantName?: string, quantity?: number) => void; }

function getVariantEffectivePrice(v: Variant, basePrice: number): number {
  if (v.price != null) {
    return (v.original_price != null && v.original_price < v.price) ? v.original_price : v.price;
  }
  return basePrice + (v.price_modifier || 0);
}

function getVariantOriginalAbsPrice(v: Variant): number | null {
  if (v.price != null && v.original_price != null && v.original_price < v.price) return v.price;
  return null;
}

function getVariantPrice(v: Variant, basePrice: number): number {
  return getVariantEffectivePrice(v, basePrice);
}

function getEffectiveBase(price: number, originalPrice: number | null): number {
  return (originalPrice && originalPrice < price) ? originalPrice : price;
}

export default function ProductDetail({ product, formatPrice, formatSoldCount, onClose, onAddToCart }: ProductDetailProps) {
  const [selectedImage, setSelectedImage] = useState(0);
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  const hasDiscount = !!(product.original_price && product.original_price < product.price);
  const effectiveBase = getEffectiveBase(product.price, product.original_price);
  const [quantity, setQuantity] = useState(1);
  const PLACEHOLDER = "/images/placeholder.svg";
  const rawImages = product.images.length > 0 ? product.images : [product.primary_image];
  const images = rawImages.map((img) => img || PLACEHOLDER);

  // Detect new multi-group format: variant_type contains " / " (e.g. "Warna / Ukuran")
  const isNewCombinationFormat = useMemo(() => {
    const all = product.variants.filter((v) => v.variant_type !== "_combinations");
    return all.length > 0 && (all[0].variant_type || "").includes(" / ");
  }, [product.variants]);

  // For new format: derive per-group display options + treat all variants as combinations.
  // For old format: use existing logic (displayVariants per type, combinations via "_combinations" type).
  const { displayVariants, combinations } = useMemo(() => {
    if (!isNewCombinationFormat) {
      return {
        displayVariants: product.variants.filter((v) => v.variant_type !== "_combinations" && v.is_available !== false),
        combinations: product.variants.filter((v) => v.variant_type === "_combinations"),
      };
    }
    const allVars = product.variants.filter((v) => v.variant_type !== "_combinations");
    if (allVars.length === 0) return { displayVariants: [], combinations: [] };
    const typeNames = allVars[0].variant_type.split(" / ");
    const seen = new Set<string>();
    const dpv: Variant[] = [];
    typeNames.forEach((typeName, idx) => {
      allVars.forEach((v) => {
        const val = (v.variant_name.split(" / ")[idx] || "").trim();
        if (!val) return;
        const key = `${typeName}___${val}`;
        if (!seen.has(key)) {
          seen.add(key);
          const isAvail = allVars.some((cv) => {
            const p = cv.variant_name.split(" / ");
            return (p[idx] || "").trim() === val && cv.is_available !== false;
          });
          dpv.push({ variant_type: typeName, variant_name: val, price: null, original_price: null, price_modifier: 0, stock: 0, is_available: isAvail });
        }
      });
    });
    const combs = allVars.map((v) => ({ ...v, variant_type: "_combinations" }));
    return { displayVariants: dpv, combinations: combs };
  }, [isNewCombinationFormat, product.variants]);

  const variantTypes = useMemo(() => {
    const types: string[] = [];
    const seen = new Set<string>();
    for (const v of displayVariants) {
      const t = v.variant_type || "Pilihan";
      if (!seen.has(t)) { seen.add(t); types.push(t); }
    }
    return types;
  }, [displayVariants]);

  const variantsByType = useMemo(() => {
    const groups: Record<string, Variant[]> = {};
    for (const v of displayVariants) {
      const type = v.variant_type || "Pilihan";
      if (!groups[type]) groups[type] = [];
      groups[type].push(v);
    }
    return groups;
  }, [displayVariants]);

  const findMatchingCombo = useMemo(() => {
    return (selectedNames: string[]): Variant | null => {
      if (combinations.length === 0 || selectedNames.length < variantTypes.length || variantTypes.length <= 1) return null;
      const comboName = variantTypes.map((t) => selectedVariants[t]).join(" / ");
      const match = combinations.find((c) => c.variant_name === comboName);
      if (match) return match;
      const reverseComboName = variantTypes.map((t) => selectedVariants[t]).reverse().join(" / ");
      const reverseMatch = combinations.find((c) => c.variant_name === reverseComboName);
      if (reverseMatch) return reverseMatch;
      for (const c of combinations) {
        const parts = c.variant_name.split(" / ").map((s: string) => s.trim());
        if (selectedNames.every((n) => parts.includes(n)) && parts.every((p: string) => selectedNames.includes(p))) return c;
      }
      return null;
    };
  }, [combinations, variantTypes, selectedVariants]);

  const matchedCombo = useMemo(() => {
    const selectedNames = variantTypes.map((t) => selectedVariants[t]).filter(Boolean);
    return findMatchingCombo(selectedNames);
  }, [findMatchingCombo, variantTypes, selectedVariants]);

  const displayPrice = useMemo(() => {
    const selectedNames = variantTypes.map((t) => selectedVariants[t]).filter(Boolean);
    if (matchedCombo) {
      if (!matchedCombo.is_available) return effectiveBase;
      return getVariantPrice(matchedCombo, effectiveBase);
    }
    if (selectedNames.length === 1) {
      const selected = displayVariants.find((v) => v.variant_name === selectedNames[0]);
      if (selected) {
        if (!selected.is_available) return effectiveBase;
        return getVariantPrice(selected, effectiveBase);
      }
    }
    return effectiveBase;
  }, [selectedVariants, matchedCombo, displayVariants, variantTypes, effectiveBase]);

  const displayStrikePrice = useMemo(() => {
    const selectedNames = variantTypes.map((t) => selectedVariants[t]).filter(Boolean);
    if (matchedCombo && matchedCombo.is_available) {
      const absOrig = getVariantOriginalAbsPrice(matchedCombo);
      if (absOrig != null) return absOrig;
      // Variant has its own absolute price but no variant-level discount →
      // don't fall through to product-level discount; the variant price stands alone.
      if (matchedCombo.price != null) return null;
    }
    if (selectedNames.length === 1) {
      const selected = displayVariants.find((v) => v.variant_name === selectedNames[0]);
      if (selected && selected.is_available) {
        const absOrig = getVariantOriginalAbsPrice(selected);
        if (absOrig != null) return absOrig;
        if (selected.price != null) return null;
      }
    }
    if (hasDiscount) return product.price;
    return null;
  }, [selectedVariants, matchedCombo, displayVariants, variantTypes, hasDiscount, product.price]);

  const hasDifferentPrices = useMemo(() => {
    // For new combination format, check across combinations
    const pool = isNewCombinationFormat
      ? combinations.filter((c) => c.is_available)
      : displayVariants.filter((v) => v.is_available);
    if (pool.length <= 1) return false;
    const prices = pool.map((v) => getVariantPrice(v, effectiveBase));
    return new Set(prices).size > 1;
  }, [isNewCombinationFormat, combinations, displayVariants, effectiveBase]);

  const strikeRange = useMemo(() => {
    const pool = isNewCombinationFormat ? combinations : displayVariants;
    const active = pool.filter((v) => v.is_available);
    if (active.length === 0) return hasDiscount ? { min: product.price, max: product.price } : null;
    const fullPrices = active.map((v) => (v.price != null ? v.price : product.price + (v.price_modifier || 0)));
    const salePrices = active.map((v) => getVariantPrice(v, effectiveBase));
    const anyDisc = active.some((_, i) => fullPrices[i] > salePrices[i]);
    if (!anyDisc) return null;
    return { min: Math.min(...fullPrices), max: Math.max(...fullPrices) };
  }, [isNewCombinationFormat, combinations, displayVariants, hasDiscount, product.price, effectiveBase]);

  const priceRange = useMemo(() => {
    if (combinations.length > 0) {
      const available = combinations.filter((c) => c.is_available);
      if (available.length > 0) {
        const prices = available.map((c) => getVariantPrice(c, effectiveBase));
        return { min: Math.min(...prices), max: Math.max(...prices) };
      }
    }
    if (displayVariants.length > 0) {
      const available = displayVariants.filter((v) => v.is_available);
      if (available.length > 0) {
        const prices = available.map((v) => getVariantPrice(v, effectiveBase));
        return { min: Math.min(...prices), max: Math.max(...prices) };
      }
    }
    return { min: effectiveBase, max: effectiveBase };
  }, [combinations, displayVariants, effectiveBase]);

  const isOptionAvailableInCombos = useMemo(() => {
    if (combinations.length === 0 || variantTypes.length <= 1) return (_type: string, _name: string) => true;
    return (type: string, optName: string) => {
      const typeIndex = variantTypes.indexOf(type);
      if (typeIndex === -1) return true;
      // Use `includes` instead of strict position — combo names may store parts
      // in a different order than variantTypes (e.g. combos = "Set / size" but
      // variantTypes = ["size","Set"]). Variant names are unique across types.
      const relevantCombos = combinations.filter((c) => {
        const parts = c.variant_name.split(" / ").map((s: string) => s.trim());
        return parts.includes(optName);
      });
      if (relevantCombos.length === 0) return true;
      const otherSelected = variantTypes.filter((t) => t !== type).map((t) => selectedVariants[t]).filter(Boolean);
      if (otherSelected.length === 0) {
        return relevantCombos.some((c) => c.is_available);
      }
      const matchingCombos = relevantCombos.filter((c) => {
        const parts = c.variant_name.split(" / ").map((s: string) => s.trim());
        return otherSelected.every((sel) => parts.includes(sel));
      });
      if (matchingCombos.length === 0) return true;
      return matchingCombos.some((c) => c.is_available);
    };
  }, [combinations, variantTypes, selectedVariants]);

  const comboUnavailable = useMemo(() => {
    if (!matchedCombo) return false;
    return !matchedCombo.is_available;
  }, [matchedCombo]);

  const allVariantsSelected = variantTypes.length === 0 || variantTypes.every((t) => t in selectedVariants);

  const selectedVariantObj = useMemo(() => {
    const selectedNames = variantTypes.map((t) => selectedVariants[t]).filter(Boolean);
    if (matchedCombo) return matchedCombo.is_available ? matchedCombo : null;
    if (selectedNames.length === 1) {
      return displayVariants.find((v) => v.variant_name === selectedNames[0]) ?? null;
    }
    return null;
  }, [matchedCombo, selectedVariants, variantTypes, displayVariants]);

  const displayStock = useMemo(() => {
    if (displayVariants.length === 0) return product.stock;
    if (allVariantsSelected && !comboUnavailable && selectedVariantObj != null) return selectedVariantObj.stock;
    return null;
  }, [displayVariants.length, allVariantsSelected, comboUnavailable, selectedVariantObj, product.stock]);

  const canAddToCart = allVariantsSelected && !comboUnavailable && (displayStock == null || displayStock > 0);
  const missingVariants = variantTypes.filter((t) => !(t in selectedVariants));

  const combinedVariantName = variantTypes.map((t) => selectedVariants[t]).filter(Boolean).join(" / ") || undefined;

  const handleSelectVariant = (type: string, name: string) => {
    setSelectedVariants((prev) => {
      if (prev[type] === name) {
        const next = { ...prev };
        delete next[type];
        return next;
      }
      return { ...prev, [type]: name };
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" data-testid="product-detail-modal">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white w-full max-w-lg rounded-t-2xl max-h-[90vh] flex flex-col animate-fade-in">
        <div className="flex-1 overflow-y-auto p-4 pb-24">
          <button onClick={onClose} className="absolute top-3 right-3 z-10 w-8 h-8 bg-white rounded-full shadow flex items-center justify-center" data-testid="button-close-detail">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          <div className="aspect-square rounded-lg overflow-hidden mb-3"><img src={images[selectedImage]} alt={product.name} className="w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).src = PLACEHOLDER; }} /></div>
          {images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto mb-4">
              {images.map((img, i) => (<button key={i} onClick={() => setSelectedImage(i)} className={`w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 border-2 ${i === selectedImage ? "border-gray-900" : "border-transparent"}`}><img src={img} alt="" className="w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).src = PLACEHOLDER; }} /></button>))}
            </div>
          )}
          <h2 className="text-lg font-bold mb-1">{product.name}</h2>
          {allVariantsSelected && !comboUnavailable ? (
            <p className="text-2xl font-bold text-red-600 mb-1">{formatPrice(displayPrice)}</p>
          ) : priceRange.min !== priceRange.max ? (
            <p className="text-2xl font-bold text-red-600 mb-1">{formatPrice(priceRange.min)} – {formatPrice(priceRange.max)}</p>
          ) : (
            <p className="text-2xl font-bold text-red-600 mb-1">{formatPrice(priceRange.min)}</p>
          )}
          {allVariantsSelected && !comboUnavailable && displayStrikePrice != null && (
            <p className="text-sm text-gray-400 line-through mb-2">{formatPrice(displayStrikePrice)}</p>
          )}
          {(!allVariantsSelected || comboUnavailable) && strikeRange != null && (
            <p className="text-sm text-gray-400 line-through mb-2">
              {strikeRange.min !== strikeRange.max
                ? `${formatPrice(strikeRange.min)} – ${formatPrice(strikeRange.max)}`
                : formatPrice(strikeRange.min)}
            </p>
          )}
          {comboUnavailable && <p className="text-sm text-orange-500 mb-1">Kombinasi ini tidak tersedia, menggunakan harga dasar</p>}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <p className="text-sm text-gray-500">{formatSoldCount(product.sold_count)}</p>
            {displayStock != null && (
              displayStock === 0 ? (
                <span className="text-xs font-semibold text-red-500 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">Stok Habis</span>
              ) : displayStock <= 5 ? (
                <span className="text-xs font-semibold text-orange-600 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">Sisa {displayStock}</span>
              ) : (
                <span className="text-xs text-gray-400">Stok: {displayStock}</span>
              )
            )}
            {displayStock == null && displayVariants.length > 0 && (
              <span className="text-xs text-gray-400">Pilih varian untuk melihat stok</span>
            )}
          </div>
          {displayVariants.length > 0 && (
            <div className="mb-4">
              {variantTypes.map((type) => (
                <div key={type} className="mb-3">
                  <p className="text-sm font-medium mb-2">{type}:</p>
                  <div className="flex flex-wrap gap-2">
                    {(variantsByType[type] || []).map((v) => {
                      const vPrice = getVariantPrice(v, product.price);
                      const showPrice = v.is_available && hasDifferentPrices && vPrice !== product.price && variantTypes.length === 1;
                      const isSelected = selectedVariants[type] === v.variant_name;
                      const comboAvailable = isOptionAvailableInCombos(type, v.variant_name);
                      const effectiveAvailable = v.is_available && comboAvailable;
                      // For multi-level products, derive per-option stock from matching combinations
                      // because the Series/Ukuran display rows always have stock=0.
                      let effectiveStock = v.stock ?? 0;
                      if (combinations.length > 0 && variantTypes.length > 1) {
                        const matching = combinations.filter((c) => {
                          const parts = c.variant_name.split(" / ").map((s: string) => s.trim());
                          return parts.includes(v.variant_name) && c.is_available;
                        });
                        effectiveStock = matching.reduce((s, c) => s + (c.stock ?? 0), 0);
                      }
                      const stockLabel = isNewCombinationFormat || !effectiveAvailable ? null : effectiveStock === 0 ? "Habis" : effectiveStock <= 5 ? `Sisa ${effectiveStock}` : null;
                      return (
                        <button
                          key={v.variant_name}
                          onClick={() => effectiveAvailable && handleSelectVariant(type, v.variant_name)}
                          disabled={!effectiveAvailable}
                          className={`px-3 py-1.5 rounded-lg text-sm border transition text-left ${!effectiveAvailable ? "border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed line-through" : isSelected ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 hover:border-gray-400"}`}
                          data-testid={`button-variant-${v.variant_name}`}
                        >
                          <span>{v.variant_name}</span>
                          {showPrice && <span className="block text-xs opacity-75">{formatPrice(vPrice)}</span>}
                          {stockLabel && (
                            <span className={`block text-xs ${isSelected ? "opacity-75" : v.stock === 0 ? "text-red-400" : "text-orange-500"}`}>{stockLabel}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="mb-4">
            <p className="text-sm font-medium mb-2">Jumlah:</p>
            <div className="flex items-center gap-3">
              <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-8 h-8 rounded border flex items-center justify-center" data-testid="button-qty-decrease">-</button>
              <span className="w-8 text-center">{quantity}</span>
              <button
                onClick={() => setQuantity(displayStock != null ? Math.min(displayStock, quantity + 1) : quantity + 1)}
                disabled={displayStock != null && quantity >= displayStock}
                className="w-8 h-8 rounded border flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
                data-testid="button-qty-increase"
              >+</button>
            </div>
          </div>
          {product.specifications && product.specifications.length > 0 && (
            <div className="mb-4" data-testid="section-specifications">
              <p className="text-sm font-medium mb-2">Spesifikasi:</p>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <tbody>
                    {product.specifications.map((spec, i) => (
                      <tr key={i} className={i % 2 === 0 ? "bg-gray-50" : "bg-white"}>
                        <td className="px-3 py-2 text-gray-500 font-medium w-1/3 border-r">{spec.name}</td>
                        <td className="px-3 py-2 text-gray-700">{spec.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {product.description && (
            <div className="mb-4" data-testid="section-description">
              <p className="text-sm font-medium mb-2">Deskripsi:</p>
              <p className="text-sm text-gray-600 whitespace-pre-line">{product.description.trim().replace(/\n{3,}/g, "\n\n")}</p>
            </div>
          )}
          {product.description_images && product.description_images.length > 0 && (
            <div className="mb-4" data-testid="section-description-images">
              <div className="space-y-2">
                {product.description_images.map((imgUrl, i) => (
                  <img key={i} src={imgUrl} alt={`${product.name} detail ${i + 1}`} className="w-full rounded-lg" loading="lazy" />
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="absolute bottom-0 left-0 right-0 bg-white border-t p-4">
          {!canAddToCart && missingVariants.length > 0 && (
            <p className="text-xs text-orange-500 text-center mb-2">
              Pilih <strong>{missingVariants.join(", ")}</strong> terlebih dahulu
            </p>
          )}
          <button
            onClick={() => canAddToCart && onAddToCart(product, combinedVariantName, quantity)}
            disabled={!canAddToCart}
            className={`w-full py-3 rounded-lg font-medium transition ${canAddToCart ? "bg-gray-900 text-white hover:bg-gray-800 cursor-pointer" : "bg-gray-200 text-gray-400 cursor-not-allowed"}`}
            data-testid="button-add-to-cart"
          >
            {canAddToCart
              ? `Tambah ke Keranjang${allVariantsSelected ? ` - ${formatPrice(displayPrice * quantity)}` : ""}`
              : `Pilih ${missingVariants[0] || "Varian"} Terlebih Dahulu`}
          </button>
        </div>
      </div>
    </div>
  );
}
