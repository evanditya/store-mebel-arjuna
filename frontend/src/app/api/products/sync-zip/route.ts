export const maxDuration = 300;

export async function POST(request: Request) {
  const cookie = request.headers.get("cookie") || "";
  const contentType = request.headers.get("content-type") || "";

  try {
    const backendRes = await fetch("http://127.0.0.1:8000/api/products/sync-zip", {
      method: "POST",
      headers: {
        "content-type": contentType,
        cookie,
      },
      body: request.body,
      // @ts-ignore
      duplex: "half",
    });

    const data = await backendRes.json();
    return Response.json(data, { status: backendRes.status });
  } catch (err) {
    return Response.json({ error: "Gagal terhubung ke backend: " + String(err) }, { status: 500 });
  }
}
