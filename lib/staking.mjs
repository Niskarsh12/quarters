// Phase 1 ledger only. No wallets, signatures, tokens or network calls.
export function depositStake(room, player) {
  if (!room.ledger.deposits[player.id]) room.ledger.deposits[player.id] = 100;
  return { mock: true, amount: 100 };
}
export function slashLosers(room, winner) {
  if (room.ledger.settled) return room.ledger;
  const pot = Object.values(room.ledger.deposits).reduce((a,b)=>a+b,0);
  const recipients = room.players.filter(p=>!winner || p.side===winner);
  room.ledger.payouts = Object.fromEntries(recipients.map(p=>[p.id,pot / recipients.length]));
  room.ledger.settled = true;
  room.ledger.mock = true;
  return room.ledger;
}
