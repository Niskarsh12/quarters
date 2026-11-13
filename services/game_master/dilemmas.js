export const scenarios = [
  { title: "The sirens are lying", body: "The exit signs flicker on. An announcement says the next room has no floor. A player across the pit is already walking toward the door." },
  { title: "The room goes dark", body: "For six seconds you can hear nothing but boots on concrete. When the lights return, the exit gate is open and someone has left a seat empty." },
  { title: "One door left", body: "The outer gate seals. A narrow passage remains open, and the voice overhead starts reading the names of everyone still inside." },
];

export function evaluateAction(action, round) {
  if (!["hold", "flee"].includes(action)) throw new Error("Unknown action");
  return action === "hold"
    ? `Round ${round} decision locked. Your stake stays in the arena.`
    : "You took the exit. The remaining players split your PaperHands Tax.";
}
