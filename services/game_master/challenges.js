export const SWITCHES = ["A", "B", "C", "D"];
export const TRAIN_NAMES = ["Ember", "Iron", "Ghost"];
export const TRAIN_HINTS = [
  { name: "Ashfall", trains: [0, 2], note: "talks up Ember but boards the first train when it’s Ghost" },
  { name: "Moth", trains: [0, 0], note: "often follows Ashfall" },
  { name: "Rook", trains: [0, 2], note: "likes Ember unless Ghost is boarding first" },
  { name: "Cinder", trains: [0, 2], note: "usually follows Rook" },
  { name: "Vex", trains: [2, 1], note: "waits at the last train to open" },
];

export function matchesClue(mask, clue) {
  const on = clue.switches.filter(index => mask & (1 << index)).length;
  return on === clue.count;
}

export function solve(clues) {
  return Array.from({ length: 16 }, (_, mask) => mask)
    .filter(mask => clues.every(clue => matchesClue(mask, clue)));
}

export function validCircuit(clues) {
  return Array.isArray(clues) && clues.length >= 3 && clues.length <= 4
    && clues.every(clue => clue && Array.isArray(clue.switches)
      && clue.switches.length >= 2 && clue.switches.length <= SWITCHES.length
      && new Set(clue.switches).size === clue.switches.length
      && clue.switches.every(index => Number.isInteger(index) && index >= 0 && index < SWITCHES.length)
      && Number.isInteger(clue.count) && clue.count >= 0 && clue.count <= clue.switches.length)
    && solve(clues).length === 1;
}

const circuits = [
  [
    { switches: [0, 1, 2], count: 1 },
    { switches: [1, 2, 3], count: 2 },
    { switches: [0, 2, 3], count: 1 },
  ],
  [
    { switches: [0, 1, 2, 3], count: 2 },
    { switches: [0, 1, 2], count: 2 },
    { switches: [0, 1], count: 1 },
    { switches: [1, 2], count: 1 },
  ],
];

export function circuitFallback(round) {
  return {
    title: round === 1 ? "Dead Circuit" : "The Last Circuit",
    body: round === 1 ? "The exit relay is wired to four switches. The maintenance log is still readable."
      : "The final gate runs on a separate circuit. Follow the last technician’s notes.",
    clues: circuits[round === 1 ? 0 : 1],
    source: "Built-in puzzle",
  };
}

export function varyCircuit(room, variant) {
  const shift = variant % 4;
  const invert = Math.floor(variant / 4) % 2 === 1;
  return {
    ...room,
    clues: room.clues.map(clue => ({
      switches: clue.switches.map(index => (index + shift) % 4).sort(),
      count: invert ? clue.switches.length - clue.count : clue.count,
    })),
  };
}

export function trainResult(choices) {
  const counts = TRAIN_NAMES.map((_, train) => choices.filter(choice => choice.train === train).length);
  const lowest = Math.min(...counts.filter(Boolean));
  return { counts, winners: counts.flatMap((count, index) => count === lowest ? [index] : []) };
}
