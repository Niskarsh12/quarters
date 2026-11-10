import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { KeyPair } from "@near-js/crypto";
import { encodeTransaction, SignedTransaction } from "@near-js/transactions";
import bs58 from "bs58";
import { Jar } from "../../contracts/vending_jar/src/jar.js";
import { createVendingClient } from "./client.js";
import { startPaywall } from "./http.js";
import { createMcpServer } from "./mcp.js";
import { createNearPayer, createNearVerifier } from "./near.js";
import { createPaywall } from "./paywall.js";
import { decodeHeader, encodeHeader, termsFor } from "./protocol.js";

const providerId = "provider.testnet";
const contractId = "jar.testnet";
const payer = "buyer.testnet";
const research = "fetch_paywalled_research";
const chart = "generate_pro_chart";
const query = { query: "Quarterly demand" };
const baseUrl = "http://localhost:3000";
const hash = (data) => createHash("sha256").update(data).digest();
const transactionHash = (data) => bs58.encode(hash(data));
const terms = termsFor({
  providerId, contractId, toolId: research, amount: "50000",
  challengeId: "7412af4c-1d3f-4e1d-9d21-98b7eb5241a1",
});

function request(toolId, body, signature) {
  return new Request(`${baseUrl}/tools/${toolId}`, {
    method: "POST",
    headers: signature ? { "payment-signature": signature } : {},
    body: JSON.stringify(body),
  });
}

