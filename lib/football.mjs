export const FIELD = { width: 640, height: 360, left: 48, right: 592, top: 40, bottom: 320, goalTop: 137, goalBottom: 223 };
export const STEP_MS = 1000 / 60;
export const PLAYER_SPEED = 145;
const PLAYER_RADIUS = 10;
const BALL_RADIUS = 5;
const SPAWNS = [[100,180],[180,109],[180,251],[265,145],[265,215]];
const clamp = (n, min, max) => Math.max(min, Math.min(n, max));

export function direction(x, y) {
  const length = Math.max(1, Math.hypot(x, y));
  return [x / length, y / length];
}

export function kickoff(match, players, now) {
  const slots = { w: 0, b: 0 };
  match.actors = players.map(player => {
    const [x, y] = SPAWNS[slots[player.side]++];
    const facing = player.side === 'w' ? 1 : -1;
    return { id: player.id, side: player.side, role: player.role, bot: player.bot, x: facing === 1 ? x : FIELD.width - x, y, fx: facing, fy: 0, dx: 0, dy: 0, kickAt: 0 };
  });
  match.ball = { x: 320, y: 180, vx: 0, vy: 0 };
  match.kickoffUntil = now + 1100;
  match.reset++;
}

const distanceTo = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function steer(actor, x, y, kick = false, aim) {
  const distance = Math.hypot(x - actor.x, y - actor.y);
  const [dx, dy] = distance > 6 ? direction(x - actor.x, y - actor.y) : [0, 0];
  return { x: dx, y: dy, kick, aim };
}

function laneClear(from, to, opponents) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return false;
  return !opponents.some(opponent => {
    const t = ((opponent.x - from.x) * dx + (opponent.y - from.y) * dy) / lengthSquared;
    return t > 0 && t < 1 && Math.hypot(opponent.x - from.x - t * dx, opponent.y - from.y - t * dy) < 23;
  });
}

function botInput(actor, match, slot, nearest) {
  const { ball } = match;
  const attack = actor.side === 'w' ? 1 : -1;
  const [homeX, homeY] = SPAWNS[slot];
  const ownGoal = attack === 1 ? FIELD.left : FIELD.right;
  const opponents = match.actors.filter(other => other.side !== actor.side);
  if (actor === nearest) {
    const goalX = attack === 1 ? FIELD.right + 12 : FIELD.left - 12;
    const shots = [158, 180, 202].map(y => ({ x: goalX, y }));
    const shot = shots.find(target => laneClear(ball, target, opponents));
    const pass = match.actors
      .filter(other => other !== actor && other.side === actor.side &&
        (other.x - ball.x) * attack > 24 && distanceTo(other, ball) < 205 && laneClear(ball, other, opponents))
      .sort((a, b) => Number(a.bot) - Number(b.bot) || distanceTo(a, ball) - distanceTo(b, ball))[0];
    const target = (Math.abs(goalX - ball.x) < 175 && shot) || pass || shot || shots[1];
    const aim = direction(target.x - ball.x, target.y - ball.y);
    const interceptX = clamp(ball.x + ball.vx * .12, FIELD.left + 10, FIELD.right - 10);
    const interceptY = clamp(ball.y + ball.vy * .12, FIELD.top + 10, FIELD.bottom - 10);
    return steer(actor, interceptX, interceptY, distanceTo(actor, ball) < 21, aim);
  }
  if (slot === 0) {
    return steer(actor, ownGoal + attack * 23, clamp(ball.y, FIELD.goalTop + 13, FIELD.goalBottom - 13));
  }
  const defending = (ball.x - 320) * attack < -30;
  const home = attack === 1 ? homeX : FIELD.width - homeX;
  const x = home + (ball.x - 320) * .45 - (defending ? attack * 27 : 0);
  const y = homeY + (ball.y - 180) * (defending ? .48 : .22);
  return steer(actor, x, y);
}

