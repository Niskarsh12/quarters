import { createHash, timingSafeEqual } from "node:crypto";
import { getLiveSession } from "../../../lib/live-server.js";
import { tools } from "../../../../services/vending_mcp/tools.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "cache-control": "no-store" };
const json = (data, status = 200) => Response.json(data, { status, headers });
const digest = (value) => createHash("sha256").update(value).digest();

function streamPurchase(session, toolId, input) {
  const encoder = new TextEncoder();
  let connected = true;
  return new Response(new ReadableStream({
    async start(controller) {
      const send = (data) => {
        if (connected) controller.enqueue(encoder.encode(`${JSON.stringify(data)}\n`));
      };
      try {
        const payload = await session.purchase(toolId, input, (receipt) => send({ type: "receipt", receipt }));
        send({ type: "result", payload });
      } catch (error) {
        send({ type: "error", error: error.message });
      } finally {
        if (connected) controller.close();
      }
    },
    cancel() {
      connected = false;
    },
  }), { headers: { ...headers, "content-type": "application/x-ndjson", "x-accel-buffering": "no" } });
}

export async function POST(request) {
  const token = process.env.QUARTERS_LIVE_TOKEN;
  if (!token || token.length < 16) return json({ error: "Live Testnet is not configured on this server." }, 503);
  const authorization = request.headers.get("authorization") ?? "";
  if (!timingSafeEqual(digest(authorization), digest(`Bearer ${token}`))) {
    return json({ error: "The Testnet access token is incorrect." }, 401);
  }

  const body = await request.json().catch(() => null);
  if (!["status", "fund", "purchase", "attack"].includes(body?.action)) {
    return json({ error: "Unknown live action." }, 400);
  }
  try {
    const session = await getLiveSession();
    if (body.action === "purchase") {
      const tool = Object.hasOwn(tools, body.toolId) && tools[body.toolId];
      const input = tool && tool.schema.safeParse(body.input);
      if (!input?.success) return json({ error: "Invalid tool or arguments." }, 400);
      return streamPurchase(session, body.toolId, input.data);
    }
    return json(await session[body.action]());
  } catch (error) {
    return json({ error: error.message }, 502);
  }
}
