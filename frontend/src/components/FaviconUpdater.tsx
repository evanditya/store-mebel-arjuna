"use client";

import { useEffect } from "react";

export default function FaviconUpdater() {
  useEffect(() => {
    const setFavicon = (href: string) => {
      const rels = ["icon", "shortcut icon", "apple-touch-icon", "apple-touch-icon-precomposed"];
      rels.forEach((rel) => {
        const existing = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
        if (existing) {
          existing.href = href;
        } else {
          const link = document.createElement("link");
          link.rel = rel;
          link.href = href;
          document.head.appendChild(link);
        }
      });
    };

    fetch("/api/branding")
      .then((r) => r.json())
      .then((data) => {
        const favicon: string = data.favicon || "";
        const version: string = data.favicon_version || String(Date.now());
        if (favicon) {
          // Use the proxy route so Safari always gets no-cache headers,
          // but add a version param so browsers invalidate their in-memory copy
          setFavicon(`/api/favicon?v=${version}`);
        }
      })
      .catch(() => {});
  }, []);

  return null;
}
