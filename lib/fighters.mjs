export const ROSTER = {
  knight: { name: 'Vesper', style: 'Balanced boxer', move: 'Iron Cross', hp: 100, speed: 3.2, reach: 10, power: 2, recovery: 0 },
  rogue: { name: 'Sable', style: 'Rushdown', move: 'Shadow Step', hp: 90, speed: 4.5, reach: 0, power: 0, recovery: -4 },
  ogre: { name: 'Brakk', style: 'Grappler', move: 'Stonebreaker', hp: 120, speed: 2.5, reach: 5, power: 8, recovery: 5 },
  mage: { name: 'Iona', style: 'Ranged control', move: 'Ember Bolt', hp: 88, speed: 3, reach: 8, power: 0, recovery: 1 },
  monk: { name: 'Ren', style: 'Defensive counter', move: 'Jade Reversal', hp: 100, speed: 3.5, reach: 5, power: 1, recovery: -2 },
  lancer: { name: 'Tala', style: 'Long reach', move: 'Spear Lunge', hp: 95, speed: 3.1, reach: 25, power: 2, recovery: 2 },
};

export const STAGE = { width: 640, height: 360, floor: 288 };
export const STEP = 1000 / 60;
export const SPECIALS = {
  knight: { active: 12, duration: 35, reach: 53, damage: 21, stun: 22 },
  rogue: { active: 9, duration: 31, reach: 45, damage: 16, stun: 16, lunge: 44 },
  ogre: { active: 20, duration: 49, reach: 45, damage: 25, stun: 34, groundOnly: true, throwMove: true },
  mage: { active: 15, duration: 39, projectile: true },
  monk: { active: 13, duration: 37, reach: 59, damage: 14, stun: 20 },
  lancer: { active: 17, duration: 45, reach: 86, damage: 20, stun: 24, lunge: 20 },
};
const attacks = {
  light: { active: 6, duration: 15, reach: 38, damage: 7, stun: 10 },
  heavy: { active: 14, duration: 30, reach: 54, damage: 15, stun: 18 },
};
const BUFFER_FRAMES = 8;

export function createFight(ids) {
  const fight = { ids, wins: [0, 0], round: 0, winner: null, frame: 0 };
  resetRound(fight);
  return fight;
}

function resetRound(fight) {
  fight.round++;
  fight.roundFrames = 3600;
  fight.banner = 80;
  fight.result = null;
  fight.knockoutFrame = null;
  fight.projectiles = [];
  fight.cpu = null;
  fight.actors = fight.ids.map((id, index) => ({
    id, x: index ? 435 : 205, y: 0, vy: 0, facing: index ? -1 : 1,
    hp: ROSTER[id].hp, meter: 35, stun: 0, attack: null, guard: false, walk: false,
  }));
}

function hit(fighter, incoming, damage, stun, unblockable = false) {
  const blocked = fighter.guard && !unblockable && (incoming - fighter.x) * fighter.facing > 0;
  fighter.hp = Math.max(0, fighter.hp - (blocked ? Math.floor(damage / 5) : damage));
  fighter.stun = blocked ? 6 : stun;
  fighter.attack = null;
  fighter.meter = Math.min(100, fighter.meter + 7);
  fighter.x = Math.max(26, Math.min(614, fighter.x + (fighter.x < incoming ? -1 : 1) * (blocked ? 5 : 12)));
}

