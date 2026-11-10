import { isDeepStrictEqual } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { authenticateHeader, decodeHeader, encodeHeader, isAccount, isChallengeId, isProof, termsFor } from "./protocol.js";
import { tools } from "./tools.js";

export function createVendingClient({
  baseUrl, providerId, contractId, pay, onPayment = () => {}, fetcher = fetch, pause = delay,
}) {
  if (!isAccount(providerId) || !isAccount(contractId)) throw new Error("Invalid provider or contract account");

  return async function purchase(toolId, input) {
    if (!Object.hasOwn(tools, toolId)) throw new Error("Unknown tool");
    const tool = tools[toolId];
    const url = new URL(`/tools/${toolId}`, baseUrl).href;
    const body = JSON.stringify(tool.schema.parse(input));
    const post = (headers) => fetcher(url, {
      method: "POST", body, redirect: "error", signal: AbortSignal.timeout(15_000),
      headers: { "content-type": "application/json", ...headers },
    });

    const challenge = await post();
    if (challenge.status !== 402) throw new Error(`Expected HTTP 402, received ${challenge.status}`);
    await challenge.body?.cancel();
    const required = decodeHeader(challenge.headers.get("payment-required"));
    const offered = required?.accepts?.[0];
    const challengeId = offered?.extra?.challengeId;
    const expected = termsFor({ toolId, amount: tool.amount, providerId, contractId, challengeId });
    if (required?.x402Version !== 2 || required.resource?.url !== url
      || required.accepts?.length !== 1 || !isChallengeId(challengeId)
      || !isDeepStrictEqual(offered, expected)
      || challenge.headers.get("www-authenticate") !== authenticateHeader(expected)) {
      throw new Error("Payment challenge does not match the configured tool");
    }

    const receipt = { requestId: challengeId, toolId, providerId, amount: tool.amount };
    const report = (state, details = {}) => {
      try {
        onPayment({ ...receipt, state, ...details });
      } catch {
        // A display callback must never interrupt an in-flight payment.
      }
    };
    report("pending");
    let proof;
    try {
      proof = await pay(expected);
      if (!isProof(proof)) throw new Error("Settlement adapter returned an invalid proof");
    } catch (error) {
      report("failed");
      throw error;
    }
    const paymentSignature = encodeHeader({
      x402Version: 2, resource: required.resource, accepted: expected, payload: proof,
    });
    const details = { payer: proof.payer, transaction: proof.transaction };
    report("submitted", details);

    for (let attempt = 0; attempt < 10; attempt += 1) {
      if (attempt > 0) await pause(1000);
      try {
        const response = await post({ "payment-signature": paymentSignature });
        if (response.status === 425 || response.status === 503) {
          await response.body?.cancel();
          continue;
        }
        if (!response.ok) {
          await response.body?.cancel();
          if (response.status !== 402) break;
          report("failed", details);
          throw new RejectedPayment();
        }
        const settlement = decodeHeader(response.headers.get("payment-response"));
        if (settlement?.success !== true || settlement.network !== expected.network
          || settlement.transaction !== proof.transaction || settlement.payer !== proof.payer) break;
        const { result } = await response.json();
        if (result === undefined) break;
        report("settled", details);
        return { result, receipt: { ...receipt, ...details, state: "settled" } };
      } catch (error) {
        if (error instanceof RejectedPayment) throw error;
        // Retry with the same proof. Never sign a second payment for the same purchase.
      }
    }

    report("unconfirmed", details);
    throw new Error(`Payment could not be confirmed. Check transaction ${proof.transaction} before buying again.`);
  };
}

class RejectedPayment extends Error {
  constructor() {
    super("The provider rejected the payment");
  }
}
