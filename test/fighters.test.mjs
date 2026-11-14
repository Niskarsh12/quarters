import assert from 'node:assert/strict';
import test from 'node:test';
import { botInput, createFight, stepFight } from '../lib/fighters.mjs';

function closeFight(ids = ['knight', 'rogue']) {
  const fight = createFight(ids);
  fight.banner = 0;
  fight.actors[0].x = 260;
  fight.actors[1].x = 295;
  return fight;
}
function advance(fight, count, inputs = [{}, {}]) {
  for (let i = 0; i < count; i++) stepFight(fight, inputs);
}

test('a light punch deals full damage against an open opponent and chip damage against guard', () => {
  for (const guard of [false, true]) {
    const fight = closeFight();
    stepFight(fight, [{ attack: 'light' }, { guard }]);
    advance(fight, 6, [{}, { guard }]);
    assert.equal(fight.actors[1].hp, guard ? 89 : 81);
  }
});

test('the mage special consumes meter and hits at range', () => {
  const fight = closeFight(['mage', 'rogue']);
  fight.actors[1].x = 410;
  stepFight(fight, [{ attack: 'special' }, {}]);
  assert.equal(fight.actors[0].meter, 0);
  advance(fight, 40);
  assert.equal(fight.actors[1].hp, 74);
});

test('Shadow Step closes distance before striking', () => {
  const fight = closeFight(['rogue', 'knight']);
  fight.actors[1].x = 338;
  stepFight(fight, [{ attack: 'special' }, {}]);
  advance(fight, 9);
  assert.ok(fight.actors[0].x > 290);
  assert.equal(fight.actors[1].hp, 84);
});

test('Stonebreaker breaks guard but cannot grab a jumping fighter', () => {
  for (const jump of [false, true]) {
    const fight = closeFight(['ogre', 'knight']);
    stepFight(fight, [{ attack: 'special' }, { jump, guard: !jump }]);
    advance(fight, 20, [{}, { guard: !jump }]);
    assert.equal(fight.actors[1].hp, jump ? 100 : 75);
  }
});

test('two knockouts win the match and round resets restore health', () => {
  const fight = closeFight();
  for (let round = 1; round <= 2; round++) {
    fight.actors[0].x = 260;
    fight.actors[1].x = 295;
    fight.actors[1].hp = 1;
    advance(fight, 81);
    stepFight(fight, [{ attack: 'light' }, {}]);
    advance(fight, 6);
    assert.equal(fight.result, 'K.O.');
    assert.equal(fight.knockoutFrame, fight.frame);
    assert.equal(fight.wins[0], round);
    advance(fight, 100);
    if (round === 1) {
      assert.equal(fight.actors[1].hp, 90);
      assert.equal(fight.knockoutFrame, null);
    }
  }
  assert.equal(fight.winner, 0);
});

test('full health at timeout is a draw even when max health differs', () => {
  const fight = closeFight(['ogre', 'mage']);
  fight.roundFrames = 1;
  stepFight(fight, [{}, {}]);
  assert.equal(fight.result, 'Draw round');
  assert.deepEqual(fight.wins, [0, 0]);
});

test('a fighter can retreat while jabbing and queue a follow-up during recovery', () => {
  const fight = closeFight();
  const fighter = fight.actors[0];
  stepFight(fight, [{ attack: 'light' }, {}]);
  advance(fight, 10);
  const before = fighter.x;
  stepFight(fight, [{ attack: 'heavy', move: -1 }, {}]);
  assert.ok(fighter.x < before);
  assert.equal(fighter.attack.type, 'light');
  advance(fight, 5);
  assert.equal(fighter.attack.type, 'heavy');
});

test('the practice CPU still fights but leaves gaps between attack starts', () => {
  const fight = closeFight();
  const starts = [];
  for (let frame = 0; frame < 600 && !fight.banner; frame++) {
    const input = botInput(fight);
    if (input.attack) starts.push(frame);
    stepFight(fight, [{ guard: true }, input]);
  }
  assert.ok(starts.length >= 2);
  assert.ok(starts[0] >= 45);
  for (let i = 1; i < starts.length; i++) {
    assert.ok(starts[i] - starts[i - 1] >= 76);
  }
});
