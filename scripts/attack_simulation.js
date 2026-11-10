import assert from "node:assert/strict";
import { test } from "node:test";
import { KeyPair } from "@near-js/crypto";
import { Jar } from "../contracts/vending_jar/src/jar.js";
import { createNearPayer } from "../services/vending_mcp/near.js";
import {
  ATTACKER_ID, DRAIN_REJECTION, RECIPIENT_REJECTION, VELOCITY_REJECTION, probeJar,
} from "../services/vending_mcp/attacks.js";

const contractId = "jar.testnet";
const accountId = "buyer.testnet";
const providerId = "provider.testnet";
const toolId = "fetch_paywalled_research";

function makeJar() {
  const store = new Map();
  const jar = new Jar(contractId, {
    read: (key) => store.get(key),
    write: (key, value) => store.set(key, value),
    timestamp: () => 86_400_000_000_000n,
    log: () => {},
  });
  jar.faucet(accountId);
  jar.registerProvider(contractId, providerId, toolId, "250000");
  return jar;
}

test("A. A compromised agent cannot drain $10 or split it to evade the rolling cap", () => {
  const jar = makeJar();
  const before = jar.userAccount(accountId);
  assert.equal(probeJar(jar, accountId, providerId, toolId, "injected-drain"), DRAIN_REJECTION);
  assert.deepEqual(jar.userAccount(accountId), before);
  assert.equal(jar.providerBalance(providerId), "0");

  for (let index = 0; index < 8; index += 1) {
    jar.dispense(accountId, providerId, "250000", toolId, `split-${index}`);
  }
  const atLimit = jar.userAccount(accountId);
  assert.equal(atLimit.daily_spent, "2000000");
  assert.throws(
    () => jar.dispense(accountId, providerId, "250000", toolId, "split-8"),
    { message: VELOCITY_REJECTION },
  );
  assert.deepEqual(jar.userAccount(accountId), atLimit);
  assert.equal(jar.providerBalance(providerId), "2000000");
});

test("B. An unlisted recipient cannot receive an otherwise valid payment", () => {
  const jar = makeJar();
  const before = jar.userAccount(accountId);
  assert.throws(
    () => jar.dispense(accountId, ATTACKER_ID, "50000", toolId, "injected-recipient"),
    { message: RECIPIENT_REJECTION },
  );
  assert.deepEqual(jar.userAccount(accountId), before);
  assert.equal(jar.providerBalance(ATTACKER_ID), "0");
});

test("C. The signer rejects widened keys and the NEAR action policy excludes native transfers", async () => {
  const permission = { receiver_id: contractId, method_names: ["dispense"], allowance: "100000000000000000000000" };
  const secretKey = KeyPair.fromRandom("ed25519").toString();
  for (const access of [
    "FullAccess",
    { FunctionCall: { ...permission, receiver_id: ATTACKER_ID } },
    { FunctionCall: { ...permission, method_names: [] } },
    { FunctionCall: { ...permission, method_names: ["faucet"] } },
    { FunctionCall: { ...permission, method_names: ["dispense", "faucet"] } },
    { FunctionCall: { ...permission, allowance: null } },
  ]) {
    const pay = createNearPayer({
      accountId, contractId, secretKey,
      rpc: async (method) => {
        assert.equal(method, "query", "a widened key must never broadcast");
        return { permission: access };
      },
    });
    await assert.rejects(pay({ extra: {} }), /Agent key must allow only dispense/);
  }

  // Offline model of the access-key checks in nearcore. The signature alone grants no authority.
  const allowed = (receiver, actions) => {
    const call = actions[0]?.FunctionCall;
    return receiver === permission.receiver_id && actions.length === 1 && Boolean(call)
      && permission.method_names.includes(call.method_name) && call.deposit === "0";
  };
  const dispense = { FunctionCall: { method_name: "dispense", deposit: "0" } };
  const transfer = { Transfer: { deposit: "10000000000000000000000000" } };
  assert(allowed(contractId, [dispense]));
  assert(!allowed(ATTACKER_ID, [transfer]));
  assert(!allowed(contractId, [transfer]));
  assert(!allowed(contractId, [dispense, transfer]));
  assert(!allowed(contractId, [{ FunctionCall: { method_name: "dispense", deposit: "1" } }]));
});