export function stepFight(fight, inputs) {
  if (fight.winner !== null) return;
  fight.frame++;
  if (fight.banner > 0) {
    fight.banner--;
    if (fight.banner === 0 && fight.result) {
      const winner = fight.wins.findIndex(wins => wins >= 2);
      if (winner !== -1) fight.winner = winner;
      else if (fight.round >= 5) fight.winner = fight.wins[0] === fight.wins[1] ? -1 : Number(fight.wins[1] > fight.wins[0]);
      else resetRound(fight);
    }
    return;
  }

  const hits = [];
  for (let i = 0; i < 2; i++) {
    const player = fight.actors[i];
    const enemy = fight.actors[1 - i];
    const input = inputs[i] || {};
    const stats = ROSTER[player.id];
    const dx = Math.max(-1, Math.min(1, input.move || 0));
    if (Object.hasOwn(attacks, input.attack) || input.attack === 'special') {
      player.attackBuffer = { type: input.attack, until: fight.frame + BUFFER_FRAMES };
    }
    if (input.jump) player.jumpUntil = fight.frame + BUFFER_FRAMES;
    if (!player.attack) player.facing = enemy.x >= player.x ? 1 : -1;
    player.walk = false;
    player.guard = Boolean(input.guard && !player.attack && player.y === 0 && player.stun === 0);
    if (player.stun > 0) player.stun--;
    else if (player.attack) {
      player.attack.age++;
      const { type, age } = player.attack;
      const special = type === 'special';
      const move = special ? SPECIALS[player.id] : attacks[type];
      const duration = move.duration + stats.recovery;
      // Keep footwork during jabs, air attacks and late recovery without canceling the move.
      if (player.y > 0 || type === 'light' || age >= duration - 7) {
        player.x += dx * stats.speed * (player.y > 0 ? .8 : .5);
      }
      if (special && move.lunge && age >= move.active - 5 && age <= move.active) {
        const gap = (enemy.x - player.x) * player.facing;
        player.x += player.facing * Math.max(0, Math.min(move.lunge / 6, gap - 28));
      }
      if (age === move.active) {
        if (move.projectile) {
          fight.projectiles.push({ owner: i, x: player.x + player.facing * 22, y: player.y + 43, dx: player.facing * 7 });
        } else {
          const distance = (enemy.x - player.x) * player.facing;
          const reach = move.reach + (special ? 0 : stats.reach);
          const canReach = move.groundOnly ? enemy.y < 8 && player.y < 8 : Math.abs(enemy.y - player.y) < 55;
          if (distance >= 0 && distance <= reach && canReach) {
            const counter = special && player.id === 'monk' && enemy.attack;
            hits.push({ i, damage: move.damage + (special ? 0 : stats.power) + (counter ? 14 : 0), stun: move.stun, throwMove: move.throwMove });
          }
        }
      }
      if (age >= duration) player.attack = null;
    } else if (!player.guard) {
      if (player.jumpUntil >= fight.frame && player.y === 0) {
        player.vy = 9.8;
        player.jumpUntil = 0;
      }
      player.x += dx * stats.speed;
      player.walk = Boolean(dx);
      const queued = player.attackBuffer;
      if (queued && queued.until >= fight.frame) {
        player.attackBuffer = null;
        if (queued.type !== 'special' || player.meter >= 35) {
          if (queued.type === 'special') player.meter -= 35;
          player.attack = { type: queued.type, age: 0 };
        }
      }
    }
    if (player.vy || player.y > 0) {
      player.y = Math.max(0, player.y + player.vy);
      player.vy = player.y ? player.vy - .58 : 0;
    }
    player.x = Math.max(26, Math.min(614, player.x));
  }
  for (const result of hits) {
    const owner = fight.actors[result.i];
    hit(fight.actors[1 - result.i], owner.x, result.damage, result.stun, result.throwMove);
    owner.meter = Math.min(100, owner.meter + 13);
  }
  fight.projectiles = fight.projectiles.filter(projectile => {
    projectile.x += projectile.dx;
    const target = fight.actors[1 - projectile.owner];
    if (Math.abs(projectile.x - target.x) < 19 && Math.abs(projectile.y - target.y - 45) < 27) {
      hit(target, projectile.x - projectile.dx, 16, 16);
      return false;
    }
    return projectile.x > 0 && projectile.x < STAGE.width;
  });
  const [a, b] = fight.actors;
  if (Math.abs(a.x - b.x) < 27 && Math.abs(a.y - b.y) < 45) {
    const left = a.x <= b.x ? a : b;
    const right = left === a ? b : a;
    const x = Math.max(26, Math.min(587, (left.x + right.x - 27) / 2));
    left.x = x;
    right.x = x + 27;
  }
  fight.roundFrames--;
  if (!a.hp || !b.hp || fight.roundFrames <= 0) {
    const knockout = !a.hp || !b.hp;
    const first = a.hp * ROSTER[b.id].hp;
    const second = b.hp * ROSTER[a.id].hp;
    if (first !== second) fight.wins[Number(second > first)]++;
    fight.result = first === second ? 'Draw round' : knockout ? 'K.O.' : 'Time up';
    if (knockout) fight.knockoutFrame = fight.frame;
    fight.banner = 100;
  }
}

export function botInput(fight, index = 1) {
  if (fight.banner || fight.winner !== null) return {};
  const self = fight.actors[index];
  const enemy = fight.actors[1 - index];
  if (self.stun || self.attack) return {};
  const cpu = fight.cpu ??= { decisionAt: fight.frame + 24, attackAt: fight.frame + 45, turns: 0, move: 0, guard: false };
  if (fight.frame < cpu.decisionAt) return { move: cpu.move, guard: cpu.guard };

  const distance = Math.abs(self.x - enemy.x);
  const toward = Math.sign(enemy.x - self.x);
  const reach = attacks.light.reach + ROSTER[self.id].reach;
  const turn = ++cpu.turns;
  cpu.decisionAt = fight.frame + 13 + (turn % 3) * 4;
  cpu.move = 0;
  cpu.guard = false;

  if (enemy.attack?.age >= 8 && distance < 75 && turn % 3 === 0) {
    cpu.guard = true;
  } else if (fight.frame >= cpu.attackAt && Math.abs(enemy.y - self.y) < 32) {
    const rangedOpening = self.id === 'mage' && distance >= 100 && distance <= 170;
    if (self.meter >= 35 && turn % 4 === 0 && (distance <= reach || rangedOpening)) {
      cpu.attackAt = fight.frame + 112;
      return { attack: 'special' };
    }
    if (distance <= reach) {
      cpu.attackAt = fight.frame + 76 + (turn % 3) * 10;
      return { attack: turn % 3 === 0 ? 'heavy' : 'light' };
    }
  }

  if (!cpu.guard) {
    if (distance > reach && (fight.frame >= cpu.attackAt - 25 || distance > 110)) cpu.move = toward * .62;
    else if (distance < reach + 12 && fight.frame < cpu.attackAt - 22) cpu.move = -toward * .42;
  }
  return { move: cpu.move, guard: cpu.guard };
}
