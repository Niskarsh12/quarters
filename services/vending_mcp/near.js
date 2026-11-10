import { createHash } from "node:crypto";
import { KeyPair } from "@near-js/crypto";
import { actionCreators, createTransaction, Signature, SignedTransaction } from "@near-js/transactions";
import bs58 from "bs58";
import { isAccount } from "./protocol.js";

const DISPENSE_GAS = 30_000_000_000_000n;
const PENDING_RPC_ERRORS = new Set(["UNKNOWN_TRANSACTION", "TIMEOUT_ERROR", "REQUEST_ROUTED"]);

export async function connectTestnet(rpcUrl, fetcher = fetch) {
  let id = 0;
  async function rpc(method, params) {
    const requestId = ++id;
    const response = await fetcher(rpcUrl, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params }),
    });
    if (!response.ok) throw new Error("NEAR RPC is unavailable");
    const result = await response.json();
    if (result.id !== requestId) throw new Error("NEAR RPC response ID mismatch");
    if (result.error) {
      const error = new Error("NEAR RPC rejected the request");
      error.rpcCause = result.error.cause?.name;
      throw error;
    }
    return result.result;
  }
  if ((await rpc("status", [])).chain_id !== "testnet") throw new Error("A NEAR Testnet RPC is required");
  return rpc;
}

export function createNearPayer({ rpc, accountId, contractId, secretKey }) {
  if (!isAccount(accountId) || !isAccount(contractId)) throw new Error("Invalid payer or contract account");
  let key;
  try {
    key = KeyPair.fromString(secretKey);
  } catch {
    throw new Error("Invalid scoped NEAR private key");
  }
  const publicKey = key.getPublicKey();
  let lastNonce = 0n;
  let queue = Promise.resolve();

  async function signAndSubmit(terms) {
    const accessKey = await rpc("query", {
      request_type: "view_access_key", finality: "optimistic",
      account_id: accountId, public_key: publicKey.toString(),
    });
    const scope = accessKey.permission?.FunctionCall;
    if (scope?.receiver_id !== contractId || scope.method_names?.length !== 1
      || scope.method_names[0] !== "dispense" || !/^[1-9]\d*$/.test(scope.allowance ?? "")) {
      throw new Error("Agent key must allow only dispense on the jar, with a finite gas allowance");
    }
    if (!Number.isSafeInteger(accessKey.nonce)) throw new Error("Invalid NEAR access key nonce");
    const chainNonce = BigInt(accessKey.nonce);
    const nonce = (lastNonce > chainNonce ? lastNonce : chainNonce) + 1n;
    const transaction = createTransaction(accountId, publicKey, contractId, nonce, [
      actionCreators.functionCall("dispense", {
        provider_id: terms.payTo,
        amount: terms.amount,
        tool_id: terms.extra.toolId,
        request_id: terms.extra.challengeId,
      }, DISPENSE_GAS, 0n),
    ], bs58.decode(accessKey.block_hash));
    const digest = createHash("sha256").update(transaction.encode()).digest();
    const signature = new Signature({ keyType: publicKey.keyType, data: key.sign(digest).signature });
    const signed = new SignedTransaction({ transaction, signature });
    const proof = { payer: accountId, transaction: bs58.encode(digest) };

    try {
      await rpc("send_tx", {
        signed_tx_base64: Buffer.from(signed.encode()).toString("base64"), wait_until: "INCLUDED",
      });
    } catch (error) {
      if (error.rpcCause === "INVALID_TRANSACTION") throw new Error("NEAR rejected the signed dispense");
      // The node may have received the signed transaction before losing the connection.
      // Return its deterministic hash so the provider can look it up without charging again.
    }
    lastNonce = nonce;
    return proof;
  }

  return function pay(terms) {
    const result = queue.then(() => signAndSubmit(terms));
    queue = result.catch(() => {});
    return result;
  };
}

export function createNearVerifier({ rpc, contractId }) {
  return async function verifyPayment(terms, proof) {
    let result;
    try {
      result = await rpc("tx", {
        tx_hash: proof.transaction, sender_account_id: proof.payer, wait_until: "FINAL",
      });
    } catch (error) {
      if (PENDING_RPC_ERRORS.has(error.rpcCause)) return "pending";
      throw error;
    }
    if (result.final_execution_status !== "FINAL") return "pending";
    const transaction = result.transaction;
    const call = transaction?.actions?.[0]?.FunctionCall;
    if (typeof result.status?.SuccessValue !== "string" || transaction?.hash !== proof.transaction
      || transaction.signer_id !== proof.payer || transaction.receiver_id !== contractId
      || transaction.actions?.length !== 1 || call?.method_name !== "dispense" || call.deposit !== "0") {
      return "rejected";
    }

    for (const { outcome } of result.receipts_outcome ?? []) {
      if (outcome.executor_id !== contractId || typeof outcome.status?.SuccessValue !== "string") continue;
      for (const line of outcome.logs ?? []) {
        if (!line.startsWith("EVENT_JSON:")) continue;
        let event;
        try {
          event = JSON.parse(line.slice("EVENT_JSON:".length));
        } catch {
          continue;
        }
        const receipt = event?.data?.[0];
        if (event?.standard === "quarters" && event.version === "1.0.0" && event.event === "dispense"
          && event.data?.length === 1 && receipt?.account_id === proof.payer
          && receipt.provider_id === terms.payTo && receipt.tool_id === terms.extra.toolId
          && receipt.request_id === terms.extra.challengeId && receipt.amount === terms.amount) return "settled";
      }
    }
    return "rejected";
  };
}
