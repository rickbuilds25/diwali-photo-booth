/*
  Diwali photo frame — shared by the smile booth and the party gallery.
  DiwaliFrame.ready()                         -> loads fonts, builds the overlay (await once)
  DiwaliFrame.compose(src, sw, sh, mirror)    -> 1080x1350 canvas with the photo framed
  DiwaliFrame.overlay                         -> the frame with a transparent photo window (for live preview)
  DiwaliFrame.PHOTO                           -> {x, y, w, h} of the photo area (full canvas)
*/
(function () {
  'use strict';
  const W = 1080, H = 1350;
  const PHOTO = { x: 0, y: 0, w: W, h: H, r: 0 };
  const STAMP_1 = "Arindam, Pawnita & Rian's";
  const STAMP_2 = 'DIWALI PARTY 2026';
  const TOPLINE = 'शुभ दीपावली';
  const SERIF = "'Cormorant Garamond', Georgia, 'Times New Roman', serif";
  const DISPLAY = "'Yatra One', 'Cormorant Garamond', Georgia, serif";
  const TAU = Math.PI * 2;

  function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function rng(seed) { let s = seed | 0; return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function rrect(x, X, Y, w, h, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); }
  function gold(x, y0, y1) { const g = x.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, '#fff1c2'); g.addColorStop(0.45, '#f6c453'); g.addColorStop(1, '#c9821e'); return g; }

  // ---- marigolds (genda phool): pre-rendered ruffled pom-poms, shaded like a ball ----
  const MG_SIZE = 128, MG = [];
  const MG_PALETTES = [
    { base: '#a8380a', mid: '#e8620c', tip: '#ff9a2e', edge: '#7a2604' },   // deep orange
    { base: '#b8420a', mid: '#f2760f', tip: '#ffae3d', edge: '#83300a' },   // orange
    { base: '#c46a08', mid: '#f7a21b', tip: '#ffd25a', edge: '#8f4c06' },   // yellow-orange
    { base: '#c98a0a', mid: '#fbc02a', tip: '#ffe27a', edge: '#946108' },   // yellow
  ];
  function makeMarigold(pal, seed) {
    const c = mk(MG_SIZE, MG_SIZE), x = c.getContext('2d'), R = MG_SIZE * 0.4, rr = rng(seed);
    x.translate(MG_SIZE / 2, MG_SIZE / 2);
    // soft contact shadow
    const sh = x.createRadialGradient(R * 0.08, R * 0.16, R * 0.5, R * 0.08, R * 0.16, R * 1.12);
    sh.addColorStop(0, 'rgba(0,0,0,0.45)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = sh; x.beginPath(); x.arc(R * 0.08, R * 0.16, R * 1.12, 0, TAU); x.fill();
    x.fillStyle = pal.edge; x.beginPath(); x.arc(0, 0, R * 0.98, 0, TAU); x.fill();
    // petals: many crinkled fans, outer ones first so the centre ones sit on top
    const petals = [];
    for (let i = 0; i < 190; i++) { const d = Math.pow(rr(), 0.75) * R * 0.86; petals.push({ d, a: rr() * TAU, len: R * (0.3 + rr() * 0.16) * (1 - d / R * 0.35), w: 0.5 + rr() * 0.35, tw: (rr() - 0.5) * 0.6 }); }
    petals.sort((p, q) => q.d - p.d);
    for (const p of petals) {
      x.save(); x.translate(Math.cos(p.a) * p.d, Math.sin(p.a) * p.d); x.rotate(p.a + p.tw);
      const L = p.len, Wd = L * p.w, teeth = 5;
      x.beginPath(); x.moveTo(-L * 0.25, -Wd * 0.25);
      for (let k = 0; k <= teeth; k++) { const t = k / teeth, ang = -0.9 + t * 1.8, rad = L * (0.92 + (k % 2 ? 0.1 : -0.04)); x.lineTo(Math.cos(ang) * rad * 0.9, Math.sin(ang) * Wd * 1.1 * (0.6 + 0.4 * Math.cos(ang))); }
      x.lineTo(-L * 0.25, Wd * 0.25); x.closePath();
      const g = x.createLinearGradient(-L * 0.25, 0, L, 0);
      const inner = p.d / R;
      g.addColorStop(0, pal.base); g.addColorStop(0.45, pal.mid); g.addColorStop(1, inner < 0.35 ? pal.mid : pal.tip);
      x.fillStyle = g; x.fill();
      x.strokeStyle = 'rgba(90,25,0,0.35)'; x.lineWidth = 0.7; x.stroke();
      x.restore();
    }
    // ball shading: light from the top left, shade at the bottom right
    x.globalCompositeOperation = 'source-atop';
    const hl = x.createRadialGradient(-R * 0.38, -R * 0.42, 0, -R * 0.2, -R * 0.25, R * 1.1);
    hl.addColorStop(0, 'rgba(255,245,210,0.38)'); hl.addColorStop(0.45, 'rgba(255,230,170,0.06)'); hl.addColorStop(1, 'rgba(70,15,0,0.5)');
    x.fillStyle = hl; x.fillRect(-MG_SIZE / 2, -MG_SIZE / 2, MG_SIZE, MG_SIZE);
    return c;
  }
  function marigoldSprites() {
    if (MG.length) return;
    let seed = 101;
    for (const pal of MG_PALETTES) for (let v = 0; v < 3; v++) MG.push(makeMarigold(pal, seed++));
  }
  const mgPick = rng(77);
  function marigold(x, cx, cy, R, rot) {
    marigoldSprites();
    // mostly orange, some yellow, the way real torans are strung
    const u = mgPick(), pal = u < 0.3 ? 0 : u < 0.68 ? 1 : u < 0.86 ? 2 : 3;
    const spr = MG[pal * 3 + ((mgPick() * 3) | 0)], s = R / (MG_SIZE * 0.4) * 1.08;
    x.save(); x.translate(cx, cy); x.rotate(rot); x.drawImage(spr, -MG_SIZE / 2 * s, -MG_SIZE / 2 * s, MG_SIZE * s, MG_SIZE * s); x.restore();
  }
  // mango leaf: long and pointed, darker along one side, with a pale midrib and faint veins
  function leaf(x, cx, cy, len, ang) {
    x.save(); x.translate(cx, cy); x.rotate(ang);
    const w = len * 0.2, bend = len * 0.06;
    const path = () => { x.beginPath(); x.moveTo(0, 0); x.bezierCurveTo(w * 1.3, len * 0.22, w * 1.1 + bend, len * 0.7, bend, len); x.bezierCurveTo(-w * 0.9 + bend, len * 0.7, -w * 1.25, len * 0.22, 0, 0); };
    x.shadowColor = 'rgba(0,0,0,0.35)'; x.shadowBlur = 5; x.shadowOffsetY = 2;
    const g = x.createLinearGradient(-w, 0, w, 0); g.addColorStop(0, '#1f5e22'); g.addColorStop(0.5, '#2f7d2c'); g.addColorStop(1, '#4f9a3e');
    path(); x.fillStyle = g; x.fill(); x.shadowColor = 'transparent';
    const sheen = x.createLinearGradient(0, 0, 0, len); sheen.addColorStop(0, 'rgba(220,255,190,0.18)'); sheen.addColorStop(1, 'rgba(220,255,190,0)');
    path(); x.fillStyle = sheen; x.fill();
    x.strokeStyle = 'rgba(214,240,180,0.75)'; x.lineWidth = 1.3;
    x.beginPath(); x.moveTo(0, 2); x.quadraticCurveTo(bend * 0.4 + w * 0.1, len * 0.5, bend, len - 3); x.stroke();
    x.strokeStyle = 'rgba(200,235,170,0.3)'; x.lineWidth = 0.8;
    for (let k = 1; k <= 5; k++) { const t = k / 6, mx = bend * t * t, my = len * t; for (const sd of [-1, 1]) { x.beginPath(); x.moveTo(mx, my); x.lineTo(mx + sd * w * 0.85 * Math.sin(Math.PI * t), my + len * 0.08); x.stroke(); } }
    x.restore();
  }
  function diya(x, cx, cy, s) {
    x.save(); x.translate(cx, cy); x.scale(s, s);
    const glow = x.createRadialGradient(0, -34, 2, 0, -30, 70); glow.addColorStop(0, 'rgba(255,214,120,0.85)'); glow.addColorStop(0.35, 'rgba(255,150,40,0.35)'); glow.addColorStop(1, 'rgba(255,120,20,0)');
    x.fillStyle = glow; x.beginPath(); x.arc(0, -30, 70, 0, TAU); x.fill();
    const body = x.createLinearGradient(0, -8, 0, 26); body.addColorStop(0, '#b4521c'); body.addColorStop(1, '#5a1f08');
    x.fillStyle = body; x.strokeStyle = '#ffcf6a'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(-44, -6); x.quadraticCurveTo(-30, 26, 0, 26); x.quadraticCurveTo(30, 26, 44, -6); x.quadraticCurveTo(52, -10, 56, -16); x.quadraticCurveTo(40, -2, 0, -3); x.quadraticCurveTo(-30, -3, -44, -6); x.closePath(); x.fill(); x.stroke();
    x.beginPath(); x.ellipse(0, -5, 44, 6, 0, 0, TAU); x.fillStyle = '#3c1405'; x.fill(); x.stroke();
    x.fillStyle = '#ffcf6a'; for (let i = -2; i <= 2; i++) { x.beginPath(); x.arc(i * 12, 12, 2.2, 0, TAU); x.fill(); }
    const fl = (w, h, col) => { x.fillStyle = col; x.beginPath(); x.moveTo(0, -6); x.bezierCurveTo(-w * 1.6, -6 - h * 0.3, -w * 0.3, -6 - h * 0.75, 1, -6 - h); x.bezierCurveTo(w * 0.4, -6 - h * 0.75, w * 1.6, -6 - h * 0.3, 0, -6); x.fill(); };
    fl(9, 46, '#ffb43b'); fl(5, 28, '#fff2d0');
    x.restore();
  }
  function sparkle(x, cx, cy, r, a) {
    x.save(); x.globalAlpha = a; x.fillStyle = '#ffe6a3';
    x.beginPath(); x.moveTo(cx, cy - r); x.quadraticCurveTo(cx, cy, cx + r, cy); x.quadraticCurveTo(cx, cy, cx, cy + r); x.quadraticCurveTo(cx, cy, cx - r, cy); x.quadraticCurveTo(cx, cy, cx, cy - r); x.fill();
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r * 1.6); g.addColorStop(0, 'rgba(255,220,140,0.6)'); g.addColorStop(1, 'rgba(255,200,100,0)');
    x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r * 1.6, 0, TAU); x.fill();
    x.restore();
  }
  function rangoliCorner(x, cx, cy, s, flip) {
    x.save(); x.translate(cx, cy); x.scale(flip ? -s : s, s);
    x.strokeStyle = 'rgba(246,196,83,0.55)'; x.lineWidth = 2;
    for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + k * Math.PI / 8; x.beginPath(); x.ellipse(Math.cos(a) * 34, Math.sin(a) * 34, 22, 9, a, 0, TAU); x.stroke(); }
    x.beginPath(); x.arc(0, 0, 14, -Math.PI / 2, 0); x.stroke();
    x.fillStyle = 'rgba(246,196,83,0.55)';
    for (let k = 0; k < 7; k++) { const a = -Math.PI / 2 + k * Math.PI / 12; x.beginPath(); x.arc(Math.cos(a) * 70, Math.sin(a) * 70, 3, 0, TAU); x.fill(); }
    x.restore();
  }

  // Minimal overlay: the photo runs edge to edge; the frame adds only a slim marigold toran,
  // a fine gold inset line and a small stamp over a soft shadow at the bottom.
  function buildOverlay() {
    const c = mk(W, H), x = c.getContext('2d');
    const r = rng(11);
    // soft shade at the top so the garland reads, and at the bottom for the stamp
    const top = x.createLinearGradient(0, 0, 0, 230); top.addColorStop(0, 'rgba(20,4,6,0.38)'); top.addColorStop(1, 'rgba(20,4,6,0)');
    x.fillStyle = top; x.fillRect(0, 0, W, 230);
    const bot = x.createLinearGradient(0, H - 330, 0, H); bot.addColorStop(0, 'rgba(20,4,6,0)'); bot.addColorStop(0.55, 'rgba(20,4,6,0.42)'); bot.addColorStop(1, 'rgba(20,4,6,0.78)');
    x.fillStyle = bot; x.fillRect(0, H - 330, W, 330);

    // fine gold inset line with small diamonds at the corners
    const I = 30;
    x.strokeStyle = 'rgba(246,196,83,0.7)'; x.lineWidth = 1.6; x.strokeRect(I, I, W - 2 * I, H - 2 * I);
    x.fillStyle = '#f6c453';
    for (const [cx, cy] of [[I, I], [W - I, I], [I, H - I], [W - I, H - I]]) { x.beginPath(); x.moveTo(cx, cy - 7); x.lineTo(cx + 7, cy); x.lineTo(cx, cy + 7); x.lineTo(cx - 7, cy); x.closePath(); x.fill(); }

    // toran: the original four-swag marigold garland, with strands down both sides and mango leaves at each knot
    const anchors = [26, 290, 540, 790, 1054], AY = 40, SAG = 58;
    x.strokeStyle = 'rgba(240,225,190,0.55)'; x.lineWidth = 1.5; x.beginPath();
    for (let s2 = 0; s2 < 4; s2++) for (let i = 0; i <= 40; i++) { const u = i / 40, gx = anchors[s2] + (anchors[s2 + 1] - anchors[s2]) * u, gy = AY + SAG * 4 * u * (1 - u); if (!s2 && !i) x.moveTo(gx, gy); else x.lineTo(gx, gy); }
    for (const sx of [26, 1054]) { x.moveTo(sx, AY); x.lineTo(sx, AY + 9 * 33 + 20); }
    x.stroke();
    for (let s2 = 0; s2 < 4; s2++) {
      const n = 11;
      for (let i = 0; i <= n; i++) {
        const u = i / n, gx = anchors[s2] + (anchors[s2 + 1] - anchors[s2]) * u, gy = AY + SAG * 4 * u * (1 - u);
        marigold(x, gx, gy, 17, r() * TAU);
      }
    }
    for (const sx of [26, 1054]) for (let j = 1; j <= 9; j++) marigold(x, sx, AY + j * 33, j === 9 ? 19 : 15, r() * TAU);
    for (const sx of [26, 1054]) { x.fillStyle = '#ffcf6a'; x.beginPath(); x.moveTo(sx, AY + 9 * 33 + 18); x.lineTo(sx - 7, AY + 9 * 33 + 44); x.lineTo(sx + 7, AY + 9 * 33 + 44); x.closePath(); x.fill(); }
    for (const ax of anchors) { for (const a of [-0.55, 0, 0.55]) leaf(x, ax, AY - 4, 46, a); marigold(x, ax, AY, 21, r() * TAU); }

    // stamp: a small diya, the names in italic, the occasion in small caps
    x.textAlign = 'center'; x.textBaseline = 'middle';
    diya(x, W / 2, H - 176, 0.52);
    let fs = 46; x.font = `italic 600 ${fs}px ${SERIF}`;
    while (x.measureText(STAMP_1).width > 760 && fs > 30) { fs -= 2; x.font = `italic 600 ${fs}px ${SERIF}`; }
    x.shadowColor = 'rgba(0,0,0,0.55)'; x.shadowBlur = 10; x.shadowOffsetY = 2;
    x.fillStyle = '#ffe6ad'; x.fillText(STAMP_1, W / 2, H - 116);
    x.font = `21px ${DISPLAY}`; if ('letterSpacing' in x) x.letterSpacing = '6px';
    x.fillStyle = '#f6c453'; x.fillText(`${STAMP_2}`, W / 2, H - 70);
    if ('letterSpacing' in x) x.letterSpacing = '0px';
    x.shadowColor = 'transparent';
    // hairlines either side of the occasion line
    x.strokeStyle = 'rgba(246,196,83,0.6)'; x.lineWidth = 1.2;
    x.beginPath(); x.moveTo(W / 2 - 300, H - 70); x.lineTo(W / 2 - 185, H - 70); x.moveTo(W / 2 + 185, H - 70); x.lineTo(W / 2 + 300, H - 70); x.stroke();
    return c;
  }

  let overlay = null, readyP = null;
  async function loadFonts() {
    if (!document.fonts || !document.fonts.load) return;
    const want = [`italic 600 64px 'Cormorant Garamond'`, `38px 'Yatra One'`, `44px 'Yatra One'`];
    const t = new Promise(res => setTimeout(res, 4000));
    try { await Promise.race([Promise.all(want.map(f => document.fonts.load(f, f.includes('Yatra') ? 'शुभ दीपावली DIWALI' : 'Arindam'))), t]); } catch (e) { /* fall back to system serif */ }
  }
  function ready() {
    if (!readyP) readyP = loadFonts().then(() => { overlay = buildOverlay(); api.overlay = overlay; return api; });
    return readyP;
  }
  // Draw the photo cover-cropped into the window. Faces sit in the upper half, so bias the crop upward a little.
  function drawPhoto(x, src, sw, sh, mirror) {
    const k = Math.max(PHOTO.w / sw, PHOTO.h / sh), dw = sw * k, dh = sh * k;
    const dx = PHOTO.x + (PHOTO.w - dw) / 2, dy = PHOTO.y + Math.min(0, Math.max(PHOTO.h - dh, (PHOTO.h - dh) * 0.4));
    x.save(); rrect(x, PHOTO.x, PHOTO.y, PHOTO.w, PHOTO.h, PHOTO.r); x.clip();
    if (mirror) { x.translate(PHOTO.x * 2 + PHOTO.w, 0); x.scale(-1, 1); }
    x.drawImage(src, dx, dy, dw, dh);
    x.restore();
  }
  function compose(src, sw, sh, mirror, into) {
    const c = into || mk(W, H);
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const x = c.getContext('2d');
    x.fillStyle = '#1c0308'; x.fillRect(0, 0, W, H);
    drawPhoto(x, src, sw, sh, mirror);
    x.drawImage(overlay, 0, 0);
    return c;
  }
  const api = { W, H, PHOTO, ready, compose, drawPhoto, overlay: null };
  window.DiwaliFrame = api;
})();
