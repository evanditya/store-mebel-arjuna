import type { Metadata } from "next";
import "./globals.css";
import FaviconUpdater from "@/components/FaviconUpdater";

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

      // Always point to the proxy route so Safari gets proper no-cache headers.
      // The ?v= param forces browsers to treat it as a new resource when version changes.
      const faviconHref = favicon ? `/api/favicon?v=${version}` : "";

      return {
        title: name,
        description: `${name} - Toko Online`,
        icons: faviconHref
          ? {
              icon: [
                { url: faviconHref, type: "image/png" },
              ],
              apple: [
                { url: faviconHref, type: "image/png", sizes: "180x180" },
              ],
              other: [
                { rel: "shortcut icon", url: faviconHref },
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
      <body>
        <FaviconUpdater />
        {children}
      </body>
    </html>
  );
}
