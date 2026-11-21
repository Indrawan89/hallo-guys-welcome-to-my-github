// The three scenes, all drawn in code — no image files. Each scene is one
// draw(ctx, right) function: the LEFT panel calls it with right=false, the
// RIGHT panel with right=true, and the differences are the conditionals on
// `right`. Every difference lists its centre and radius in panel space, so
// the world can test clicks and the renderer can ring found ones.
function circle(ctx, x, y, r, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}
function rect(ctx, x, y, w, h, fill) {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
}
function ellipse(ctx, x, y, rx, ry, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}
function poly(ctx, points, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
  ctx.fill();
}
function line(ctx, x1, y1, x2, y2, color, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
function text(ctx, str, x, y, size, color, align = 'center') {
  ctx.fillStyle = color;
  ctx.font = `bold ${size}px Georgia, serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(str, x, y);
}
function lantern(ctx, x, y, color, glow) {
  if (glow) {
    ctx.fillStyle = 'rgba(255,190,80,0.25)';
    ctx.beginPath();
    ctx.arc(x, y, 34, 0, Math.PI * 2);
    ctx.fill();
  }
  ellipse(ctx, x, y, 16, 21, color);
  rect(ctx, x - 8, y - 26, 16, 6, '#8a6d2f');
  rect(ctx, x - 8, y + 20, 16, 6, '#8a6d2f');
  line(ctx, x, y - 32, x, y - 26, '#5b4636', 2);
  ctx.fillStyle = 'rgba(255,240,180,0.85)';
  ctx.fillRect(x - 3, y - 12, 6, 24);
}
function cat(ctx, x, y, color, tailUp) {
  ellipse(ctx, x, y, 26, 15, color); // body
  circle(ctx, x + 20, y - 12, 11, color); // head
  poly(ctx, [[x + 12, y - 18], [x + 15, y - 30], [x + 20, y - 19]], color); // ears
  poly(ctx, [[x + 22, y - 20], [x + 27, y - 30], [x + 30, y - 19]], color);
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.beginPath();
  if (tailUp) {
    ctx.moveTo(x - 24, y - 2);
    ctx.quadraticCurveTo(x - 38, y - 6, x - 34, y - 26);
  } else {
    ctx.moveTo(x - 24, y - 2);
    ctx.quadraticCurveTo(x - 40, y + 4, x - 44, y + 14);
  }
  ctx.stroke();
  circle(ctx, x + 24, y - 14, 1.6, '#1c1420');
}
function bird(ctx, x, y, color = '#2c2438') {
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x - 7, y, 7, Math.PI * 1.1, Math.PI * 1.9);
  ctx.arc(x + 7, y, 7, Math.PI * 1.1, Math.PI * 1.9);
  ctx.stroke();
}

// --- Scene 1: Lantern Market, a night stall under paper lanterns. ---
function drawMarket(ctx, right) {
  rect(ctx, 0, 0, 560, 470, '#241a3d'); // night sky
  for (const [sx, sy] of [[40, 40], [150, 70], [300, 36], [430, 80], [510, 44]]) {
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath();
    ctx.arc(sx, sy, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  circle(ctx, 480, 62, 30, '#f7e8b0'); // moon
  if (!right) circle(ctx, 468, 54, 26, '#241a3d'); // DIFF 1: crescent vs full moon
  circle(ctx, 500, 110, 0, '#000'); // (no-op keeps layout obvious)
  rect(ctx, 0, 300, 560, 170, '#3a2b52'); // street
  rect(ctx, 0, 300, 560, 10, '#2c2140');
  // Sacks and cobbles on the street, below the counter.
  ellipse(ctx, 90, 428, 34, 20, '#5d4a35');
  ellipse(ctx, 90, 414, 22, 12, '#6b563e');
  ellipse(ctx, 480, 432, 30, 18, '#5d4a35');
  for (const [cx, cy] of [[200, 420], [260, 440], [330, 418], [400, 442], [150, 446]]) circle(ctx, cx, cy, 4, '#4a3a63');
  // Stall: striped awning, counter, baskets.
  poly(ctx, [[30, 170], [530, 170], [500, 300], [60, 300]], '#7a2e2e');
  for (let i = 0; i < 8; i += 1) rect(ctx, 30 + i * 62, 170, 31, 130, i % 2 ? '#f2e3c6' : '#c94f43');
  rect(ctx, 60, 300, 440, 90, '#6b4a2f');
  rect(ctx, 60, 300, 440, 12, '#8a6238');
  rect(ctx, 150, 184, 260, 42, 'rgba(20,12,30,0.55)'); // dark band so the sign reads
  text(ctx, 'PASAR SENJA', 280, 205, 26, '#fff3d6');
  // Lantern row under the awning.
  lantern(ctx, 110, 250, right ? '#3fae6a' : '#e04b3a', true); // DIFF 2: lantern turns green
  lantern(ctx, 210, 250, '#e04b3a', true);
  lantern(ctx, 310, 250, '#f2a541', true);
  lantern(ctx, 410, 250, '#e04b3a', true);
  // Cat asleep on the counter (right panel: the cat went home).
  if (!right) cat(ctx, 470, 296, '#3b3b4d', true); // DIFF 3: cat present / absent
  // Baskets of oranges on the counter.
  circle(ctx, 120, 330, 15, '#e07b28');
  circle(ctx, 145, 330, 15, '#e07b28');
  if (!right) circle(ctx, 132, 312, 15, '#e07b28'); // DIFF 4: three oranges vs two
  ellipse(ctx, 120, 348, 34, 8, '#4a3220');
  // Flower pot on the stall window (right panel: empty sill).
  rect(ctx, 250, 330, 44, 26, '#b45a3c');
  if (!right) { // DIFF 5: flowers present / absent
    circle(ctx, 260, 322, 9, '#e86aa0');
    circle(ctx, 272, 316, 9, '#e86aa0');
    circle(ctx, 284, 322, 9, '#e86aa0');
    line(ctx, 272, 330, 272, 318, '#3f8f4f', 3);
  }
  // Banner hanging from the awning: three stripes vs two.
  rect(ctx, 330, 250, 60, 46, '#f2e3c6');
  rect(ctx, 336, 258, 48, 8, '#c94f43');
  if (!right) rect(ctx, 336, 272, 48, 8, '#3f6fb5'); // DIFF 6: blue stripe present / absent
  rect(ctx, 336, 286, 48, 8, '#3f8f4f');
  // Bird on the wire (right panel: flown away). Light strokes: night sky.
  line(ctx, 0, 96, 560, 96, '#14101f', 3);
  if (!right) bird(ctx, 90, 92, '#e8ddc0'); // DIFF 7: bird present / absent
  bird(ctx, 350, 92, '#e8ddc0');
}

// --- Scene 2: Harbour at Dawn. ---
function drawHarbour(ctx, right) {
  rect(ctx, 0, 0, 560, 300, '#ffd9a0'); // dawn sky
  circle(ctx, 90, 80, 34, '#ff9d45'); // sun
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    line(ctx, 90 + Math.cos(a) * 44, 80 + Math.sin(a) * 44, 90 + Math.cos(a) * 56, 80 + Math.sin(a) * 56, '#ff9d45', 4);
  }
  if (!right) { // DIFF 1: a cloud drifts past the sun
    ellipse(ctx, 170, 66, 46, 16, '#fff2dc');
    ellipse(ctx, 200, 74, 36, 13, '#fff2dc');
  }
  rect(ctx, 0, 300, 560, 170, '#2f6f8f'); // sea
  for (const wy of [330, 370, 415, 450]) {
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = 0; x <= 560; x += 20) ctx.lineTo(x, wy + Math.sin((x + wy) / 40) * 4);
    ctx.stroke();
  }
  // Lighthouse on the left headland.
  poly(ctx, [[40, 300], [120, 300], [108, 150], [52, 150]], '#f2ead8');
  rect(ctx, 44, 186, 72, 22, '#c94f43');
  rect(ctx, 48, 222, 64, 22, '#c94f43');
  rect(ctx, 52, 258, 56, 22, '#c94f43');
  rect(ctx, 56, 128, 48, 24, '#2c2438');
  circle(ctx, 80, 140, 12, right ? '#3a3348' : '#ffe27a'); // DIFF 2: lamp lit / dark
  if (!right) { // lamp beam when lit
    ctx.fillStyle = 'rgba(255,226,122,0.35)';
    ctx.beginPath();
    ctx.moveTo(92, 132);
    ctx.lineTo(300, 90);
    ctx.lineTo(300, 170);
    ctx.closePath();
    ctx.fill();
  }
  // Sailboat mid-harbour.
  poly(ctx, [[250, 300], [330, 300], [290, 300]], '#7a4a2b');
  rect(ctx, 240, 292, 110, 14, '#8a5a34');
  poly(ctx, [[292, 288], [292, 180], [352, 288]], '#fdf6e3');
  if (!right) poly(ctx, [[292, 200], [292, 250], [340, 250]], '#c94f43'); // DIFF 3: red sail patch
  poly(ctx, [[288, 288], [288, 200], [240, 288]], '#e8d9b0');
  if (right) { // DIFF 4: little flag on the mast (right panel only)
    line(ctx, 292, 180, 292, 158, '#2c2438', 3);
    poly(ctx, [[292, 158], [322, 165], [292, 172]], '#3f6fb5');
  }
  // Gulls.
  bird(ctx, 200, 90);
  bird(ctx, 260, 60);
  if (!right) bird(ctx, 420, 70); // DIFF 5: three gulls vs two
  // Dock crates on the right.
  rect(ctx, 430, 380, 60, 50, '#8a6238');
  rect(ctx, 430, 380, 60, 8, '#6b4a2f');
  if (!right) rect(ctx, 496, 396, 44, 34, '#8a6238'); // DIFF 6: second crate vs none
  else circle(ctx, 518, 412, 17, '#5d7a4a'); // ...replaced by a barrel
  // A fish jumps (right panel: the sea is calm).
  if (!right) { // DIFF 7: jumping fish
    ellipse(ctx, 180, 350, 20, 8, '#c9d6df');
    poly(ctx, [[200, 350], [214, 340], [214, 360]], '#c9d6df');
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(168, 346, 8, 0, Math.PI * 2);
    ctx.fill();
  }
}

// --- Scene 3: Garden of Cats. ---
function drawGarden(ctx, right) {
  rect(ctx, 0, 0, 560, 470, '#bfe3a8'); // sky + lawn
  rect(ctx, 0, 250, 560, 220, '#7fb069');
  circle(ctx, 480, 70, 30, '#fff3b0'); // sun
  if (!right) { // DIFF 1: a cloud in the sky
    ellipse(ctx, 120, 70, 50, 16, '#ffffff');
    ellipse(ctx, 150, 78, 38, 13, '#ffffff');
  }
  // Big tree on the left.
  rect(ctx, 70, 190, 26, 120, '#6b4a2f');
  circle(ctx, 83, 150, 70, '#4e9b47');
  circle(ctx, 40, 180, 44, '#5da854');
  circle(ctx, 130, 180, 44, '#5da854');
  circle(ctx, 60, 120, 12, '#e04b3a'); // apples
  circle(ctx, 110, 105, 12, '#e04b3a');
  if (!right) circle(ctx, 88, 165, 12, '#e04b3a'); // DIFF 2: three apples vs two
  // Flower bed.
  for (let i = 0; i < 5; i += 1) {
    const fx = 220 + i * 46;
    line(ctx, fx, 400, fx, 360, '#3f8f4f', 4);
    circle(ctx, fx, 348, 13, i === 2 ? (right ? '#3f6fb5' : '#e04b3a') : '#f2a541'); // DIFF 3: middle flower red vs blue
  }
  // Two cats: one napping, one sitting.
  ellipse(ctx, 300, 420, 34, 16, '#e8a34c');
  circle(ctx, 330, 408, 13, '#e8a34c');
  poly(ctx, [[322, 400], [325, 388], [331, 399]], '#e8a34c');
  poly(ctx, [[334, 399], [339, 388], [341, 400]], '#e8a34c');
  if (!right) cat(ctx, 430, 420, '#5b5b6e', true); // DIFF 4: grey cat, tail up
  else cat(ctx, 430, 420, '#5b5b6e', false); // ...tail down on the right
  // Butterfly over the flowers.
  if (!right) { // DIFF 5: orange butterfly vs none
    ellipse(ctx, 250, 300, 12, 8, '#f28c28');
    ellipse(ctx, 268, 300, 12, 8, '#f28c28');
    circle(ctx, 259, 300, 4, '#2c2438');
  } else {
    ellipse(ctx, 250, 300, 12, 8, '#7fb3e0');
    ellipse(ctx, 268, 300, 12, 8, '#7fb3e0');
    circle(ctx, 259, 300, 4, '#2c2438');
  }
  // Watering can by the fence (right panel: put away).
  if (!right) { // DIFF 6: watering can present / absent
    rect(ctx, 500, 380, 40, 24, '#3f6fb5');
    poly(ctx, [[500, 384], [472, 372], [472, 380], [500, 392]], '#3f6fb5');
    rect(ctx, 528, 372, 8, 12, '#3f6fb5');
  }
  // Picket fence along the back.
  for (let i = 0; i < 12; i += 1) {
    if (right && i === 6) continue; // DIFF 7: a missing picket
    rect(ctx, 20 + i * 46, 250, 12, 40, '#f2ead8');
    poly(ctx, [[20 + i * 46, 250], [26 + i * 46, 238], [32 + i * 46, 250]], '#f2ead8');
  }
  rect(ctx, 0, 262, 560, 6, '#d9c9a8');
}

export const LEVELS = [
  {
    name: 'Lantern Market',
    hint: 'A night stall under paper lanterns. Seven things changed between the two pictures.',
    draw: drawMarket,
    differences: [
      { x: 468, y: 60, r: 34, label: 'The moon' },
      { x: 110, y: 250, r: 30, label: 'A lantern’s colour' },
      { x: 470, y: 292, r: 34, label: 'The cat on the counter' },
      { x: 132, y: 320, r: 26, label: 'An orange in the basket' },
      { x: 272, y: 320, r: 26, label: 'Flowers in the pot' },
      { x: 360, y: 272, r: 26, label: 'A stripe on the banner' },
      { x: 90, y: 92, r: 22, label: 'A bird on the wire' },
    ],
  },
  {
    name: 'Harbour at Dawn',
    hint: 'Boats, a lighthouse and gulls at sunrise. Seven things changed.',
    draw: drawHarbour,
    differences: [
      { x: 180, y: 70, r: 40, label: 'A cloud by the sun' },
      { x: 80, y: 140, r: 22, label: 'The lighthouse lamp' },
      { x: 316, y: 224, r: 30, label: 'A patch on the sail' },
      { x: 304, y: 165, r: 24, label: 'A flag on the mast' },
      { x: 420, y: 70, r: 22, label: 'A gull in the sky' },
      { x: 505, y: 405, r: 30, label: 'A crate on the dock' },
      { x: 182, y: 350, r: 28, label: 'A fish jumping' },
    ],
  },
  {
    name: 'Garden of Cats',
    hint: 'Two cats, a tree and a flower bed. Seven things changed.',
    draw: drawGarden,
    differences: [
      { x: 132, y: 72, r: 40, label: 'A cloud in the sky' },
      { x: 88, y: 165, r: 24, label: 'An apple on the tree' },
      { x: 312, y: 348, r: 24, label: 'A flower’s colour' },
      { x: 430, y: 410, r: 36, label: 'The grey cat’s tail' },
      { x: 259, y: 300, r: 26, label: 'The butterfly’s colour' },
      { x: 506, y: 384, r: 28, label: 'The watering can' },
      { x: 302, y: 258, r: 26, label: 'A missing fence picket' },
    ],
  },
];
