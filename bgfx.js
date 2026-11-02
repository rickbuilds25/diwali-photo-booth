// Background motion graphics for the booth: fine gold line art in the maroon area only.
// Two slow-turning rangoli mandalas, drifting embers, and the odd line-drawn firework.
// Kept cheap: drawn at ~30 fps at modest resolution, with the mandalas pre-rendered once.
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cv = document.getElementById('bgfx'); if (!cv) return;
  const x = cv.getContext('2d');
  let W = 0, H = 0, K = 1;

  function size() {
    K = Math.min(window.devicePixelRatio || 1, 1.5);
    W = innerWidth; H = innerHeight;
    cv.width = Math.round(W * K); cv.height = Math.round(H * K);
    x.setTransform(K, 0, 0, K, 0, 0);
  }
  addEventListener('resize', size); size();

  // ---- a rangoli mandala in gold lines, drawn once ----
  function mandala(R, seed) {
    const c = document.createElement('canvas'); c.width = c.height = Math.ceil(R * 2 + 8);
    const m = c.getContext('2d'); m.translate(c.width / 2, c.height / 2);
    m.strokeStyle = '#f6c453'; m.fillStyle = '#f6c453'; m.lineCap = 'round'; m.lineJoin = 'round';
    const ring = (r, w) => { m.lineWidth = w; m.beginPath(); m.arc(0, 0, r, 0, TAU); m.stroke(); };
    // outer scallops
    m.lineWidth = 1.4; m.beginPath();
    for (let i = 0; i <= 360; i++) { const t = i / 360 * TAU, r = R * (0.93 + 0.05 * Math.abs(Math.cos(12 * t))); const px = Math.cos(t) * r, py = Math.sin(t) * r; i ? m.lineTo(px, py) : m.moveTo(px, py); }
    m.stroke();
    ring(R * 0.86, 1);
    for (let i = 0; i < 48; i++) { const t = i / 48 * TAU; m.beginPath(); m.arc(Math.cos(t) * R * 0.81, Math.sin(t) * R * 0.81, R * 0.012, 0, TAU); m.fill(); }
    // large petals
    m.lineWidth = 1.3;
    for (let i = 0; i < 16; i++) { m.save(); m.rotate(i / 16 * TAU); m.beginPath(); m.ellipse(R * 0.6, 0, R * 0.17, R * 0.07, 0, 0, TAU); m.stroke(); m.beginPath(); m.ellipse(R * 0.62, 0, R * 0.08, R * 0.03, 0, 0, TAU); m.stroke(); m.restore(); }
    ring(R * 0.42, 1.1);
    // inner lotus
    for (let i = 0; i < 8; i++) {
      m.save(); m.rotate(i / 8 * TAU + Math.PI / 8); m.beginPath();
      m.moveTo(R * 0.12, 0); m.quadraticCurveTo(R * 0.27, -R * 0.11, R * 0.38, 0); m.quadraticCurveTo(R * 0.27, R * 0.11, R * 0.12, 0); m.stroke(); m.restore();
    }
    ring(R * 0.11, 1.2); ring(R * 0.05, 1);
    for (let i = 0; i < 16; i++) { const t = i / 16 * TAU; m.beginPath(); m.arc(Math.cos(t) * R * 0.47, Math.sin(t) * R * 0.47, R * 0.01, 0, TAU); m.fill(); }
    return c;
  }
  let M1 = null, M2 = null, mR = 0;
  function sprites() {
    const R = Math.round(Math.min(W, H) * 0.42);
    if (Math.abs(R - mR) < 20 && M1) return;
    mR = R; M1 = mandala(R, 1); M2 = mandala(Math.round(R * 0.8), 2);
  }

  // ---- embers ----
  const embers = Array.from({ length: 34 }, () => ({ x: Math.random(), y: Math.random(), v: 0.012 + Math.random() * 0.02, r: 0.8 + Math.random() * 1.8, a: 0.15 + Math.random() * 0.35, ph: Math.random() * TAU }));

  // ---- line fireworks ----
  const bursts = []; let nextBurst = 2;
  function addBurst() {
    // only where the maroon shows: pick a spot outside the photo preview
    const p = document.getElementById('preview'), r = p ? p.getBoundingClientRect() : { left: W, right: W, top: H, bottom: H };
    for (let k = 0; k < 12; k++) {
      const bx = Math.random() * W, by = Math.random() * H * 0.85;
      if (bx > r.left - 40 && bx < r.right + 40 && by > r.top - 40 && by < r.bottom + 40) continue;
      bursts.push({ x: bx, y: by, t: 0, n: 18 + ((Math.random() * 10) | 0), R: 40 + Math.random() * 50, hue: Math.random() < 0.7 ? '#f6c453' : '#ffb07a' });
      return;
    }
  }

  let last = performance.now(), acc = 0, T = 0;
  function draw(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now; acc += dt;
    requestAnimationFrame(draw);
    if (acc < 1 / 30) return;                   // ~30 fps is plenty for slow line art
    const step = acc; acc = 0; T += step;
    if (document.hidden) return;
    sprites();
    x.clearRect(0, 0, W, H);

    // mandalas: top-left and bottom-right, partly off screen, turning very slowly
    x.globalAlpha = 0.11;
    x.save(); x.translate(W * 0.06, H * 0.12); x.rotate(T * 0.03); x.drawImage(M1, -M1.width / 2, -M1.height / 2); x.restore();
    x.save(); x.translate(W * 0.95, H * 0.9); x.rotate(-T * 0.024); x.drawImage(M2, -M2.width / 2, -M2.height / 2); x.restore();
    x.globalAlpha = 1;

    // embers drifting up
    x.fillStyle = '#ffd27a';
    for (const e of embers) {
      if (!reduce) { e.y -= e.v * step; if (e.y < -0.02) { e.y = 1.02; e.x = Math.random(); } }
      const px = (e.x + Math.sin(T * 0.6 + e.ph) * 0.01) * W, py = e.y * H;
      x.globalAlpha = e.a * (0.6 + 0.4 * Math.sin(T * 2 + e.ph));
      x.beginPath(); x.arc(px, py, e.r, 0, TAU); x.fill();
    }
    x.globalAlpha = 1;

    // line fireworks
    if (!reduce) { nextBurst -= step; if (nextBurst <= 0) { addBurst(); nextBurst = 3 + Math.random() * 3; } }
    x.lineCap = 'round';
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i]; b.t += step;
      const k = b.t / 1.8; if (k >= 1) { bursts.splice(i, 1); continue; }
      const grow = 1 - Math.pow(1 - Math.min(1, k * 1.4), 3), fadeA = 0.45 * (1 - k);
      x.strokeStyle = b.hue; x.fillStyle = b.hue; x.lineWidth = 1.2; x.globalAlpha = fadeA;
      for (let j = 0; j < b.n; j++) {
        const a = j / b.n * TAU, r1 = b.R * grow, r0 = r1 * 0.55;
        x.beginPath(); x.moveTo(b.x + Math.cos(a) * r0, b.y + Math.sin(a) * r0 + k * 8); x.lineTo(b.x + Math.cos(a) * r1, b.y + Math.sin(a) * r1 + k * 10); x.stroke();
        x.beginPath(); x.arc(b.x + Math.cos(a) * r1, b.y + Math.sin(a) * r1 + k * 10, 1.5, 0, TAU); x.fill();
      }
    }
    x.globalAlpha = 1;
  }
  requestAnimationFrame(draw);
})();
