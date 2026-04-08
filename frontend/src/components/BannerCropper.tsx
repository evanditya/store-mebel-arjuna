"use client";

import { useRef, useState, useEffect } from "react";
import "cropperjs/dist/cropper.css";

interface Props {
  onComplete: (url: string) => void;
  onClose: () => void;
}

export default function BannerCropper({ onComplete, onClose }: Props) {
  const imageRef = useRef<HTMLImageElement>(null);
  const cropperRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [cropperReady, setCropperReady] = useState(false);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setImageSrc(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (!imageSrc || !imageRef.current) return;
    let instance: any;
    import("cropperjs").then((mod) => {
      const Cropper = mod.default;
      if (cropperRef.current) {
        cropperRef.current.destroy();
        cropperRef.current = null;
      }
      setCropperReady(false);
      instance = new Cropper(imageRef.current!, {
        aspectRatio: 3,
        viewMode: 1,
        dragMode: "move",
        autoCropArea: 1,
        responsive: true,
        guides: false,
        center: true,
        highlight: false,
        cropBoxMovable: false,
        cropBoxResizable: false,
        toggleDragModeOnDblclick: false,
        ready() {
          setCropperReady(true);
        },
      });
      cropperRef.current = instance;
    });
    return () => {
      instance?.destroy();
      cropperRef.current = null;
    };
  }, [imageSrc]);

  const handleUpload = async () => {
    if (!cropperRef.current || !cropperReady) return;
    setUploading(true);
    try {
      const canvas = cropperRef.current.getCroppedCanvas({ width: 1200, height: 400 });
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b: Blob | null) => (b ? resolve(b) : reject(new Error("blob null"))), "image/jpeg", 0.92);
      });
      const fd = new FormData();
      fd.append("file", blob, "banner.jpg");
      const res = await fetch("/api/banners/upload", { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) throw new Error("Upload gagal");
      const data = await res.json();
      if (data.url) onComplete(data.url);
      else throw new Error("URL tidak ada");
    } catch (err: any) {
      alert("Gagal mengupload: " + (err.message || "kesalahan tidak diketahui"));
    }
    setUploading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center px-6 py-4 border-b flex-shrink-0">
          <div>
            <h3 className="font-bold text-lg">Upload Banner</h3>
            <p className="text-xs text-gray-500 mt-0.5">Crop otomatis rasio 3:1 → hasil 1200 × 400 px</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900 transition text-2xl font-light leading-none">×</button>
        </div>

        <div className="p-6 flex-1 overflow-auto">
          {!imageSrc ? (
            <div
              className="border-2 border-dashed border-gray-300 rounded-xl p-16 text-center cursor-pointer hover:border-gray-500 hover:bg-gray-50 transition"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file && file.type.startsWith("image/")) {
                  const reader = new FileReader();
                  reader.onload = (ev) => setImageSrc(ev.target?.result as string);
                  reader.readAsDataURL(file);
                }
              }}
            >
              <div className="text-4xl mb-3">🖼️</div>
              <p className="text-gray-600 font-medium mb-1">Klik atau drag gambar ke sini</p>
              <p className="text-xs text-gray-400">PNG, JPG, WEBP — disarankan lebih dari 1200 × 400 px</p>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
            </div>
          ) : (
            <>
              <div className="rounded-xl overflow-hidden border bg-gray-100" style={{ maxHeight: "340px" }}>
                <img
                  ref={imageRef}
                  src={imageSrc}
                  alt="crop preview"
                  style={{ display: "block", maxWidth: "100%" }}
                />
              </div>
              <p className="text-xs text-gray-500 mt-3">
                Geser atau zoom gambar untuk mengatur posisi. Kotak crop (rasio 3:1) sudah dikunci — tidak bisa diubah ukurannya.
              </p>
            </>
          )}
        </div>

        {imageSrc && (
          <div className="px-6 py-4 border-t flex-shrink-0 flex gap-3 justify-end">
            <button
              onClick={() => { setImageSrc(null); setCropperReady(false); if (fileInputRef.current) fileInputRef.current.value = ""; }}
              className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50 transition"
            >
              Ganti Gambar
            </button>
            <button
              onClick={handleUpload}
              disabled={uploading || !cropperReady}
              className="px-5 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50"
            >
              {uploading ? "Mengupload..." : !cropperReady ? "Memuat..." : "Crop & Upload"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
