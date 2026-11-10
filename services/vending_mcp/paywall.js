import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { authenticateHeader, decodeHeader, encodeHeader, isAccount, isProof, QUOTE_SECONDS, termsFor } from "./protocol.js";
import { tools } from "./tools.js";

const json = (body, status, headers) => Response.json(body, {
  status, headers: { "cache-control": "no-store", ...headers },
});

export function createPaywall({ providerId, contractId, verifyPayment, now = Date.now }) {
  if (!isAccount(providerId) || !isAccount(contractId)) throw new Error("Invalid provider or contract account");
  const challenges = new Map();

  return async function handle(request) {
    const path = new URL(request.url).pathname;
    const toolId = path.slice("/tools/".length);
    const tool = Object.hasOwn(tools, toolId) && tools[toolId];
    if (!tool || path !== `/tools/${toolId}`) {
      return json({ error: "Tool not found" }, 404);
    }
    if (request.method !== "POST") return json({ error: "Use POST" }, 405, { allow: "POST" });

    const input = tool.schema.safeParse(await request.json().catch(() => null));
    if (!input.success) return json({ error: "Invalid tool arguments" }, 400);
    const inputKey = JSON.stringify(input.data);

    const timestamp = now();
    for (const [id, quote] of challenges) {
      if (quote.expiresAt <= timestamp && !quote.verification) challenges.delete(id);
    }

    const signature = request.headers.get("payment-signature");
    if (signature === null) {
      if (challenges.size >= 1024) return json({ error: "Too many outstanding quotes" }, 503);
      const challengeId = randomUUID();
      const terms = termsFor({ toolId, amount: tool.amount, providerId, contractId, challengeId });
      challenges.set(challengeId, { terms, inputKey, expiresAt: timestamp + QUOTE_SECONDS * 1000 });
      const required = {
        x402Version: 2,
        resource: { url: request.url, description: tool.description, mimeType: "application/json" },
        accepts: [terms],
      };
      return json({ error: "Payment required" }, 402, {
        "www-authenticate": authenticateHeader(terms),
        "payment-required": encodeHeader(required),
      });
    }

    let payment;
    try {
      payment = decodeHeader(signature);
    } catch {
      return json({ error: "Invalid payment header" }, 400);
    }
    const quote = challenges.get(payment?.accepted?.extra?.challengeId);
    if (!quote || quote.expiresAt <= timestamp) return json({ error: "Unknown or expired challenge" }, 410);
    if (payment.x402Version !== 2 || !isProof(payment.payload) || inputKey !== quote.inputKey
      || toolId !== quote.terms.extra.toolId || !isDeepStrictEqual(payment.accepted, quote.terms)) {
      return json({ error: "Payment does not match the challenge" }, 402);
    }

    const proof = payment.payload;
    const proofKey = `${proof.payer}:${proof.transaction}`;
    if (quote.proofKey && quote.proofKey !== proofKey) {
      return json({ error: "Challenge already has a payment in progress" }, 409);
    }
    if (!quote.result) {
      quote.proofKey = proofKey;
      quote.verification ??= Promise.resolve().then(() => verifyPayment(quote.terms, proof));
      try {
        const status = await quote.verification;
        if (status === "pending") {
          return json({ error: "Payment is awaiting finality" }, 425, { "retry-after": "1" });
        }
        if (status !== "settled") {
          quote.proofKey = undefined;
          return json({ error: "Payment was rejected" }, 402);
        }
        quote.result = tool.render(input.data);
      } catch {
        return json({ error: "Payment verification unavailable" }, 503);
      } finally {
        quote.verification = undefined;
      }
    }

    return json({ result: quote.result }, 200, {
      "payment-response": encodeHeader({
        success: true, network: quote.terms.network, payer: proof.payer, transaction: proof.transaction,
      }),
    });
  };
}
