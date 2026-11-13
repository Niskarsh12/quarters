export const TOKEN = 10n ** 24n;
export const STAKE = TOKEN / 10n;
export const TAX_BPS = 2500n;
export const MAX_PLAYERS = 12;
export const ROUND_COUNT = 3;

export function newArena(id, now, joinSeconds, roundSeconds) {
  return {
    id, phase: "lobby", round: 0, ends: now + joinSeconds, roundSeconds,
    players: [], redistributed: "0", events: [],
  };
}

function requireRule(condition, message) {
  if (!condition) throw new Error(message);
}

function record(arena, type, account, amount = 0n) {
  arena.events.push({ type, account, amount: String(amount), round: arena.round });
}

export function enter(arena, account, amount, now) {
  requireRule(arena.phase === "lobby" && now < arena.ends, "Entry is closed");
  requireRule(amount === STAKE, "Entry requires exactly 0.1 NEAR");
  requireRule(arena.players.length < MAX_PLAYERS, "Arena is full");
  requireRule(!arena.players.some(player => player.account === account), "Already entered");
  arena.players.push({ account, status: "active", amount: String(amount), held: false });
  record(arena, "entered", account, amount);
}

export function activePlayers(arena) {
  return arena.players.filter(player => player.status === "active");
}

function decide(arena, account, now) {
  requireRule(arena.phase === "running" && now < arena.ends, "Decision window is closed");
  const player = activePlayers(arena).find(candidate => candidate.account === account);
  requireRule(player && !player.held, "No open decision for this player");
  return player;
}

export function hold(arena, account, now) {
  decide(arena, account, now).held = true;
  record(arena, "held", account);
}

export function fleeTax(amount) {
  return BigInt(amount) * TAX_BPS / 10000n;
}

function settle(arena, credit, phase) {
  arena.phase = phase;
  for (const player of activePlayers(arena)) {
    player.status = phase === "cancelled" ? "refunded" : "survived";
    credit(player.account, BigInt(player.amount));
    record(arena, player.status, player.account, BigInt(player.amount));
  }
}

function exit(arena, player, rate, type, credit, eligible = activePlayers(arena)) {
  const account = player.account;
  const survivors = eligible.filter(other => other !== player);
  requireRule(survivors.length > 0, "No survivors to receive the tax");
  const amount = BigInt(player.amount);
  const tax = amount * rate / 10000n;
  const share = tax / BigInt(survivors.length);
  const dust = tax % BigInt(survivors.length);

  player.status = type;
  player.amount = String(amount - tax);
  credit(account, amount - tax);
  survivors.forEach((other, index) => {
    other.amount = String(BigInt(other.amount) + share + (BigInt(index) < dust ? 1n : 0n));
  });
  arena.redistributed = String(BigInt(arena.redistributed) + tax);
  record(arena, type, account, tax);
}

export function flee(arena, account, now, credit) {
  exit(arena, decide(arena, account, now), TAX_BPS, "fled", credit);
  if (activePlayers(arena).length === 1) settle(arena, credit, "finished");
}

export function advance(arena, now, credit) {
  if (arena.phase === "lobby") {
    requireRule(now >= arena.ends || arena.players.length === MAX_PLAYERS, "Entry window is open");
    if (arena.players.length < 2) {
      settle(arena, credit, "cancelled");
      return;
    }
    arena.phase = "running";
  } else {
    requireRule(arena.phase === "running", "Arena is closed");
    requireRule(now >= arena.ends || activePlayers(arena).every(player => player.held), "Round is still open");
    const players = activePlayers(arena);
    const holders = players.filter(player => player.held);
    if (!holders.length) {
      settle(arena, credit, "cancelled");
      return;
    }
    if (holders.length < players.length) {
      for (const player of players.filter(candidate => !candidate.held)) {
        exit(arena, player, 5000n, "timed_out", credit, holders);
      }
    }
    if (arena.round === ROUND_COUNT || holders.length === 1) {
      settle(arena, credit, "finished");
      return;
    }
  }
  arena.round += 1;
  arena.ends = now + arena.roundSeconds;
  for (const player of activePlayers(arena)) player.held = false;
  record(arena, "round", "");
}
