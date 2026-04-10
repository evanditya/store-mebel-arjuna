import type { Metadata } from "next";
import "./globals.css";

function getFaviconMimeType(url: string): string {
  const ext = url.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ico: "image/x-icon",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    svg: "image/svg+xml",
    webp: "image/webp",
    gif: "image/gif",
  };
  return map[ext] ?? "image/png";
}

export async function generateMetadata(): Promise<Metadata> {
  try {
    const res = await fetch("http://127.0.0.1:8000/api/branding", {
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      const name = data.site_name || data.seller_name || "Toko Online";
      const favicon: string = data.favicon || "";
      const version: string = data.favicon_version || String(Date.now());
      const faviconHref = favicon ? `${favicon}?v=${version}` : "";
      const mimeType = favicon ? getFaviconMimeType(favicon) : "image/png";

      return {
        title: name,
        description: `${name} - Toko Online`,
        icons: faviconHref
          ? {
              icon: [{ url: faviconHref, type: mimeType }],
              apple: [{ url: faviconHref, type: mimeType }],
              other: [
                { rel: "apple-touch-icon-precomposed", url: faviconHref },
              ],
            }
          : undefined,
      };
    }
  } catch {}
  return {
    title: "Toko Online",
    description: "Toko Online",
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
