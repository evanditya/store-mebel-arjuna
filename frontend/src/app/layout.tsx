import type { Metadata } from "next";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  try {
    const res = await fetch("http://127.0.0.1:8000/api/branding", {
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      const name = data.site_name || data.seller_name || "Toko Online";
      return {
        title: name,
        description: `${name} - Toko Online`,
      };
    }
  } catch {
  }
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
