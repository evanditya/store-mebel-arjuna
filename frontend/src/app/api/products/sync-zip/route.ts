import http from "http";

export const maxDuration = 300;

export async function POST(request: Request) {
  const cookie = request.headers.get("cookie") || "";
  const contentType = request.headers.get("content-type") || "";
  const contentLength = request.headers.get("content-length") || "";

  return new Promise<Response>((resolve) => {
    const options: http.RequestOptions = {
      hostname: "127.0.0.1",
      port: 8000,
      path: "/api/products/sync-zip",
      method: "POST",
      headers: {
        "content-type": contentType,
        cookie,
        ...(contentLength ? { "content-length": contentLength } : {}),
      },
    };

    const backendReq = http.request(options, (backendRes) => {
      const isSSE = (backendRes.headers["content-type"] || "").includes("text/event-stream");

      if (isSSE) {
        const stream = new ReadableStream({
          start(controller) {
            backendRes.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
            backendRes.on("end", () => controller.close());
            backendRes.on("error", (err) => controller.error(err));
          },
        });
        resolve(new Response(stream, {
          status: backendRes.statusCode ?? 200,
          headers: {
            "content-type": "text/event-stream",
            "cache-control": "no-cache",
            "x-accel-buffering": "no",
          },
        }));
      } else {
        let body = "";
        backendRes.on("data", (chunk: Buffer) => (body += chunk.toString()));
        backendRes.on("end", () => {
          try {
            resolve(Response.json(JSON.parse(body), { status: backendRes.statusCode ?? 200 }));
          } catch {
            resolve(Response.json({ error: body }, { status: backendRes.statusCode ?? 500 }));
          }
        });
      }
    });

    backendReq.on("error", (err) => {
      resolve(Response.json({ error: "Backend tidak dapat dihubungi: " + err.message }, { status: 502 }));
    });

    if (request.body) {
      const reader = request.body.getReader();
      const pump = () => {
        reader.read().then(({ done, value }) => {
          if (done) {
            backendReq.end();
          } else {
            backendReq.write(Buffer.from(value));
            pump();
          }
        }).catch((err) => {
          backendReq.destroy(err);
          resolve(Response.json({ error: "Gagal membaca file: " + err.message }, { status: 500 }));
        });
      };
      pump();
    } else {
      backendReq.end();
    }
  });
}
