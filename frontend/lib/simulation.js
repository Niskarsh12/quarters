import { activePlayers, advance, enter, flee, hold, newArena, STAKE } from "../../contracts/paperhands_arena/src/rules.js";

export const YOU = "You";
const cast = ["Ashfall", "Moth", "Rook", "Cinder", "Vex"];
const exits = ["Moth", "Cinder", "Vex"];
export const JOIN_SECONDS = 300;
export const DECISION_SECONDS = 60;

export function practice(now) {
  const arena = newArena(1, now, JOIN_SECONDS, DECISION_SECONDS);
  for (const name of cast) enter(arena, name, STAKE, now);
  return { arena, credits: {}, decision: "", now };
}

export function play(state, action, now, fast) {
  const next = structuredClone(state);
  const { arena, credits } = next;
  const credit = (account, amount) => { credits[account] = String(BigInt(credits[account] ?? "0") + amount); };

  if (action === "enter") {
    enter(arena, YOU, STAKE, now);
    if (fast) advance(arena, arena.ends, credit);
    if (fast) arena.ends = now + DECISION_SECONDS;
  } else if (action === "advance") {
    if (arena.phase === "running" && fast) {
      const leaver = activePlayers(arena).find(player => player.account === exits[arena.round - 1]);
      if (leaver && activePlayers(arena).length > 1) flee(arena, leaver.account, Math.min(now, arena.ends - 1), credit);
    }
    if (arena.phase === "running") {
      for (const player of activePlayers(arena)) {
        if (player.account !== YOU && !player.held) hold(arena, player.account, Math.min(now, arena.ends - 1));
      }
    }
    if (["lobby", "running"].includes(arena.phase)) advance(arena, fast ? arena.ends : now, credit);
    if (fast && arena.phase === "running") arena.ends = now + DECISION_SECONDS;
  } else if (action === "hold") {
    hold(arena, YOU, now);
    next.decision = "hold";
  } else if (action === "flee") {
    flee(arena, YOU, now, credit);
    next.decision = "flee";
  }
  return next;
}
