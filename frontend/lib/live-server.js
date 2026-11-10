import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { DRAIN_AMOUNT, DRAIN_REJECTION } from "../../services/vending_mcp/attacks.js";
import { createVendingClient } from "../../services/vending_mcp/client.js";
import { connectTestnet, createNearFaucet, createNearPayer, createNearVerifier } from "../../services/vending_mcp/near.js";
import { createPaywall } from "../../services/vending_mcp/paywall.js";
import { termsFor } from "../../services/vending_mcp/protocol.js";

const researchTool = "fetch_paywalled_research";
const baseUrl = "http://quarters.internal";
let session;

async function connect() {
  const {
    QUARTERS_NEAR_RPC_URL: rpcUrl = "https://rpc.testnet.near.org",
    QUARTERS_CONTRACT_ID: contractId,
    QUARTERS_PROVIDER_ID: providerId,
    QUARTERS_PAYER_ID: accountId,
    QUARTERS_AGENT_PRIVATE_KEY: secretKey,
    QUARTERS_FAUCET_PRIVATE_KEY: faucetKey,
  } = process.env;
  if (!contractId || !providerId || !accountId || !secretKey) {
    throw new Error("Live Testnet needs a configured jar, provider, payer and scoped agent key.");
  }
  const rpc = await connectTestnet(rpcUrl);
  const pay = createNearPayer({ rpc, accountId, contractId, secretKey });
  const faucet = faucetKey && createNearFaucet({ rpc, accountId, contractId, secretKey: faucetKey });
  const handle = createPaywall({
    providerId, contractId, verifyPayment: createNearVerifier({ rpc, contractId }),
  });

  async function snapshot() {
    const response = await rpc("query", {
      request_type: "call_function", finality: "final", account_id: contractId,
      method_name: "get_user_account",
      args_base64: Buffer.from(JSON.stringify({ account_id: accountId })).toString("base64"),
    });
    if (!Array.isArray(response.result)) throw new Error("Could not read the Testnet Coin Jar.");
    return { ...JSON.parse(Buffer.from(response.result).toString()), accountId, faucetAvailable: Boolean(faucet) };
  }

  async function finalized({ transaction, payer }) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (attempt) await delay(500);
      try {
        const result = await rpc("tx", { tx_hash: transaction, sender_account_id: payer, wait_until: "FINAL" });
        if (result.final_execution_status === "FINAL") return result;
      } catch (error) {
        if (error.rpcCause && !["TIMEOUT_ERROR", "UNKNOWN_TRANSACTION", "REQUEST_ROUTED"].includes(error.rpcCause)) {
          break;
        }
      }
    }
    throw new Error(`Testnet could not confirm the transaction. Check ${transaction} before retrying.`);
  }

  return {
    async status() {
      await pay.checkScope();
      return { account: await snapshot() };
    },
    async fund() {
      if (!faucet) throw new Error("The separate Testnet faucet key is not configured.");
      const before = await snapshot();
      if (before.faucet_claimed) return { account: before };
      const receipt = await faucet();
      const result = await finalized(receipt);
      if (typeof result.status?.SuccessValue !== "string") throw new Error("The Testnet faucet rejected the request.");
      return { account: await snapshot() };
    },
    async purchase(toolId, input, onPayment) {
      const purchase = createVendingClient({
        baseUrl, providerId, contractId, pay, onPayment,
        fetcher: (url, init) => handle(new Request(url, init)),
      });
      const unlocked = await purchase(toolId, input);
      // The purchase already settled. A subsequent balance read must not hide the paid result.
      const account = await snapshot().catch(() => null);
      return { ...unlocked, account, receipt: { ...unlocked.receipt, timestamp: Date.now() } };
    },
    async attack() {
      const proof = await pay(termsFor({
        toolId: researchTool, providerId, contractId, amount: DRAIN_AMOUNT, challengeId: randomUUID(),
      }));
      const result = await finalized(proof);
      if (!result.status?.Failure || !JSON.stringify(result.status.Failure).includes(DRAIN_REJECTION)) {
        throw new Error("Testnet did not return the expected per-call cap rejection.");
      }
      return { log: DRAIN_REJECTION, transaction: proof.transaction };
    },
  };
}

export function getLiveSession() {
  session ??= connect().catch((error) => {
    session = undefined;
    throw error;
  });
  return session;
}
