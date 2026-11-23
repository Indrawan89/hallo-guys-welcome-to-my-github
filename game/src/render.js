// All drawing for SOLMAR BAY: the city, the people and cars in it, the HUD
// with its minimap, and the title / busted / win screens. One canvas, no images.
import { WORLD_SIZE, ROADS, ROAD_W, districtAt, isBeach } from './world.js';
import { trafficPosition } from './entities.js';
import { currentMission, currentStep, missionObjective } from './missions.js';

function drawCar(ctx, x, y, angle, color, police) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(-20, -10, 42, 22);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(-20, -11, 40, 22, 6);
  ctx.fill();
  ctx.fillStyle = police ? '#dfe6e9' : '#222831';
  ctx.beginPath();
  ctx.roundRect(-6, -9, 14, 18, 3);
  ctx.fill();
  if (police) {
    ctx.fillStyle = '#0984e3';
    ctx.fillRect(-16, -11, 8, 5);
    ctx.fillStyle = '#d63031';
    ctx.fillRect(-16, 6, 8, 5);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 7px sans-serif';
    ctx.fillText('PD', -2, 3);
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(16, -9, 3, 4);
    ctx.fillRect(16, 5, 3, 4);
  }
  ctx.restore();
}

function drawPerson(ctx, x, y, angle, shirt, scale) {
  const s = scale || 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(0, 2, 9 * s, 6 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = shirt;
  ctx.beginPath();
  ctx.arc(0, 0, 8 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f1c27d';
  ctx.beginPath();
  ctx.arc(4 * s, 0, 4.5 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawWorld(ctx, world, cam, vw, vh, time) {
  const x0 = Math.max(0, cam.x - vw / 2 - 80);
  const y0 = Math.max(0, cam.y - vh / 2 - 80);
  const x1 = Math.min(WORLD_SIZE, cam.x + vw / 2 + 80);
  const y1 = Math.min(WORLD_SIZE, cam.y + vh / 2 + 80);

  // Ground: district tints.
  for (const d of world.districts) {
    if (d.x + d.w < x0 || d.x > x1 || d.y + d.h < y0 || d.y > y1) continue;
    ctx.fillStyle = d.ground;
    ctx.fillRect(Math.max(d.x, x0), Math.max(d.y, y0),
      Math.min(d.x + d.w, x1) - Math.max(d.x, x0),
      Math.min(d.y + d.h, y1) - Math.max(d.y, y0));
  }

  // Beach sand and animated water on the west edge.
  ctx.fillStyle = '#e8d8a0';
  ctx.fillRect(0, y0, 170, y1 - y0);
  ctx.fillStyle = '#1e90c8';
  ctx.fillRect(0, y0, 62 + Math.sin(time * 1.4) * 8, y1 - y0);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  for (let y = Math.floor(y0 / 90) * 90; y < y1; y += 90) {
    ctx.fillRect(58 + Math.sin(time + y * 0.05) * 6, y, 26, 3);
  }

  // Roads.
  ctx.fillStyle = '#2d3436';
  for (const r of ROADS) {
    ctx.fillRect(r - ROAD_W / 2, y0, ROAD_W, y1 - y0);
    ctx.fillRect(x0, r - ROAD_W / 2, x1 - x0, ROAD_W);
  }
  // Centre dashes.
  ctx.fillStyle = '#f5d76e';
  for (const r of ROADS) {
    for (let d = Math.floor(y0 / 60) * 60; d < y1; d += 60) {
      ctx.fillRect(r - 2, d, 4, 26);
      ctx.fillRect(d, r - 2, 26, 4);
    }
  }

  // Parks.
  for (const p of world.parks) {
    if (p.x > x1 || p.x + p.w < x0 || p.y > y1 || p.y + p.h < y0) continue;
    ctx.fillStyle = '#27ae60';
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = '#2ecc71';
    ctx.fillRect(p.x + 8, p.y + 8, p.w - 16, p.h - 16);
  }

  // Buildings with roof shading.
  for (const b of world.buildings) {
    if (b.x > x1 || b.x + b.w < x0 || b.y > y1 || b.y + b.h < y0) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(b.x + 5, b.y + 6, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    for (let wy = b.y + 16; wy < b.y + b.h - 10; wy += 26) {
      for (let wx = b.x + 12; wx < b.x + b.w - 10; wx += 24) {
        ctx.fillRect(wx, wy, 10, 12);
      }
    }
  }

  // Trees and palms.
  for (const t of world.trees) {
    if (t.x < x0 || t.x > x1 || t.y < y0 || t.y > y1) continue;
    ctx.fillStyle = '#6c4a2f';
    ctx.fillRect(t.x - 2, t.y - 2, 4, 10);
    ctx.fillStyle = t.palm ? '#2ecc71' : '#1e8449';
    ctx.beginPath();
    ctx.arc(t.x, t.y - 4, t.palm ? 13 : 10, 0, Math.PI * 2);
    ctx.fill();
  }

  // Pickups: cash spins gold, health pulses green.
  for (const pk of world.pickups) {
    if (pk.taken || pk.x < x0 || pk.x > x1 || pk.y < y0 || pk.y > y1) continue;
    const bob = Math.sin(time * 3 + pk.bob) * 3;
    if (pk.kind === 'cash') {
      ctx.fillStyle = '#f1c40f';
      ctx.beginPath();
      ctx.arc(pk.x, pk.y + bob, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#7d6608';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('$', pk.x, pk.y + bob);
    } else {
      ctx.fillStyle = '#2ecc71';
      ctx.fillRect(pk.x - 11, pk.y + bob - 4, 22, 8);
      ctx.fillRect(pk.x - 4, pk.y + bob - 11, 8, 22);
    }
  }
}

export function drawEntities(ctx, state) {
  const { world, traffic, peds, police, player, ms } = state;
  for (const c of world.parkedCars) {
    if (c.taken) continue;
    drawCar(ctx, c.x, c.y, c.angle, c.color, false);
  }
  for (const c of traffic) {
    const p = trafficPosition(c);
    drawCar(ctx, p.x, p.y, p.angle, c.color, false);
  }
  for (const p of peds) drawPerson(ctx, p.x, p.y, p.angle, p.shirt, 1);
  for (const g of ms.goons) drawPerson(ctx, g.x, g.y, g.angle, g.shirt, 1.15);
  for (const c of police) {
    drawCar(ctx, c.x, c.y, c.angle, c.color, true);
    // Flashing light halo.
    ctx.fillStyle = Math.floor(state.time * 4 + c.siren) % 2 ? 'rgba(9,132,227,0.25)' : 'rgba(214,48,49,0.25)';
    ctx.beginPath();
    ctx.arc(c.x, c.y, 26, 0, Math.PI * 2);
    ctx.fill();
  }
  if (player.car) {
    drawCar(ctx, player.car.x, player.car.y, player.car.angle, player.car.color, false);
  } else {
    drawPerson(ctx, player.x, player.y, player.angle, '#e74c3c', 1.1);
  }
}

// Objective marker: a pulsing diamond above the target plus a screen-edge arrow.
export function drawMarker(ctx, state, vw, vh) {
  const ms = state.ms;
  if (ms.done) return;
  const step = currentStep(ms);
  const target = step.target;
  if (!target) return;
  const cam = state.cam;
  const sx = target.x - (cam.x - vw / 2);
  const sy = target.y - (cam.y - vh / 2);
  const pulse = 1 + Math.sin(state.time * 4) * 0.15;
  if (sx > 20 && sx < vw - 20 && sy > 20 && sy < vh - 20) {
    ctx.save();
    ctx.translate(sx, sy - 34 * pulse);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#f1c40f';
    ctx.strokeStyle = '#7d6608';
    ctx.lineWidth = 2;
    ctx.fillRect(-9, -9, 18, 18);
    ctx.strokeRect(-9, -9, 18, 18);
    ctx.restore();
    ctx.fillStyle = '#f1c40f';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(target.name, sx, sy - 52 * pulse);
  } else {
    // Off-screen: point at the edge.
    const cx = vw / 2, cy = vh / 2;
    const a = Math.atan2(sy - cy, sx - cx);
    const ex = cx + Math.cos(a) * (Math.min(vw, vh) / 2 - 50);
    const ey = cy + Math.sin(a) * (Math.min(vw, vh) / 2 - 50);
    ctx.save();
    ctx.translate(ex, ey);
    ctx.rotate(a);
    ctx.fillStyle = '#f1c40f';
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-10, -11);
    ctx.lineTo(-10, 11);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#f1c40f';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${target.name}  ${Math.round(Math.hypot(target.x - state.player.x, target.y - state.player.y))}m`, ex, ey + 26);
  }
}

export function drawMinimap(ctx, state, x, y, size) {
  const s = size / WORLD_SIZE;
  ctx.save();
  ctx.fillStyle = 'rgba(10,14,20,0.85)';
  ctx.fillRect(x, y, size, size);
  ctx.strokeStyle = '#f1c40f';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, size, size);
  for (const d of state.world.districts) {
    ctx.fillStyle = d.ground;
    ctx.fillRect(x + d.x * s, y + d.y * s, d.w * s, d.h * s);
  }
  ctx.strokeStyle = '#2d3436';
  ctx.lineWidth = 1;
  for (const r of ROADS) {
    ctx.beginPath(); ctx.moveTo(x + r * s, y); ctx.lineTo(x + r * s, y + size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y + r * s); ctx.lineTo(x + size, y + r * s); ctx.stroke();
  }
  // Objective marker.
  const ms = state.ms;
  if (!ms.done) {
    const step = currentStep(ms);
    if (step.target) {
      ctx.fillStyle = '#f1c40f';
      ctx.beginPath();
      ctx.arc(x + step.target.x * s, y + step.target.y * s, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Police as blue dots, player as a white arrow.
  ctx.fillStyle = '#0984e3';
  for (const c of state.police) {
    ctx.fillRect(x + c.x * s - 2, y + c.y * s - 2, 4, 4);
  }
  ctx.save();
  ctx.translate(x + state.player.x * s, y + state.player.y * s);
  ctx.rotate(state.player.angle);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(6, 0);
  ctx.lineTo(-4, -4);
  ctx.lineTo(-4, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // Viewport rectangle.
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1;
  ctx.strokeRect(
    x + (state.cam.x - state.vw / 2) * s,
    y + (state.cam.y - state.vh / 2) * s,
    state.vw * s, state.vh * s);
  ctx.restore();
}

export function drawHud(ctx, state) {
  const { vw, vh, player, ms } = state;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  // Money and health, top left.
  ctx.fillStyle = 'rgba(10,14,20,0.7)';
  ctx.fillRect(12, 12, 210, 64);
  ctx.fillStyle = '#2ecc71';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(`$${player.money.toLocaleString('en-US')}`, 22, 40);
  ctx.fillStyle = '#e74c3c';
  ctx.fillRect(22, 50, 150, 10);
  ctx.fillStyle = '#2ecc71';
  ctx.fillRect(22, 50, 150 * Math.max(0, player.health) / 100, 10);
  ctx.fillStyle = '#fff';
  ctx.font = '12px sans-serif';
  ctx.fillText(`${Math.max(0, Math.round(player.health))} HP`, 178, 59);

  // Wanted stars, top right.
  const stars = Math.floor(player.wanted);
  ctx.fillStyle = 'rgba(10,14,20,0.7)';
  ctx.fillRect(vw - 172, 12, 160, 40);
  ctx.font = 'bold 24px sans-serif';
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < stars ? '#f1c40f' : 'rgba(255,255,255,0.25)';
    ctx.fillText('★', vw - 160 + i * 30, 42);
  }

  // District name, top centre.
  const d = districtAt(player.x, player.y);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(d.name, vw / 2, 32);

  // Mission objective, bottom centre.
  ctx.fillStyle = 'rgba(10,14,20,0.75)';
  const obj = missionObjective(ms);
  ctx.font = 'bold 15px sans-serif';
  const w = ctx.measureText(obj).width + 28;
  ctx.fillRect(vw / 2 - w / 2, vh - 52, w, 32);
  ctx.fillStyle = '#f1c40f';
  ctx.fillText(obj, vw / 2, vh - 30);

  // Timers for survive / timed / hold steps.
  const step = currentStep(ms);
  if (!ms.done && step.kind === 'survive' && ms.timer > 0) {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(`Stay free: ${Math.ceil(ms.timer)}s`, vw / 2, vh - 66);
  }
  if (!ms.done && step.kind === 'timed' && ms.timer > 0) {
    ctx.fillStyle = ms.timer < 20 ? '#e74c3c' : '#fff';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(`Time left: ${Math.ceil(ms.timer)}s`, vw / 2, vh - 66);
  }
  if (!ms.done && step.kind === 'hold' && ms.holdProgress > 0) {
    ctx.fillStyle = '#f1c40f';
    ctx.fillRect(vw / 2 - 100, vh - 78, 200 * (ms.holdProgress / step.seconds), 10);
    ctx.strokeStyle = '#fff';
    ctx.strokeRect(vw / 2 - 100, vh - 78, 200, 10);
  }

  // Centre message (mission complete etc).
  if (ms.messageTimer > 0) {
    ctx.fillStyle = 'rgba(10,14,20,0.8)';
    ctx.font = 'bold 18px sans-serif';
    const mw = ctx.measureText(ms.message).width + 30;
    ctx.fillRect(vw / 2 - mw / 2, vh / 2 - 90, mw, 36);
    ctx.fillStyle = '#2ecc71';
    ctx.fillText(ms.message, vw / 2, vh / 2 - 65);
  }

  // Controls hint, bottom left.
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(player.onFoot ? 'WASD move · E enter car · P pause' : 'W/S drive · A/D steer · Space brake · E exit car', 12, vh - 14);

  // Minimap, bottom right.
  drawMinimap(ctx, state, vw - 196, vh - 196, 184);
}

export function drawTitle(ctx, vw, vh, state) {
  ctx.fillStyle = '#0b1020';
  ctx.fillRect(0, 0, vw, vh);
  // Sun-soaked city silhouette behind the title.
  const g = ctx.createLinearGradient(0, 0, 0, vh);
  g.addColorStop(0, '#ff9a56');
  g.addColorStop(0.55, '#e76f51');
  g.addColorStop(1, '#264653');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, vw, vh * 0.62);
  ctx.fillStyle = '#1d3557';
  for (let i = 0; i < 26; i++) {
    const bx = (i * 97) % vw;
    const bh = 90 + ((i * 53) % 150);
    ctx.fillRect(bx, vh * 0.62 - bh, 70, bh);
  }
  ctx.fillStyle = '#f4a261';
  ctx.beginPath();
  ctx.arc(vw - 180, 130, 62, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#264653';
  ctx.fillRect(0, vh * 0.62, vw, vh * 0.38);
  ctx.fillStyle = '#2a9d8f';
  ctx.fillRect(0, vh * 0.62, vw, 8);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 64px sans-serif';
  ctx.fillText('SOLMAR BAY', vw / 2, vh * 0.34);
  ctx.fillStyle = '#ffd166';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('An open-world crime story — steal, drive, survive.', vw / 2, vh * 0.34 + 40);
  ctx.fillStyle = '#fff';
  ctx.font = '18px sans-serif';
  ctx.fillText('Six missions. One city. Your rules.', vw / 2, vh * 0.34 + 72);
  const blink = Math.floor(state.time * 2) % 2 === 0;
  if (blink) {
    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('Press ENTER to start', vw / 2, vh * 0.78);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '15px sans-serif';
  ctx.fillText('WASD / arrows to move · E to enter a car · Missions pay cash · Watch your wanted level', vw / 2, vh * 0.86);
  ctx.fillText('A game built for the make.fun GTA 6 bounty — an original city, story and cast.', vw / 2, vh * 0.90);
}

export function drawEnd(ctx, vw, vh, title, lines, color) {
  ctx.fillStyle = 'rgba(8,10,18,0.88)';
  ctx.fillRect(0, 0, vw, vh);
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.font = 'bold 52px sans-serif';
  ctx.fillText(title, vw / 2, vh * 0.36);
  ctx.fillStyle = '#fff';
  ctx.font = '20px sans-serif';
  lines.forEach((l, i) => ctx.fillText(l, vw / 2, vh * 0.36 + 44 + i * 32));
  ctx.fillStyle = '#ffd166';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText('Press ENTER to play again', vw / 2, vh * 0.36 + 44 + lines.length * 32 + 30);
}
