import { randomBytes, randomUUID } from 'node:crypto';
import { createFight, ROSTER, STEP, stepFight } from '../../../lib/fighters.mjs';
import { confirmDeposit, initStakeSeat, publicStake, requireStakeReady, settleStake, stakeFor, verifiedNearConfig } from '../../../lib/near-escrow.mjs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const rooms = globalThis.dungeonFighterRooms ??= new Map();

function advance(room, now) {
  room.lastStep = Math.max(room.lastStep ?? now, now - 140);
  while (room.fight && room.fight.winner === null && room.lastStep + STEP <= now) {
    room.lastStep += STEP;
    const inputs = room.seats.map(seat => {
      if (room.lastStep > seat.expires) return {};
      const input = { ...seat.input, ...seat.pending };
      if (!room.fight.banner) seat.pending = {};
      return input;
    });
    stepFight(room.fight, inputs);
  }
  if (room.stake && Number.isInteger(room.fight?.winner) && !room.stake.settlement) settle(room);
}

function settle(room) {
  const winner = room.fight.winner;
  settleStake(room, winner < 0 ? [] : [room.seats[winner]]);
}

if (!globalThis.dungeonFighterTimer) {
  globalThis.dungeonFighterTimer = setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms) {
      if (now - room.touched > 30 * 60_000) rooms.delete(code);
      else advance(room, now);
    }
  }, 16);
  globalThis.dungeonFighterTimer.unref?.();
}

function reply(payload, status = 200) {
  return Response.json(payload, { status, headers: { 'Cache-Control': 'no-store' } });
}

function seatFor(fighter) {
  if (typeof fighter !== 'string' || !Object.hasOwn(ROSTER, fighter)) throw new Error('Choose a fighter.');
  return { fighter, token: randomUUID(), expires: 0, input: {}, pending: {}, ready: false };
}

export async function POST(request) {
  try {
    const origin = request.headers.get('origin');
    if (origin && new URL(origin).host !== request.headers.get('host')) return reply({ error: 'Invalid origin.' }, 403);
    const raw = await request.text();
    if (raw.length > 2000) return reply({ error: 'Request too large.' }, 413);
    const { action, fighter, code, input, stake, account } = JSON.parse(raw);
    const now = Date.now();
    let room;
    let seat;
    let issueToken = false;

    if (action === 'create') {
      const escrow = stakeFor(stake);
      if (escrow && !(await verifiedNearConfig()).enabled) throw new Error('The Testnet escrow is unavailable.');
      if (rooms.size >= 150) throw new Error('The arcade is full. Try again in a moment.');
      seat = seatFor(fighter);
      let roomCode;
      do { roomCode = randomBytes(3).toString('hex').toUpperCase(); } while (rooms.has(roomCode));
      room = { code: roomCode, seats: [seat], touched: now, fight: null, stake: escrow };
      initStakeSeat(room, seat);
      rooms.set(roomCode, room);
      issueToken = true;
    } else {
      room = rooms.get(String(code).trim().toUpperCase());
      if (!room) throw new Error('Room expired or code not found.');
      if (action === 'join') {
        if (room.stake && now >= room.stake.expiresAt) throw new Error('This paid lobby expired.');
        if (room.seats.length === 2) throw new Error('This cabinet is full.');
        seat = seatFor(fighter);
        initStakeSeat(room, seat);
        room.seats.push(seat);
        issueToken = true;
      } else {
        const token = request.headers.get('authorization')?.slice(7);
        seat = room.seats.find(player => player.token === token);
        if (!seat) return reply({ error: 'This player seat could not be verified.' }, 403);
        advance(room, now);
        if (action === 'deposit' && !room.fight) {
          await confirmDeposit(room, seat, account);
        } else if (action === 'leave' && !room.fight) {
          room.seats = room.seats.filter(player => player !== seat);
          if (!room.seats.length) rooms.delete(room.code);
          return reply({ left: true });
        } else if (action === 'settle' && room.stake && Number.isInteger(room.fight?.winner)) {
          settle(room);
        } else if (action === 'ready' && (!room.fight || room.fight.winner !== null)) {
          if (room.stake && room.fight) throw new Error('Create a new room for a new Testnet stake.');
          requireStakeReady(room, seat);
          seat.ready = true;
          if (room.seats.length === 2 && room.seats.every(player => player.ready)) {
            for (const player of room.seats) {
              player.ready = false;
              player.expires = 0;
              player.pending = {};
            }
            room.fight = createFight(room.seats.map(player => player.fighter));
            room.lastStep = now;
          }
        } else if (action === 'sync' && input && room.fight?.winner === null) {
          seat.input = { move: [-1, 0, 1].includes(input.move) ? input.move : 0, guard: input.guard === true };
          if (input.jump === true) seat.pending.jump = true;
          if (['light', 'heavy', 'special'].includes(input.attack)) seat.pending.attack = input.attack;
          seat.expires = now + 230;
        } else if (!['ready', 'sync'].includes(action)) {
          throw new Error('Unknown cabinet action.');
        }
      }
    }
    room.touched = now;
    return reply({
      code: room.code, index: room.seats.indexOf(seat), seats: room.seats.map(({ fighter, ready }) => ({ fighter, ready })),
      fight: room.fight, stake: publicStake(room, seat), ...(issueToken ? { token: seat.token } : {}),
    });
  } catch (error) {
    return reply({ error: error.message || 'Could not reach this cabinet.' }, 400);
  }
}
