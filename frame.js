/*
  Diwali photo frame — shared by the smile booth and the party gallery.
  DiwaliFrame.ready()                         -> loads fonts, builds the overlay (await once)
  DiwaliFrame.compose(src, sw, sh, mirror)    -> 1080x1350 canvas with the photo framed
  DiwaliFrame.overlay                         -> the frame with a transparent photo window (for live preview)
  DiwaliFrame.PHOTO                           -> {x, y, w, h} of the photo window
*/
(function () {
  'use strict';
  const W = 1080, H = 1350;
  const PHOTO = { x: 60, y: 150, w: 960, h: 980, r: 22 };
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

  function marigold(x, cx, cy, R, rot) {
    x.save(); x.translate(cx, cy); x.rotate(rot);
    x.shadowColor = 'rgba(0,0,0,0.35)'; x.shadowBlur = 6; x.shadowOffsetY = 3;
    x.fillStyle = '#c94f06'; x.beginPath(); x.arc(0, 0, R, 0, TAU); x.fill();
    x.shadowColor = 'transparent';
    const rings = [['#e3650b', 1.0, 15], ['#f5871a', 0.74, 12], ['#ffa62b', 0.5, 9], ['#ffc247', 0.28, 6]];
    for (const [col, k, n] of rings) {
      x.fillStyle = col;
      for (let i = 0; i < n; i++) { const a = i / n * TAU + k * 2; x.beginPath(); x.ellipse(Math.cos(a) * R * k * 0.62, Math.sin(a) * R * k * 0.62, R * k * 0.42, R * k * 0.3, a, 0, TAU); x.fill(); }
    }
    x.restore();
  }
  function leaf(x, cx, cy, len, ang) {
    x.save(); x.translate(cx, cy); x.rotate(ang);
    const g = x.createLinearGradient(-len * 0.25, 0, len * 0.25, 0); g.addColorStop(0, '#2f7d2c'); g.addColorStop(1, '#58b047');
    x.fillStyle = g; x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(len * 0.32, len * 0.45, 0, len); x.quadraticCurveTo(-len * 0.32, len * 0.45, 0, 0); x.fill();
    x.strokeStyle = 'rgba(200,240,170,0.7)'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(0, 2); x.lineTo(0, len - 4); x.stroke();
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

  function buildOverlay() {
    const c = mk(W, H), x = c.getContext('2d');
    // ground: deep maroon velvet with a warm centre
    const bg = x.createRadialGradient(W / 2, H * 0.55, 80, W / 2, H * 0.5, H * 0.78);
    bg.addColorStop(0, '#6b1220'); bg.addColorStop(0.55, '#3d0812'); bg.addColorStop(1, '#1c0308');
    x.fillStyle = bg; x.fillRect(0, 0, W, H);
    // faint dotted lattice
    const r = rng(11); x.fillStyle = 'rgba(255,200,120,0.07)';
    for (let yy = 12; yy < H; yy += 26) for (let xx = (yy / 26 % 2) * 13 + 6; xx < W; xx += 26) { x.beginPath(); x.arc(xx, yy, 1.6, 0, TAU); x.fill(); }
    // photo window
    x.save(); x.globalCompositeOperation = 'destination-out'; x.fillStyle = '#000'; rrect(x, PHOTO.x, PHOTO.y, PHOTO.w, PHOTO.h, PHOTO.r); x.fill(); x.restore();
    // window border: thin dark line, wide gold line, fine inner gold line
    x.lineJoin = 'round';
    rrect(x, PHOTO.x - 5, PHOTO.y - 5, PHOTO.w + 10, PHOTO.h + 10, PHOTO.r + 5); x.strokeStyle = gold(x, PHOTO.y, PHOTO.y + PHOTO.h); x.lineWidth = 7; x.stroke();
    rrect(x, PHOTO.x - 17, PHOTO.y - 17, PHOTO.w + 34, PHOTO.h + 34, PHOTO.r + 15); x.strokeStyle = 'rgba(246,196,83,0.65)'; x.lineWidth = 2; x.stroke();
    // inner vignette at the photo edges so the frame sits on top
    x.save(); rrect(x, PHOTO.x, PHOTO.y, PHOTO.w, PHOTO.h, PHOTO.r); x.clip();
    const v = x.createLinearGradient(0, PHOTO.y, 0, PHOTO.y + 120); v.addColorStop(0, 'rgba(30,4,8,0.55)'); v.addColorStop(1, 'rgba(30,4,8,0)');
    x.fillStyle = v; x.fillRect(PHOTO.x, PHOTO.y, PHOTO.w, 120);
    const v2 = x.createLinearGradient(0, PHOTO.y + PHOTO.h - 110, 0, PHOTO.y + PHOTO.h); v2.addColorStop(0, 'rgba(30,4,8,0)'); v2.addColorStop(1, 'rgba(30,4,8,0.5)');
    x.fillStyle = v2; x.fillRect(PHOTO.x, PHOTO.y + PHOTO.h - 110, PHOTO.w, 110);
    x.restore();

    // top line in Devanagari
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `44px ${DISPLAY}`; x.fillStyle = gold(x, 22, 72);
    x.shadowColor = 'rgba(255,150,40,0.6)'; x.shadowBlur = 14; x.fillText(TOPLINE, W / 2, 44); x.shadowBlur = 0;

    // garland: four swags with mango leaves at each knot, strands down both sides
    const anchors = [26, 290, 540, 790, 1054], AY = 104, SAG = 58;
    for (let s = 0; s < 4; s++) {
      const n = 11;
      for (let i = 0; i <= n; i++) {
        const u = i / n, gx = anchors[s] + (anchors[s + 1] - anchors[s]) * u, gy = AY + SAG * 4 * u * (1 - u);
        marigold(x, gx, gy, 17, r() * TAU);
      }
    }
    for (const sx of [26, 1054]) for (let j = 1; j <= 9; j++) marigold(x, sx, AY + j * 33, j === 9 ? 19 : 15, r() * TAU);
    for (const sx of [26, 1054]) { x.fillStyle = '#ffcf6a'; x.beginPath(); x.moveTo(sx, AY + 9 * 33 + 18); x.lineTo(sx - 7, AY + 9 * 33 + 44); x.lineTo(sx + 7, AY + 9 * 33 + 44); x.closePath(); x.fill(); }
    for (const ax of anchors) { for (const a of [-0.55, 0, 0.55]) leaf(x, ax, AY - 4, 46, a); marigold(x, ax, AY, 21, r() * TAU); }

    // sparkles near the photo corners
    for (let i = 0; i < 26; i++) {
      const side = i % 2, cx = side ? PHOTO.x + PHOTO.w - r() * 160 : PHOTO.x + r() * 160, cy = PHOTO.y + PHOTO.h - 20 - r() * 260;
      sparkle(x, cx, cy, 3 + r() * 9, 0.35 + r() * 0.5);
    }

    // bottom band: rangoli corners, diyas, stamp
    const BY = PHOTO.y + PHOTO.h + 18;
    rangoliCorner(x, 40, H - 30, 1.1, false); rangoliCorner(x, W - 40, H - 30, 1.1, true);
    diya(x, 150, H - 70, 1.25); diya(x, W - 150, H - 70, 1.25);
    const cyA = BY + 62, cyB = BY + 150;
    let fs = 64; x.font = `italic 600 ${fs}px ${SERIF}`;
    while (x.measureText(STAMP_1).width > 600 && fs > 40) { fs -= 2; x.font = `italic 600 ${fs}px ${SERIF}`; }   // fit between the diyas
    x.fillStyle = gold(x, cyA - 34, cyA + 30);
    x.shadowColor = 'rgba(255,150,40,0.55)'; x.shadowBlur = 16; x.fillText(STAMP_1, W / 2, cyA); x.shadowBlur = 0;
    x.font = `38px ${DISPLAY}`; if ('letterSpacing' in x) x.letterSpacing = '7px';
    x.fillStyle = gold(x, cyB - 20, cyB + 20); x.fillText(STAMP_2, W / 2, cyB);
    if ('letterSpacing' in x) x.letterSpacing = '0px';
    // divider: a line of dots with a diamond in the middle
    const dy = (cyA + cyB) / 2 + 6; x.fillStyle = '#f6c453';
    for (let i = -9; i <= 9; i++) { if (!i) continue; const rr = 2.4 - Math.abs(i) * 0.12; x.globalAlpha = 1 - Math.abs(i) * 0.08; x.beginPath(); x.arc(W / 2 + i * 16, dy, rr, 0, TAU); x.fill(); }
    x.globalAlpha = 1; x.beginPath(); x.moveTo(W / 2, dy - 8); x.lineTo(W / 2 + 8, dy); x.lineTo(W / 2, dy + 8); x.lineTo(W / 2 - 8, dy); x.closePath(); x.fill();
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
