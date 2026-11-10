import assert from "node:assert/strict";
import { test } from "node:test";
import { DAY_NS, Jar } from "../src/jar.js";

const CONTRACT = "jar.testnet";
const OWNER = "owner.testnet";
const ALICE = "alice.testnet";
const BOB = "bob.testnet";
const PROVIDER = "provider.testnet";
const TOOL = "locked_research";

function setup() {
  const storage = new Map();
  const logs = [];
  let timestamp = DAY_NS * 2n;
  const host = {
    read: (key) => storage.get(key),
    write: (key, value) => storage.set(key, value),
    timestamp: () => timestamp,
    log: (line) => logs.push(line),
  };
  const jar = new Jar(Jar.initialize(CONTRACT, CONTRACT, OWNER), host);
  return { jar, logs, advance: (ns) => { timestamp += ns; } };
}

test("only the deploying contract account can set a valid owner", () => {
  assert.equal(Jar.initialize(CONTRACT, CONTRACT, OWNER), OWNER);
  assert.throws(() => Jar.initialize(ALICE, CONTRACT, ALICE), /Only the contract account/);
  assert.throws(() => Jar.initialize(CONTRACT, CONTRACT, "INVALID"), /Invalid NEAR account ID/);
  assert.throws(() => new Jar("", {}), /not initialized/);
});

test("the faucet grants each caller 5 mock dollars once", () => {
  const { jar } = setup();
  assert.equal(jar.userAccount(ALICE).balance, "0");
  const account = jar.faucet(ALICE);
  assert.deepEqual(account, {
    balance: "5000000", daily_spent: "0", call_count: 0, faucet_claimed: true,
  });
  assert.deepEqual(jar.faucet(ALICE), account);
  assert.equal(jar.userAccount(BOB).balance, "0");
  assert.equal(jar.faucet(BOB).balance, "5000000");
});

test("native deposits credit whole demo micro-units to the caller", () => {
  const { jar } = setup();
  assert.throws(() => jar.deposit(ALICE, 0n), /positive multiple/);
  assert.throws(() => jar.deposit(ALICE, 1n), /positive multiple/);
  assert.equal(jar.deposit(ALICE, 10n ** 24n).balance, "1000000");
  assert.equal(jar.faucet(ALICE).balance, "6000000");
});

test("only the owner registers provider and tool pairs with valid ceilings", () => {
  const { jar } = setup();
  jar.faucet(ALICE);
  assert.throws(() => jar.registerProvider(ALICE, PROVIDER, TOOL, 50_000), /Only the owner/);
  assert.throws(() => jar.registerProvider(OWNER, PROVIDER, TOOL, 250_001), /Per-call cap/);
  assert.throws(() => jar.registerProvider(OWNER, PROVIDER, ":", 50_000), /Invalid tool ID/);
  jar.registerProvider(OWNER, PROVIDER, TOOL, 50_000);
  assert.throws(() => jar.dispense(ALICE, PROVIDER, 50_001, TOOL, "research"), /Tool price ceiling/);
  assert.throws(() => jar.dispense(ALICE, PROVIDER, 50_000, "other", "other"), /not registered/);
  assert.throws(() => jar.dispense(ALICE, BOB, 50_000, TOOL, "other"), /not registered/);
  assert.equal(jar.userAccount(ALICE).balance, "5000000");
});

test("a dispense credits only the registered provider and logs an idempotent receipt", () => {
  const { jar, logs } = setup();
  jar.registerProvider(OWNER, PROVIDER, TOOL, 50_000);
  assert.throws(() => jar.dispense(BOB, PROVIDER, 50_000, TOOL, "buy"), /Insufficient/);
  jar.faucet(ALICE);
  const receipt = jar.dispense(ALICE, PROVIDER, "50000", TOOL, "buy");
  assert.deepEqual(jar.dispense(ALICE, PROVIDER, 50_000, TOOL, "buy"), receipt);
  assert.throws(() => jar.dispense(ALICE, PROVIDER, 49_999, TOOL, "buy"), /already used/);
  assert.equal(jar.faucet(ALICE).balance, "4950000");
  assert.equal(jar.userAccount(ALICE).call_count, 1);
  assert.equal(jar.providerBalance(PROVIDER), "50000");
  assert.deepEqual(logs, [`EVENT_JSON:${JSON.stringify({
    standard: "quarters", version: "1.0.0", event: "dispense", data: [receipt],
  })}`]);
});

test("the contract rejects oversized and invalid payments without changing balances", () => {
  const { jar, logs } = setup();
  jar.registerProvider(OWNER, PROVIDER, TOOL, 250_000);
  jar.faucet(ALICE);
  assert.throws(() => jar.dispense(ALICE, PROVIDER, 10_000_000, TOOL, "attack"), /Per-call cap/);
  for (const invalid of [null, true, 0, -1, 1.5, "1e3", "1\n", {}]) {
    assert.throws(() => jar.dispense(ALICE, PROVIDER, invalid, TOOL, "invalid"), /Amount must/);
  }
  assert.equal(jar.userAccount(ALICE).balance, "5000000");
  assert.equal(jar.providerBalance(PROVIDER), "0");
  assert.equal(logs.length, 0);
});

test("the exact rolling cap is per account and releases only expired purchases", () => {
  const { jar, advance } = setup();
  jar.registerProvider(OWNER, PROVIDER, TOOL, 250_000);
  jar.faucet(ALICE);
  jar.faucet(BOB);
  jar.dispense(ALICE, PROVIDER, 250_000, TOOL, "earliest");
  advance(10n);
  for (let index = 0; index < 7; index += 1) {
    jar.dispense(ALICE, PROVIDER, 250_000, TOOL, `purchase-${index}`);
  }
  jar.dispense(BOB, PROVIDER, 250_000, TOOL, "earliest");
  assert.equal(jar.userAccount(ALICE).daily_spent, "2000000");
  assert.equal(jar.userAccount(BOB).daily_spent, "250000");
  advance(DAY_NS - 11n);
  assert.throws(() => jar.dispense(ALICE, PROVIDER, 1, TOOL, "over"), /Rolling 24-hour cap/);
  advance(1n);
  assert.equal(jar.userAccount(ALICE).daily_spent, "1750000");
  jar.dispense(ALICE, PROVIDER, 250_000, TOOL, "replacement");
  assert.equal(jar.userAccount(ALICE).daily_spent, "2000000");
  assert.equal(jar.userAccount(ALICE).call_count, 9);
  advance(10n);
  assert.equal(jar.userAccount(ALICE).daily_spent, "250000");
  assert.equal(jar.userAccount(BOB).daily_spent, "0");
});
