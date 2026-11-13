import { activePlayers, advance, enter, flee, hold, newArena, STAKE } from "../../contracts/paperhands_arena/src/rules.js";
import { solve, TRAIN_HINTS, TRAIN_NAMES, trainResult } from "../../services/game_master/challenges.js";

export const YOU = "You";
const cast = ["Ashfall", "Moth", "Rook", "Cinder", "Vex"];
const JOIN_SECONDS = 300;
const DECISION_SECONDS = 60;

export function practice(now, variant = 0) {
  const arena = newArena(1, now, JOIN_SECONDS, DECISION_SECONDS);
  for (const name of cast) enter(arena, name, STAKE, now);
  return { arena, credits: {}, variant, result: null, cleared: [] };
}

export function play(state, action, now, fast, challenge, choice) {
  const next = structuredClone(state);
  const { arena, credits } = next;
  const credit = (account, amount) => { credits[account] = String(BigInt(credits[account] ?? "0") + amount); };

  if (action === "enter") {
    enter(arena, YOU, STAKE, now);
    if (fast) advance(arena, arena.ends, credit);
    if (fast) arena.ends = now + DECISION_SECONDS;
  } else if (action === "resolve") {
    const player = activePlayers(arena).find(member => member.account === YOU);
    if (arena.phase !== "running" || next.result) throw new Error("Room already resolved");
    const choiceCount = arena.round === 2 ? TRAIN_NAMES.length : 16;
    if (player && now < arena.ends && (!Number.isInteger(choice) || choice < 0 || choice >= choiceCount)) {
      throw new Error("Choose before locking in");
    }
    const decisionTime = Math.min(now, arena.ends - 1);
    const submitted = player && now < arena.ends;
    if (arena.round === 2) {
      const choices = TRAIN_HINTS.filter(hint => activePlayers(arena).some(member => member.account === hint.name))
        .map(hint => ({ name: hint.name, train: hint.trains[state.variant % 2] }));
      if (submitted) choices.push({ name: YOU, train: choice });
      const { counts, winners } = trainResult(choices);
      for (const entry of choices) {
        if (winners.includes(entry.train)) hold(arena, entry.name, decisionTime);
      }
      next.result = { type: "train", counts, winners, choices, passed: Boolean(submitted && winners.includes(choice)) };
    } else {
      const answer = solve(challenge.clues)[0];
      const passed = Boolean(submitted && choice === answer);
      if (passed) hold(arena, YOU, decisionTime);
      const bots = activePlayers(arena).filter(member => member.account !== YOU);
      const leaver = bots.find(member => member.account === (arena.round === 1 ? "Moth" : "Vex"));
      for (const bot of bots) {
        if (bot === leaver && activePlayers(arena).length > 2) flee(arena, bot.account, decisionTime, credit);
        else hold(arena, bot.account, decisionTime);
      }
      next.result = { type: "circuit", answer, choice: submitted ? choice : null, passed };
    }
    if (next.result.passed) next.cleared.push(arena.round);
  } else if (action === "advance") {
    if (arena.phase === "running" && !next.result) throw new Error("Resolve the room first");
    advance(arena, arena.phase === "running" || fast ? arena.ends : now, credit);
    next.result = null;
    if (arena.phase === "running") arena.ends = now + DECISION_SECONDS;
  } else if (action === "flee") {
    if (next.result) throw new Error("Room already resolved");
    flee(arena, YOU, now, credit);
  }
  return next;
}
