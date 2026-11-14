export function drawSpecial(ctx, fighter, active) {
  const age = fighter.attack.age;
  const elapsed = age - active;
  if (elapsed < -9 || elapsed > 17) return;
  const charge = elapsed < 0;
  const fade = charge ? .45 + (elapsed + 9) / 18 : 1 - elapsed / 18;
  ctx.save();
  ctx.globalAlpha = fade;
  switch (fighter.id) {
    case 'knight':
      ctx.fillStyle = '#ffba47';
      ctx.fillRect(23, -63, charge ? 15 : 43, 7);
      ctx.fillStyle = '#fff1b0';
      ctx.fillRect(32, -68, charge ? 9 : 23, 17);
      ctx.fillRect(41, -73, 6, 27);
      break;
    case 'rogue':
      ctx.fillStyle = '#a65cfa';
      for (let i = 0; i < 4; i++) ctx.fillRect(-18 - 12 * i, -65 + i * 10, 49 - i * 7, 4);
      ctx.fillStyle = '#f5ceff';
      ctx.fillRect(15, -56, 30, 3);
      break;
    case 'ogre':
      ctx.fillStyle = '#ed7b45';
      for (let i = 0; i < 6; i++) {
        const spread = Math.max(0, elapsed) * (i + 2) / 4;
        ctx.fillRect((i - 2) * 14 + spread, -6 - (i % 3) * 5, 8, 4 + i % 3);
      }
      ctx.fillStyle = '#ffe39b';
      ctx.fillRect(3, -6, 44 + Math.max(0, elapsed) * 2, 3);
      break;
    case 'mage':
      ctx.fillStyle = '#fc7146';
      ctx.fillRect(28, -57, 19, 21);
      ctx.fillStyle = '#ffefab';
      ctx.fillRect(32, -51, 12, 10);
      break;
    case 'monk':
      ctx.strokeStyle = '#75f2ad';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(26, -51, 15 + Math.max(0, elapsed), -.9 * Math.PI, .52 * Math.PI);
      ctx.stroke();
      ctx.fillStyle = '#d2ffcf';
      ctx.fillRect(33, -54, 11, 8);
      break;
    case 'lancer':
      ctx.fillStyle = '#62dafd';
      ctx.fillRect(22, -55, charge ? 45 : 90, 5);
      ctx.fillStyle = '#e4faff';
      ctx.fillRect(52, -53, charge ? 12 : 59, 2);
      break;
  }
  ctx.restore();
}

export function drawProjectile(ctx, x, y, direction, frame) {
  const flicker = Math.floor(frame / 3) % 3;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale(Math.sign(direction), 1);
  ctx.fillStyle = '#e04b38';
  ctx.fillRect(-25 - flicker * 3, -3, 30 + flicker * 3, 6);
  ctx.fillStyle = '#ff9c42';
  ctx.fillRect(-11, -7, 20, 14);
  ctx.fillStyle = '#fff4b0';
  ctx.fillRect(-4, -4, 14, 8);
  ctx.restore();
}
