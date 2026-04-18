import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const brandingRes = await fetch("http://127.0.0.1:8000/api/branding", {
      cache: "no-store",
    });
    if (!brandingRes.ok) throw new Error("branding fetch failed");
    const data = await brandingRes.json();
    const faviconPath: string = data.favicon || "";

    if (!faviconPath) {
      return new NextResponse(null, { status: 204 });
    }

    const imageUrl = faviconPath.startsWith("http")
      ? faviconPath
      : `http://127.0.0.1:8000${faviconPath}`;

    const imageRes = await fetch(imageUrl, { cache: "no-store" });
    if (!imageRes.ok) throw new Error("image fetch failed");

    const contentType =
      imageRes.headers.get("content-type") || "image/png";
    const buffer = await imageRes.arrayBuffer();

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  } catch {
    return new NextResponse(null, { status: 204 });
  }
}
