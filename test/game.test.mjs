import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, join, ready, fillBots, tick, snapshot, setInput, MATCH_MS, EXTRA_MS } from '../lib/game.mjs';
import { FIELD } from '../lib/football.mjs';
import { MODES } from '../lib/modes.mjs';

for (const [mode, rules] of Object.entries(MODES)) {
  test(mode + ' ends immediately at its score target', () => {
    const { room, start: time } = start(mode);
    const { match } = room;
    const hero = match.actors.find(actor => actor.side === 'w');
    match.score.w = rules.target - 1;
    const now = time + 2300;
    match.ball.x = FIELD.right + 4;
    match.ball.vx = 100;
    assert.ok(now < room.deadline);
    tick(room, now);
    assert.equal(room.phase, 'finished');
    assert.equal(room.winner, 'w');
    assert.equal(match.score.w, rules.target);
    assert.equal(room.ledger.payouts[hero.id], 200);
  });
}

function start(mode = 'football') {
  const room = createRoom('TEST', 0, mode);
  const player = join(room, { name: 'Knight', side: 'w', role: 'knight' }, 0);
  ready(room, player, 0);
  fillBots(room, player, 0);
  const start = room.deadline;
  tick(room, start);
  room.match.actors.forEach(actor => { actor.bot = false; });
  return { room, player, start };
}

test('ten ready seats start a match and seat tokens stay private', () => {
  const { room, player, start: time } = start();
  const state = snapshot(room, player, time);
  assert.equal(state.pitch.actors.length, 10);
  assert.equal(state.deadline, time + MATCH_MS);
  assert.ok(state.players.every(seat => !seat.token));
});

test('four humans on the same side are split two each when the host fills six bot seats', () => {
  const room = createRoom('MIXED', 0, 'hockey');
  const humans = ['knight','archer','mage','barbarian'].map(role=>join(room,{name:role,side:'w',role},0));
  assert.throws(()=>fillBots(room,humans[1],0),/host/);
  fillBots(room,humans[0],0);
  assert.equal(room.players.filter(player=>player.bot).length,6);
  assert.equal(humans.filter(player=>player.side==='w').length,2);
  assert.equal(humans.filter(player=>player.side==='b').length,2);
  assert.equal(new Set(room.players.map(player=>player.role)).size,10);
  assert.equal(room.phase,'lobby');
  humans.forEach(player=>ready(room,player,0));
  assert.equal(room.phase,'clash');
});

test('hockey preserves puck momentum and rebounds off the boards', () => {
  const { room, start: time } = start('hockey');
  const ball = room.match.ball;
  ball.y = FIELD.top + 6;
  ball.vy = -200;
  tick(room, time + 1160);
  assert.ok(ball.vy > 160);
  assert.equal(room.match.mode, 'hockey');
});

test('movement is normalized and expires if input stops', () => {
  const { room, player, start: time } = start();
  const now = time + 1200;
  const actor = room.match.actors[0];
  setInput(room, player, { x: 1, y: 1, kick: false }, now);
  tick(room, now + 100);
  assert.ok(actor.x > 100 && actor.y > 180);
  assert.ok(Math.abs(actor.dx - Math.SQRT1_2) < 0.001);
  tick(room, now + 400);
  assert.equal(actor.dx, 0);
  assert.throws(() => setInput(room, player, { x: 2, y: 0, kick: false }, now), /Invalid/);
});

test('a kick through the goal scores once, resets the pitch and pays five winners at full time', () => {
  const { room, player, start: time } = start();
  const actor = room.match.actors[0];
  actor.x = FIELD.right - 16;
  actor.y = 180;
  room.match.ball.x = FIELD.right - 3;
  setInput(room, player, { x: 0, y: 0, kick: true }, time + 1200);
  tick(room, time + 1270);
  assert.deepEqual(room.match.score, { w: 1, b: 0 });
  assert.equal(room.match.ball.x, 320);
  tick(room, room.deadline);
  assert.equal(room.winner, 'w');
  assert.deepEqual(Object.values(room.ledger.payouts), Array(5).fill(200));
});

test('a tied match enters golden goal and the next goal wins immediately', () => {
  const { room } = start();
  const regulationEnd = room.deadline;
  tick(room, regulationEnd);
  assert.ok(room.match.overtime);
  assert.equal(room.deadline, regulationEnd + EXTRA_MS);
  room.match.ball.x = FIELD.left - 4;
  room.match.ball.vx = -100;
  tick(room, regulationEnd + 1200);
  assert.equal(room.winner, 'b');
  assert.equal(room.reason, 'Golden goal');
});

test('goalless overtime refunds each entry', () => {
  const { room } = start();
  tick(room, room.deadline);
  tick(room, room.deadline);
  assert.equal(room.phase, 'finished');
  assert.equal(room.winner, null);
  assert.deepEqual(Object.values(room.ledger.payouts), Array(10).fill(100));
});
