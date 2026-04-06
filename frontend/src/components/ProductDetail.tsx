"use client";

import { useState, useMemo } from "react";

interface Variant { variant_type: string; variant_name: string; price: number | null; price_modifier: number; stock: number; is_available: boolean; }
interface Specification { name: string; value: string; }
interface Product { name: string; slug: string; price: number; original_price: number | null; category: string; description: string; description_images?: string[]; specifications?: Specification[]; sold_count: number; stock: number; rating: number; primary_image: string; images: string[]; variants: Variant[]; }
interface ProductDetailProps { product: Product; formatPrice: (price: number) => string; formatSoldCount: (count: number) => string; onClose: () => void; onAddToCart: (product: Product, variantName?: string, quantity?: number) => void; }

function getVariantPrice(v: Variant, basePrice: number): number {
  if (v.price != null) return v.price;
  return basePrice + (v.price_modifier || 0);
}

export default function ProductDetail({ product, formatPrice, formatSoldCount, onClose, onAddToCart }: ProductDetailProps) {
  const [selectedImage, setSelectedImage] = useState(0);
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState(1);
  const images = product.images.length > 0 ? product.images : [product.primary_image];

  const displayVariants = useMemo(() => product.variants.filter((v) => v.variant_type !== "_combinations"), [product.variants]);
  const combinations = useMemo(() => product.variants.filter((v) => v.variant_type === "_combinations"), [product.variants]);

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
      if (!matchedCombo.is_available) {
        return product.price;
      }
      if (matchedCombo.price != null) return matchedCombo.price;
    }
    if (selectedNames.length === 1) {
      const selected = displayVariants.find((v) => v.variant_name === selectedNames[0]);
      if (selected) {
        if (!selected.is_available) return product.price;
        return getVariantPrice(selected, product.price);
      }
    }
    return product.price;
  }, [selectedVariants, matchedCombo, displayVariants, variantTypes, product.price]);

  const hasDifferentPrices = useMemo(() => {
    if (displayVariants.length <= 1) return false;
    const prices = displayVariants.filter((v) => v.is_available).map((v) => getVariantPrice(v, product.price));
    return new Set(prices).size > 1;
  }, [displayVariants, product.price]);

  const isOptionAvailableInCombos = useMemo(() => {
    if (combinations.length === 0 || variantTypes.length <= 1) return (_type: string, _name: string) => true;
    return (type: string, optName: string) => {
      const typeIndex = variantTypes.indexOf(type);
      if (typeIndex === -1) return true;
      const relevantCombos = combinations.filter((c) => {
        const parts = c.variant_name.split(" / ").map((s: string) => s.trim());
        return parts[typeIndex] === optName;
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
          <div className="aspect-square rounded-lg overflow-hidden mb-3"><img src={images[selectedImage]} alt={product.name} className="w-full h-full object-cover" /></div>
          {images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto mb-4">
              {images.map((img, i) => (<button key={i} onClick={() => setSelectedImage(i)} className={`w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 border-2 ${i === selectedImage ? "border-gray-900" : "border-transparent"}`}><img src={img} alt="" className="w-full h-full object-cover" /></button>))}
            </div>
          )}
          <h2 className="text-lg font-bold mb-1">{product.name}</h2>
          <p className="text-2xl font-bold text-red-600 mb-1">{formatPrice(displayPrice)}</p>
          {product.original_price && product.original_price > displayPrice && <p className="text-sm text-gray-400 line-through mb-2">{formatPrice(product.original_price)}</p>}
          {comboUnavailable && <p className="text-sm text-orange-500 mb-1">Kombinasi ini tidak tersedia, menggunakan harga dasar</p>}
          <p className="text-sm text-gray-500 mb-4">{formatSoldCount(product.sold_count)}</p>
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
                      return (
                        <button
                          key={v.variant_name}
                          onClick={() => effectiveAvailable && handleSelectVariant(type, v.variant_name)}
                          disabled={!effectiveAvailable}
                          className={`px-3 py-1.5 rounded-lg text-sm border transition ${!effectiveAvailable ? "border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed line-through" : isSelected ? "border-gray-900 bg-gray-900 text-white" : "border-gray-200 hover:border-gray-400"}`}
                          data-testid={`button-variant-${v.variant_name}`}
                        >
                          <span>{v.variant_name}</span>
                          {showPrice && <span className="block text-xs opacity-75">{formatPrice(vPrice)}</span>}
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
              <button onClick={() => setQuantity(quantity + 1)} className="w-8 h-8 rounded border flex items-center justify-center" data-testid="button-qty-increase">+</button>
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
          <button onClick={() => onAddToCart(product, combinedVariantName, quantity)} className="w-full bg-gray-900 text-white py-3 rounded-lg font-medium hover:bg-gray-800 transition" data-testid="button-add-to-cart">Tambah ke Keranjang - {formatPrice(displayPrice * quantity)}</button>
        </div>
      </div>
    </div>
  );
}
