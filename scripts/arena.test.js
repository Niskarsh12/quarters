import assert from "node:assert/strict";
import { test } from "node:test";
import { activePlayers, advance, enter, flee, fleeTax, hold, newArena, STAKE } from "../contracts/paperhands_arena/src/rules.js";

function setup(accounts = ["ash", "rook", "echo", "moth", "veil"]) {
  const arena = newArena(1, 0, 30, 60);
  const credits = new Map();
  const credit = (account, amount) => credits.set(account, (credits.get(account) ?? 0n) + amount);
  for (const name of accounts) enter(arena, name, STAKE, 0);
  return { arena, credit, credits };
}

test("tax is distributed immediately, remainder conserved, and survivors receive the exact vault balance", () => {
  const { arena, credit, credits } = setup();
  advance(arena, 30, credit);
  const tax = STAKE / 4n;
  flee(arena, "moth", 31, credit);
  assert.equal(credits.get("moth"), STAKE - tax);
  assert.equal(BigInt(arena.redistributed), tax);
  for (const player of activePlayers(arena)) assert.equal(BigInt(player.amount), STAKE + tax / 4n);

  const secondTax = (STAKE + tax / 4n) / 4n;
  assert.notEqual(secondTax % 3n, 0n);
  flee(arena, "veil", 32, credit);
  assert.equal(BigInt(arena.redistributed), tax + secondTax);
  assert.equal(BigInt(arena.players[0].amount), STAKE + tax / 4n + secondTax / 3n + 1n);
  for (const time of [90, 150, 210]) {
    for (const player of activePlayers(arena)) hold(arena, player.account, time - 1);
    advance(arena, time, credit);
  }
  assert.equal(arena.phase, "finished");
  assert.equal([...credits.values()].reduce((sum, value) => sum + value, 0n), STAKE * 5n);
});

test("repeat exits, entry abuse, premature advances and fleeing after Hold are rejected", () => {
  const { arena, credit } = setup(["ash", "rook", "echo"]);
  assert.throws(() => enter(arena, "ash", STAKE, 0), /Already entered/);
  assert.throws(() => enter(arena, "moth", STAKE + 1n, 0), /exactly/);
  assert.throws(() => advance(arena, 29, credit), /Entry window/);
  assert.throws(() => enter(arena, "moth", STAKE, 30), /closed/);
  advance(arena, 30, credit);
  hold(arena, "ash", 31);
  assert.throws(() => flee(arena, "ash", 32, credit), /No open decision/);
  flee(arena, "rook", 32, credit);
  assert.throws(() => flee(arena, "rook", 32, credit), /No open decision/);
  assert.throws(() => advance(arena, 32, credit), /Round is still open/);
  assert.throws(() => flee(arena, "echo", 90, credit), /window is closed/);
  hold(arena, "echo", 89);
  advance(arena, 89, credit);
  assert.equal(arena.round, 2);
  assert.equal(arena.players[0].held, false);
});

test("last survivor is paid immediately and a solo lobby is refunded", () => {
  const match = setup(["ash", "rook"]);
  advance(match.arena, 30, match.credit);
  flee(match.arena, "ash", 31, match.credit);
  assert.equal(match.credits.get("rook"), STAKE + fleeTax(STAKE));
  assert.equal(match.arena.phase, "finished");
  const solo = setup(["echo"]);
  advance(solo.arena, 30, solo.credit);
  assert.equal(solo.arena.phase, "cancelled");
  assert.equal(solo.credits.get("echo"), STAKE);
});

test("missed decisions pay the tax to confirmed holders, and an all-idle round refunds", () => {
  const match = setup(["ash", "rook", "echo"]);
  advance(match.arena, 30, match.credit);
  hold(match.arena, "ash", 31);
  advance(match.arena, 90, match.credit);
  assert.equal(match.credits.get("ash"), STAKE * 2n);
  assert.equal(match.credits.get("rook"), STAKE / 2n);
  assert.equal(match.credits.get("echo"), STAKE / 2n);
  const idle = setup(["ash", "rook"]);
  advance(idle.arena, 30, idle.credit);
  advance(idle.arena, 90, idle.credit);
  assert.equal(idle.credits.get("ash"), STAKE);
  assert.equal(idle.credits.get("rook"), STAKE);
});

import { circuitFallback, solve, trainResult, validCircuit, varyCircuit } from "../services/game_master/challenges.js";
import { play, practice, YOU } from "../frontend/lib/simulation.mjs";

test("circuit generator validation rejects impossible and ambiguous clues", () => {
  for (const round of [1, 3]) {
    const room = circuitFallback(round);
    for (let variant = 0; variant < 8; variant++) {
      assert.equal(validCircuit(varyCircuit(room, variant).clues), true);
    }
  }
  const clue = { switches: [0, 1], count: 1 };
  assert.equal(validCircuit([clue, clue, clue]), false);
  assert.equal(validCircuit([clue, { ...clue, count: 2 }, clue]), false);
});

test("train ties clear every least crowded occupied train", () => {
  assert.deepEqual(trainResult([{ train: 1 }, { train: 2 }]), { counts: [0, 1, 1], winners: [1, 2] });
});

test("practice rooms score a circuit and train, and a wrong answer triggers settlement", () => {
  const circuit = circuitFallback(1);
  const start = play(practice(100), "enter", 100, true);
  const solved = play(start, "resolve", 101, true, circuit, solve(circuit.clues)[0]);
  assert.equal(solved.result.passed, true);
  const train = play(solved, "advance", 102, true);
  const winner = play(train, "resolve", 103, true, null, 2);
  assert.deepEqual(winner.result.counts, [3, 0, 2]);
  assert.equal(winner.result.passed, true);
  const resolved = play(train, "resolve", 103, true, null, 0);
  assert.deepEqual(resolved.result.counts, [4, 0, 1]);
  assert.equal(resolved.result.passed, false);
  const settled = play(resolved, "advance", 104, true);
  assert.equal(settled.arena.players.find(player => player.account === YOU).status, "timed_out");
  assert(BigInt(settled.credits[YOU]) > 0n);
});
