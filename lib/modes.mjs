export const MODES = {
  football: {
    name: 'Football', objective: 'Score through the opposing gate.',
    target: 10, unit: 'goals',
    action: 'Kick', tieBreak: 'Golden goal', start: 'Kickoff',
  },
  hockey: {
    name: 'Ice Hockey', objective: 'Skate, bank the puck off the boards, and shoot.',
    target: 7, unit: 'goals',
    action: 'Shoot', tieBreak: 'Sudden death', start: 'Faceoff',
  },

};

export function isMode(value) {
  return typeof value === 'string' && Object.hasOwn(MODES, value);
}