test("MCP buys both tools over HTTP, reports optimism, and unlocks only after settlement", async (t) => {
  const store = new Map();
  const events = [];
  const jar = new Jar(contractId, {
    read: (key) => store.get(key), write: (key, value) => store.set(key, value),
    timestamp: () => 1_000_000n, log: (entry) => events.push(entry),
  });
  jar.faucet(payer);
  jar.registerProvider(contractId, providerId, research, "50000");
  jar.registerProvider(contractId, providerId, chart, "30000");
  const broadcasts = new Map();
  const states = [];
  const httpStatuses = [];
  const { origin, close } = await startPaywall(createPaywall({
    providerId, contractId,
    verifyPayment: async (accepted, proof) => {
      const payment = broadcasts.get(proof.transaction);
      assert.deepEqual(payment.accepted, accepted);
      if (payment.polls++ === 0) return "pending";
      jar.dispense(payer, providerId, accepted.amount, accepted.extra.toolId, accepted.extra.challengeId);
      return "settled";
    },
  }));
  t.after(close);
  const purchase = createVendingClient({
    providerId, contractId, baseUrl: origin,
    onPayment: (receipt) => states.push({ ...receipt, balance: jar.userAccount(payer).balance }),
    pay: async (accepted) => {
      const transaction = transactionHash(accepted.extra.challengeId);
      assert.equal(states.at(-1).state, "pending");
      assert.equal(broadcasts.has(transaction), false);
      broadcasts.set(transaction, { accepted, polls: 0 });
      return { payer, transaction };
    },
    fetcher: async (...args) => {
      const response = await fetch(...args);
      httpStatuses.push(response.status);
      return response;
    },
    pause: async () => {},
  });
  const mcp = createMcpServer(purchase);
  const client = new Client({ name: "quarters-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await mcp.connect(serverTransport);
  await client.connect(clientTransport);
  t.after(() => client.close());

  assert.deepEqual((await client.listTools()).tools.map(({ name }) => name), [research, chart]);
  const report = await client.callTool({ name: research, arguments: query });
  assert.equal(report.structuredContent.result.query, query.query);
  assert.equal(report.structuredContent.receipt.amount, "50000");
  const image = await client.callTool({
    name: chart, arguments: { data: [{ label: "<script>", value: 42 }] },
  });
  assert.match(image.structuredContent.result.svg, /&lt;script&gt;/);
  assert.equal(image.structuredContent.receipt.amount, "30000");
  assert.deepEqual(httpStatuses, [402, 425, 200, 402, 425, 200]);
  assert.deepEqual(states.map(({ state }) => state), [
    "pending", "submitted", "settled", "pending", "submitted", "settled",
  ]);
  assert.deepEqual(states.map(({ balance }) => balance), [
    "5000000", "5000000", "4950000", "4950000", "4950000", "4920000",
  ]);
  assert.equal(broadcasts.size, 2);
  assert.equal(jar.providerBalance(providerId), "80000");
  assert.equal(events.length, 2);
});

test("paywall binds proofs to the price, tool and input and replays the paid result", async () => {
  let verifications = 0;
  const handle = createPaywall({ providerId, contractId, verifyPayment: async () => {
    verifications += 1;
    return "settled";
  } });
  const challenge = await handle(request(research, query));
  assert.equal(challenge.status, 402);
  assert.match(challenge.headers.get("www-authenticate"),
    /^x402-v2 token=mock-USDC, recipient=provider\.testnet, price=0\.05, challenge_id=[0-9a-f-]{36}$/);
  assert.deepEqual(await challenge.json(), { error: "Payment required" });
  const required = decodeHeader(challenge.headers.get("payment-required"));
  const accepted = required.accepts[0];
  const payload = { payer, transaction: transactionHash("original proof") };
  const payment = { x402Version: 2, accepted, payload };
  assert.equal((await handle(request(research, query, encodeHeader({
    ...payment, accepted: { ...accepted, amount: "1" },
  })))).status, 402);
  const signature = encodeHeader(payment);
  assert.equal((await handle(request(research, { query: "Different report" }, signature))).status, 402);
  assert.equal((await handle(request(chart, { data: [{ label: "A", value: 1 }] }, signature))).status, 402);
  assert.equal(verifications, 0);
  const original = await handle(request(research, query, signature));
  const replay = await handle(request(research, query, signature));
  assert.equal(original.status, 200);
  assert.deepEqual(await original.json(), await replay.json());
  assert.equal(decodeHeader(replay.headers.get("payment-response")).transaction, payload.transaction);
  assert.equal(verifications, 1);
});

test("the interceptor refuses to sign a challenge with an unexpected recipient", async () => {
  const handle = createPaywall({
    providerId: "attacker.testnet", contractId, verifyPayment: () => assert.fail("unexpected verification"),
  });
  const purchase = createVendingClient({
    baseUrl, providerId, contractId, fetcher: (url, init) => handle(new Request(url, init)),
    pay: () => assert.fail("unexpected signature"),
  });
  await assert.rejects(purchase(research, query), /challenge does not match/);
});

test("the payer signs only the scoped NEAR action and refuses full-access keys", async () => {
  const key = KeyPair.fromRandom("ed25519");
  const config = { accountId: payer, contractId, secretKey: key.toString() };
  const block_hash = transactionHash("recent block");
  const scope = { receiver_id: contractId, method_names: ["dispense"], allowance: "100000000000000000000000" };
  const submissions = [];
  const pay = createNearPayer({ ...config, rpc: async (method, params) => {
    if (method === "query") {
      assert.equal(params.public_key, key.getPublicKey().toString());
      return { nonce: 10, block_hash, permission: { FunctionCall: scope } };
    }
    submissions.push({ method, params });
  } });
  const proofs = await Promise.all([pay(terms), pay(terms)]);
  assert.equal(submissions.length, 2);
  const nonces = submissions.map(({ method, params }, index) => {
    assert.equal(method, "send_tx");
    assert.equal(params.wait_until, "INCLUDED");
    const signed = SignedTransaction.decode(Buffer.from(params.signed_tx_base64, "base64"));
    const transaction = signed.transaction;
    assert.equal(transaction.signerId, payer);
    assert.equal(transaction.receiverId, contractId);
    assert.equal(transaction.actions.length, 1);
    const call = transaction.actions[0].functionCall;
    assert.equal(call.methodName, "dispense");
    assert.equal(call.deposit, 0n);
    assert.deepEqual(JSON.parse(Buffer.from(call.args).toString()), {
      provider_id: providerId, amount: "50000", tool_id: research, request_id: terms.extra.challengeId,
    });
    const digest = hash(encodeTransaction(transaction));
    const signature = Uint8Array.from(signed.signature.ed25519Signature.data);
    assert(key.getPublicKey().verify(digest, signature));
    assert.equal(proofs[index].transaction, bs58.encode(digest));
    return transaction.nonce;
  });
  assert.deepEqual(nonces, [11n, 12n]);
  assert.notEqual(proofs[0].transaction, proofs[1].transaction);
  const payWithFullKey = createNearPayer({ ...config, rpc: async (method) => {
    assert.equal(method, "query");
    return { nonce: 10, block_hash, permission: "FullAccess" };
  } });
  await assert.rejects(payWithFullKey(terms), /must allow only dispense/);
});

test("the NEAR verifier requires a finalized, matching contract receipt", async () => {
  const proof = { payer, transaction: transactionHash("settled transaction") };
  const receipt = {
    account_id: payer, amount: terms.amount, provider_id: providerId,
    tool_id: research, request_id: terms.extra.challengeId,
  };
  const event = { standard: "quarters", version: "1.0.0", event: "dispense", data: [receipt] };
  const outcome = {
    executor_id: contractId, status: { SuccessValue: "" }, logs: [`EVENT_JSON:${JSON.stringify(event)}`],
  };
  const response = {
    final_execution_status: "EXECUTED_OPTIMISTIC",
    status: { SuccessValue: "" },
    transaction: {
      hash: proof.transaction, signer_id: payer, receiver_id: contractId,
      actions: [{ FunctionCall: { method_name: "dispense", deposit: "0" } }],
    },
    receipts_outcome: [{ outcome }],
  };
  const verify = createNearVerifier({ contractId, rpc: async (method, params) => {
    assert.equal(method, "tx");
    assert.deepEqual(params, { tx_hash: proof.transaction, sender_account_id: payer, wait_until: "FINAL" });
    return response;
  } });
  assert.equal(await verify(terms, proof), "pending");
  response.final_execution_status = "FINAL";
  assert.equal(await verify(terms, proof), "settled");
  assert.equal(await verify({ ...terms, extra: { ...terms.extra, challengeId: "other" } }, proof), "rejected");
  outcome.executor_id = "attacker.testnet";
  assert.equal(await verify(terms, proof), "rejected");
});
