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
      let body = "";
      backendRes.on("data", (chunk) => (body += chunk));
      backendRes.on("end", () => {
        try {
          const json = JSON.parse(body);
          resolve(Response.json(json, { status: backendRes.statusCode ?? 200 }));
        } catch {
          resolve(Response.json({ error: body }, { status: backendRes.statusCode ?? 500 }));
        }
      });
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
