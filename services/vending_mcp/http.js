import { createServer } from "node:http";
import { once } from "node:events";

const MAX_BODY_BYTES = 8192;

export async function startPaywall(handler, port = 0) {
  const server = createServer({ requestTimeout: 15_000 }, async (incoming, outgoing) => {
    try {
      const url = new URL(incoming.url, origin);
      if (url.origin !== origin) {
        outgoing.writeHead(400).end();
        return;
      }
      const chunks = [];
      let size = 0;
      for await (const chunk of incoming) {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
          outgoing.writeHead(413, { connection: "close" }).end();
          return;
        }
        chunks.push(chunk);
      }
      const response = await handler(new Request(url, {
        method: incoming.method, headers: incoming.headers,
        body: size ? Buffer.concat(chunks) : undefined,
      }));
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch {
      if (!outgoing.headersSent) outgoing.writeHead(500, { "cache-control": "no-store" });
      outgoing.end();
    }
  });
  server.listen(port, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { origin, close: () => new Promise((resolve) => server.close(resolve)) };
}
