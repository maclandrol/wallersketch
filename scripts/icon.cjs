// Draws the application icon in a real Chromium canvas (through Electron) and writes
// resources/icon.png (macOS grid, with margin) and resources/icon-square.png (Windows/Linux).
// Usage: npm run icon
const fs = require('node:fs');

function draw(margin) {
  const c = document.createElement('canvas'); c.width = c.height = 1024; const g = c.getContext('2d');
  const s = 1024 - 2 * margin, k = s / 824, X = x => margin + x * k, Y = y => margin + y * k;
  // Body: warm near-black with a soft top light.
  const bg = g.createRadialGradient(X(412), Y(160), 40 * k, X(412), Y(412), 620 * k);
  bg.addColorStop(0, '#3a3127'); bg.addColorStop(1, '#14110d');
  g.fillStyle = bg; g.beginPath(); g.roundRect(margin, margin, s, s, 186 * k); g.fill();
  // Draped cloth over two stepped risers: the composition the app is made for.
  const cloth = g.createLinearGradient(0, Y(330), 0, Y(720));
  cloth.addColorStop(0, '#f1dcab'); cloth.addColorStop(0.55, '#d2ae6e'); cloth.addColorStop(1, '#9c7741');
  g.fillStyle = cloth;
  g.beginPath();
  g.moveTo(X(118), Y(712));
  g.bezierCurveTo(X(124), Y(600), X(136), Y(520), X(160), Y(490));
  g.lineTo(X(392), Y(490));
  g.bezierCurveTo(X(404), Y(490), X(410), Y(470), X(414), Y(390));
  g.bezierCurveTo(X(416), Y(372), X(424), Y(364), X(440), Y(364));
  g.lineTo(X(668), Y(364));
  g.bezierCurveTo(X(690), Y(364), X(698), Y(380), X(704), Y(420));
  g.bezierCurveTo(X(716), Y(520), X(712), Y(640), X(708), Y(712));
  // Hem with soft folds.
  g.bezierCurveTo(X(660), Y(732), X(640), Y(700), X(590), Y(718));
  g.bezierCurveTo(X(540), Y(736), X(500), Y(702), X(446), Y(720));
  g.bezierCurveTo(X(392), Y(738), X(346), Y(702), X(290), Y(722));
  g.bezierCurveTo(X(230), Y(742), X(170), Y(700), X(118), Y(712));
  g.fill();
  // Folds: soft dark valleys with a light ridge beside each, falling from the step edges.
  g.save(); g.clip();
  const fold = (x, y0, y1, w) => {
    for (const [dx, col] of [[0, 'rgba(84,56,22,.32)'], [w * 0.9, 'rgba(255,246,222,.22)']]) {
      const gr = g.createLinearGradient(0, Y(y0), 0, Y(y1)); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.35, col); gr.addColorStop(1, col);
      g.strokeStyle = gr; g.lineWidth = w * k; g.beginPath(); g.moveTo(X(x + dx), Y(y0)); g.bezierCurveTo(X(x + dx - 6), Y(y0 + 80), X(x + dx + 10), Y(y1 - 90), X(x + dx - 4), Y(y1 + 20)); g.stroke();
    }
  };
  fold(196, 520, 720, 22); fold(330, 520, 724, 18); fold(470, 410, 720, 24); fold(600, 400, 724, 20); fold(676, 430, 720, 14);
  // Light from the upper left across the fabric.
  const side = g.createLinearGradient(X(118), 0, X(712), 0); side.addColorStop(0, 'rgba(255,250,235,.10)'); side.addColorStop(1, 'rgba(40,24,8,.22)');
  g.fillStyle = side; g.fillRect(X(100), Y(340), 640 * k, 420 * k);
  g.restore();
  // Sheen along the top edges.
  g.strokeStyle = 'rgba(255,248,228,.55)'; g.lineWidth = 8 * k;
  g.beginPath(); g.moveTo(X(168), Y(494)); g.lineTo(X(386), Y(494)); g.moveTo(X(446), Y(368)); g.lineTo(X(664), Y(368)); g.stroke();

  const cream = '#fbf3e1';
  // Coupe on the high step, sunrise drink.
  const cx = 552, top = 196, bw = 112;
  const liq = g.createLinearGradient(0, Y(top + 28), 0, Y(top + 96));
  liq.addColorStop(0, '#ffc23d'); liq.addColorStop(1, '#e2402b');
  g.fillStyle = liq;
  g.beginPath(); g.moveTo(X(cx - bw + 16), Y(top + 24)); g.lineTo(X(cx + bw - 16), Y(top + 24));
  g.bezierCurveTo(X(cx + bw - 26), Y(top + 82), X(cx + 44), Y(top + 104), X(cx), Y(top + 104));
  g.bezierCurveTo(X(cx - 44), Y(top + 104), X(cx - bw + 26), Y(top + 82), X(cx - bw + 16), Y(top + 24)); g.fill();
  g.strokeStyle = cream; g.lineWidth = 20 * k; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(X(cx - bw), Y(top)); g.lineTo(X(cx + bw), Y(top));
  g.bezierCurveTo(X(cx + bw - 8), Y(top + 90), X(cx + 56), Y(top + 120), X(cx), Y(top + 120));
  g.bezierCurveTo(X(cx - 56), Y(top + 120), X(cx - bw + 8), Y(top + 90), X(cx - bw), Y(top));
  g.moveTo(X(cx), Y(top + 120)); g.lineTo(X(cx), Y(352)); g.moveTo(X(cx - 54), Y(354)); g.lineTo(X(cx + 54), Y(354)); g.stroke();
  // Citrus wheel on the rim.
  g.fillStyle = '#ffd25a'; g.beginPath(); g.arc(X(cx + bw - 6), Y(top - 8), 34 * k, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#14110d'; g.lineWidth = 5 * k;
  for (let a = 0; a < 6; a++) { const t = a * Math.PI / 3; g.beginPath(); g.moveTo(X(cx + bw - 6), Y(top - 8)); g.lineTo(X(cx + bw - 6 + Math.cos(t) * 26), Y(top - 8 + Math.sin(t) * 26)); g.stroke(); }
  // Highball on the low step, blue lagoon.
  const hx = 270, hTop = 312, hw = 46;
  const blue = g.createLinearGradient(0, Y(hTop + 30), 0, Y(478));
  blue.addColorStop(0, '#5cc8ff'); blue.addColorStop(1, '#0f63d8');
  g.fillStyle = blue; g.beginPath(); g.roundRect(X(hx - hw + 10), Y(hTop + 34), (hw - 10) * 2 * k, (478 - hTop - 44) * k, 8 * k); g.fill();
  g.strokeStyle = cream; g.lineWidth = 18 * k;
  g.beginPath(); g.moveTo(X(hx - hw), Y(hTop)); g.lineTo(X(hx - hw + 4), Y(472)); g.quadraticCurveTo(X(hx - hw + 6), Y(484), X(hx - hw + 18), Y(484)); g.lineTo(X(hx + hw - 18), Y(484)); g.quadraticCurveTo(X(hx + hw - 6), Y(484), X(hx + hw - 4), Y(472)); g.lineTo(X(hx + hw), Y(hTop)); g.stroke();
  // Straw.
  g.strokeStyle = '#14110d'; g.lineWidth = 12 * k; g.beginPath(); g.moveTo(X(hx + 6), Y(450)); g.lineTo(X(hx + 34), Y(hTop - 56)); g.stroke();
  g.strokeStyle = cream; g.lineWidth = 4 * k; g.beginPath(); g.moveTo(X(hx + 6), Y(450)); g.lineTo(X(hx + 34), Y(hTop - 56)); g.stroke();
  return c.toDataURL('image/png');
}

module.exports = async ({ page }) => {
  const mac = await page.evaluate(draw, 100);
  const square = await page.evaluate(draw, 24);
  fs.writeFileSync('resources/icon.png', Buffer.from(mac.split(',')[1], 'base64'));
  fs.writeFileSync('resources/icon-square.png', Buffer.from(square.split(',')[1], 'base64'));
};