export function stepFootball(match, inputs, now) {
  if (now < match.kickoffUntil) return null;
  const { ball, actors } = match;
  const hockey = match.mode === 'hockey';
  const dt = STEP_MS / 1000;
  const slots = { w: 0, b: 0 };
  const nearest = {};
  for (const actor of actors) {
    if (!actor.bot && !(actor.dx || actor.dy)) continue;
    const distance = distanceTo(ball, actor);
    if (!nearest[actor.side] || distance < nearest[actor.side].distance) nearest[actor.side] = { actor, distance };
  }
  for (const actor of actors) {
    const slot = slots[actor.side]++;
    const human = inputs.get(actor.id);
    const closest = nearest[actor.side]?.actor;
    if (actor.bot && now >= (actor.nextDecision ?? 0)) {
      actor.botControls = botInput(actor, match, slot, closest);
      actor.nextDecision = now + 135 + slot * 19;
    }
    const input = actor.bot ? actor.botControls : human?.until >= now ? human : null;
    actor.dx = input?.x ?? 0;
    actor.dy = input?.y ?? 0;
    if (actor.dx || actor.dy) [actor.fx, actor.fy] = [actor.dx, actor.dy];
    const speed = actor.bot ? PLAYER_SPEED * .84 : PLAYER_SPEED;
    const glide = hockey ? .24 : 1;
    actor.mx = (actor.mx || 0) * (1 - glide) + actor.dx * glide;
    actor.my = (actor.my || 0) * (1 - glide) + actor.dy * glide;
    actor.x = clamp(actor.x + actor.mx * speed * dt, FIELD.left + PLAYER_RADIUS, FIELD.right - PLAYER_RADIUS);
    actor.y = clamp(actor.y + actor.my * speed * dt, FIELD.top + PLAYER_RADIUS, FIELD.bottom - PLAYER_RADIUS);
    if (!input?.kick) continue;
    if (!actor.bot) input.kick = false;
    if (now - actor.kickAt < 320 || Math.hypot(ball.x - actor.x, ball.y - actor.y) > (hockey ? 26 : 23)) continue;
    actor.kickAt = now;
    const [fx, fy] = input.aim || [actor.fx, actor.fy];
    ball.vx = fx * (hockey ? 560 : 450);
    ball.vy = fy * (hockey ? 560 : 450);
    ball.x = actor.x + fx * 16;
    ball.y = actor.y + fy * 16;
  }

  for (let i = 0; i < actors.length; i++) {
    const actor = actors[i];
    for (let j = i + 1; j < actors.length; j++) {
      const other = actors[j];
      const dx = other.x - actor.x;
      const dy = other.y - actor.y;
      const distance = Math.hypot(dx, dy);
      if (distance >= PLAYER_RADIUS * 2) continue;
      const push = (PLAYER_RADIUS * 2 - distance) / 2;
      const nx = distance ? dx / distance : 1;
      const ny = distance ? dy / distance : 0;
      actor.x = clamp(actor.x - nx * push, FIELD.left + PLAYER_RADIUS, FIELD.right - PLAYER_RADIUS);
      actor.y = clamp(actor.y - ny * push, FIELD.top + PLAYER_RADIUS, FIELD.bottom - PLAYER_RADIUS);
      other.x = clamp(other.x + nx * push, FIELD.left + PLAYER_RADIUS, FIELD.right - PLAYER_RADIUS);
      other.y = clamp(other.y + ny * push, FIELD.top + PLAYER_RADIUS, FIELD.bottom - PLAYER_RADIUS);
    }
  }

  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  for (const actor of actors) {
    const dx = ball.x - actor.x;
    const dy = ball.y - actor.y;
    const distance = Math.hypot(dx, dy);
    if (distance >= PLAYER_RADIUS + BALL_RADIUS) continue;
    const [nx, ny] = distance ? [dx / distance, dy / distance] : [actor.fx, actor.fy];
    ball.x = actor.x + nx * (PLAYER_RADIUS + BALL_RADIUS);
    ball.y = actor.y + ny * (PLAYER_RADIUS + BALL_RADIUS);
    const approach = ball.vx * nx + ball.vy * ny;
    const push = Math.max(0, (actor.dx * nx + actor.dy * ny) * 105);
    ball.vx += (push - Math.min(0, approach) * 1.4) * nx;
    ball.vy += (push - Math.min(0, approach) * 1.4) * ny;
  }
  const inGoal = ball.y >= FIELD.goalTop + BALL_RADIUS && ball.y <= FIELD.goalBottom - BALL_RADIUS;
  if (inGoal && ball.x <= FIELD.left - BALL_RADIUS) return 'b';
  if (inGoal && ball.x >= FIELD.right + BALL_RADIUS) return 'w';
  if (!inGoal && (ball.x < FIELD.left + BALL_RADIUS || ball.x > FIELD.right - BALL_RADIUS)) {
    ball.x = clamp(ball.x, FIELD.left + BALL_RADIUS, FIELD.right - BALL_RADIUS);
    ball.vx *= hockey ? -.9 : -.73;
  }
  if (ball.y < FIELD.top + BALL_RADIUS || ball.y > FIELD.bottom - BALL_RADIUS) {
    ball.y = clamp(ball.y, FIELD.top + BALL_RADIUS, FIELD.bottom - BALL_RADIUS);
    ball.vy *= hockey ? -.9 : -.73;
  }
  ball.vx *= hockey ? .995 : .984;
  ball.vy *= hockey ? .995 : .984;
  return null;
}
