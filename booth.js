// Diwali Photo Booth — live camera, smile trigger, countdown, framed photo, local photo roll.
// URL options: ?sens=0.45 (smile threshold 0–1), ?hold=0.7 (seconds a smile must last),
//              ?count=3 (countdown seconds), ?preview=10 (seconds each photo shows before it saves),
//              ?cam=back (start on the rear camera), ?zoom=2, ?wide=0 (keep camera's own zoom), ?hd=1, ?burst=5, ?sharpen=0.35, ?debug
const Q = new URLSearchParams(location.search);
const SENS = clampNum(+Q.get('sens'), 0.15, 0.9, 0.45);
const HOLD = clampNum(+Q.get('hold'), 0.2, 3, 0.7);
const COUNT = Math.round(clampNum(+Q.get('count'), 1, 10, 3));
const REVIEW_S = clampNum(+Q.get('preview'), 2, 60, 10), COOLDOWN_S = 2.5;
const DEBUG = Q.has('debug');
// iPhone and iPad browsers (Safari and Chrome alike) ask before every download, so there the booth
// keeps photos on the device and they are saved to Photos in batches from the Photos screen.
const IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const AUTOSAVE = Q.get('autosave') === 'on' ? true : Q.get('autosave') === 'off' ? false : !IOS;
const BATCH = 20;
function clampNum(v, a, b, d) { return Number.isFinite(v) && v > 0 ? Math.min(b, Math.max(a, v)) : d; }

const $ = id => document.getElementById(id);
const video = $('video'), preview = $('preview'), statusEl = $('status'), ring = $('ring'), countEl = $('count');
const RING_LEN = 238.8;

let facing = Q.get('cam') === 'back' ? 'environment' : 'user';
let stream = null, landmarker = null, detectOK = false;
let state = 'idle';               // idle | ready | countdown | capturing | review | cooldown
let hold = 0, stateT = 0, lastDetect = 0, lastFrame = performance.now();
let faces = 0, smiling = 0, bestScore = 0;
let reviewBlob = null, reviewTimer = 0;

// ---------- sound (starts after the Start tap, so browsers allow it) ----------
let ac = null;
function beep(freq, dur, vol = 0.15, type = 'sine') {
  if (!ac) return;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.value = freq; g.gain.value = vol;
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
  o.connect(g).connect(ac.destination); o.start(); o.stop(ac.currentTime + dur);
}
function shutterSound() {
  if (!ac) return;
  const n = ac.sampleRate * 0.12, b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
  const s = ac.createBufferSource(), g = ac.createGain(); g.gain.value = 0.5; s.buffer = b; s.connect(g).connect(ac.destination); s.start();
  beep(1320, 0.25, 0.08, 'triangle');
}

// ---------- local photo roll (IndexedDB on this phone) ----------
const DBN = 'diwali-booth', STORE = 'photos';
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DBN, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function tx(mode, fn) {
  const db = await idb();
  return new Promise((res, rej) => { const t = db.transaction(STORE, mode); const out = fn(t.objectStore(STORE)); t.oncomplete = () => res(out && out.result !== undefined ? out.result : out); t.onerror = () => rej(t.error); });
}
// Photos live in memory for this session and are copied to the device's storage when the browser
// allows it. A private window (or blocked site data) refuses storage: the booth keeps working from
// memory and warns that photos last only while the page stays open.
const MEM = new Map();
let storageOK = true;
async function putPhoto(p) {
  MEM.set(p.id, p);
  try { await tx('readwrite', s => s.put(p)); } catch (e) { if (storageOK) console.warn('This browser is not keeping photos:', e); storageOK = false; }
}
async function allPhotos() {
  let r = [];
  try { r = (await tx('readonly', s => s.getAll())) || []; } catch (e) { storageOK = false; }
  for (const x of r) if (x && x.blob && !MEM.has(x.id)) MEM.set(x.id, x);       // skip the storage check's test entry
  return [...MEM.values()].sort((a, b) => b.ts - a.ts);
}
async function clearPhotos() { MEM.clear(); try { await tx('readwrite', s => s.clear()); } catch (e) { storageOK = false; } }
async function probeStorage() {
  try { await tx('readwrite', s => s.put({ id: '__probe', ts: 0 })); await tx('readwrite', s => s.delete('__probe')); }
  catch (e) { storageOK = false; }
  return storageOK;
}
const STORAGE_WARNING = 'This browser is not keeping photos on the device (a private window does this). They stay only while this page is open, so save and upload them before closing it, or reopen the booth in a normal window.';
let rollUrls = [];
async function refreshRoll() {
  let list = [];
  try { list = await allPhotos(); } catch (e) { /* storage blocked: roll stays empty */ }
  const left = list.filter(p => !p.exported && !(AUTOSAVE && p.saved)).length;
  const waiting = list.filter(p => p.toUpload && !p.uploaded).length;
  $('rollCount').textContent = (list.length === 1 ? '1 photo' : `${list.length} photos`) + (!AUTOSAVE && left ? ` · ${left} to save` : '') + (waiting ? (upError ? ` · ${waiting} not uploaded` : ` · ${waiting} uploading`) : '');
  const thumb = $('rollThumb');
  if (thumb.dataset.url) URL.revokeObjectURL(thumb.dataset.url);
  if (list[0]) { const u = URL.createObjectURL(list[0].blob); thumb.src = u; thumb.dataset.url = u; } else { thumb.removeAttribute('src'); thumb.dataset.url = ''; }
  return list;
}

// ---------- saving ----------
const fname = ts => { const d = new Date(ts), p = n => String(n).padStart(2, '0'); return `diwali-2026-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${String(ts).slice(-3)}.jpg`; };
const rawName = ts => fname(ts).replace('.jpg', '-original.jpg');
function downloadFile(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
// Each photo saves itself when its preview ends: the framed copy, then the original without the frame.
async function autoSave(p) {
  if (!p || p.saved || !AUTOSAVE) return;
  p.saved = true;
  downloadFile(p.blob, fname(p.ts));
  if (p.raw) { await new Promise(r => setTimeout(r, 400)); downloadFile(p.raw, rawName(p.ts)); }
  try { await putPhoto(p); } catch (e) { /* the saved flag is only a convenience */ }
  queueUpload([p]);
}
async function savePhotos(items) {
  const files = [];
  for (const p of items) { files.push(new File([p.blob], fname(p.ts), { type: 'image/jpeg' })); if (p.raw) files.push(new File([p.raw], rawName(p.ts), { type: 'image/jpeg' })); }
  // Phones and tablets get the share sheet ("Save Image" puts it in Photos);
  // laptops and desktops save straight to the Downloads folder.
  const touch = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  if ((touch || IOS) && navigator.canShare && navigator.canShare({ files })) {
    try { await navigator.share({ files, title: 'Diwali Party 2026' }); await markExported(items); return 'shared'; }
    catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; if (IOS) return 'failed'; }
  }
  for (const f of files) {           // fallback: ordinary downloads
    const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    await new Promise(r => setTimeout(r, 350));
  }
  await markExported(items);
  return 'downloaded';
}
async function markExported(items) { for (const p of items) { p.exported = true; try { await putPhoto(p); } catch (e) { /* only a convenience */ } } queueUpload(items); }

// ---------- guest gallery (Google Drive, through the Apps Script in drive-script/Code.gs) ----------
// One-time setup on the booth device: open the booth with ?upload=<UPLOAD_KEY> (and ?gallery=<script URL>
// if config.js doesn't carry it yet). Both are remembered on this device.
const store = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} } };
if (Q.get('upload')) store.set('gallery-key', Q.get('upload'));
if (Q.get('gallery')) store.set('gallery-url', Q.get('gallery'));
const GALLERY_URL = Q.get('gallery') || store.get('gallery-url') || (window.BOOTH_CONFIG && BOOTH_CONFIG.script) || '';
const GALLERY_KEY = Q.get('upload') || store.get('gallery-key') || '';   // the link itself works even if the browser won't remember it
const GALLERY_ON = !!(GALLERY_URL && GALLERY_KEY);
let liveUpload = store.get('live-upload') === '1';
let upBusy = false, upFails = 0, upTimer = 0, upError = '';
// small copy for the gallery grid, so guests' phones load the wall quickly
async function thumbOf(blob) {
  const bmp = await createImageBitmap(blob), k = 480 / bmp.width;
  const c = document.createElement('canvas'); c.width = 480; c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise(r => c.toBlob(r, 'image/jpeg', 0.8));
}
async function postScript(obj) {
  let r;
  try { r = await fetch(GALLERY_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(obj) }); }
  catch (e) { throw new Error(navigator.onLine === false ? 'no internet connection' : 'the script could not be reached (' + (e.message || 'network error') + ')'); }
  const text = await r.text();
  let j; try { j = JSON.parse(text); } catch (e) { throw new Error('the script answered with a web page instead of data (HTTP ' + r.status + '): check it is deployed with access "Anyone"'); }
  if (!j.ok) throw new Error(j.error === 'bad_key' ? 'the upload key on this device does not match the script' : 'the script said: ' + (j.error || 'unknown error'));
  return j;
}
function blobToBase64(b) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(b); }); }
async function queueUpload(items) {
  if (!GALLERY_ON) return;
  for (const p of items) if (!p.uploaded && !p.toUpload) { p.toUpload = true; try { await putPhoto(p); } catch (e) {} }
  pumpUploads();
}
async function pumpUploads() {
  if (!GALLERY_ON || upBusy) return;
  upBusy = true; clearTimeout(upTimer);
  try {
    let list = [];
    try { list = (await allPhotos()).filter(p => p.toUpload && !p.uploaded).reverse(); } catch (e) {}
    for (const p of list) {
      if (state === 'countdown' || state === 'capturing') break;          // never slow down a capture
      const body = JSON.stringify({ key: GALLERY_KEY, name: fname(p.ts), data: await blobToBase64(p.blob), thumb: await blobToBase64(await thumbOf(p.blob)) });
      const j = await postScript(JSON.parse(body));
      p.uploaded = true; p.toUpload = false; p.driveId = j.id;
      try { await putPhoto(p); } catch (e) {}
      const shown = rollItems.find(x => x.id === p.id); if (shown) { shown.uploaded = true; shown.toUpload = false; shown.driveId = j.id; }
      if (!$('roll').hidden) updRollBtns();
      upFails = 0; upError = ''; refreshRoll(); if (!$('roll').hidden) markTiles();
    }
  } catch (e) {
    upFails++; upError = e.message || String(e); console.warn('Guest gallery upload failed; will retry', e);
    refreshRoll(); if (!$('roll').hidden) $('rollNote').textContent = 'Upload to the guest gallery is not working: ' + upError + '. The booth keeps retrying.';
  } finally {
    upBusy = false;
    // keep trying in the background: quickly at first, then every minute
    const left = (await allPhotos().catch(() => [])).some(p => p.toUpload && !p.uploaded);
    if (left) upTimer = setTimeout(pumpUploads, Math.min(60000, 4000 * Math.pow(2, Math.min(upFails, 4))));
  }
}
window.addEventListener('online', () => { upFails = 0; pumpUploads(); });

// ---------- camera ----------
async function openCamera() {
  if (stream) stream.getTracks().forEach(t => t.stop());
  // Ask for the camera's full 4:3 picture. A 16:9 or square request makes the camera crop its
  // sensor, and with the iPad upright that cuts the width: the picture looks zoomed in.
  const ask = (w, h, exact) => navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: facing }, width: { ideal: w }, height: { ideal: h }, aspectRatio: exact ? { exact: 4 / 3 } : { ideal: 4 / 3 } } });
  stream = null;
  if (HD) {
    // ?hd=1: the largest 4:3 picture. A bigger but 16:9 picture would crop the width again, so refuse it.
    try {
      stream = await ask(4032, 3024, true);
      const st = stream.getVideoTracks()[0].getSettings(), r = Math.max(st.width, st.height) / Math.min(st.width, st.height);
      if (Math.abs(r - 4 / 3) > 0.02 || Math.max(st.width, st.height) <= 1920) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    } catch (e) { stream = null; }
  }
  if (!stream) stream = await ask(1920, 1440, false);
  await widest(stream.getVideoTracks()[0]);
  video.srcObject = stream;
  await video.play().catch(() => {});
  await new Promise(r => { if (video.videoWidth) r(); else video.onloadedmetadata = () => r(); });
}

// Zoom the camera all the way out when the browser allows it (?wide=0 turns this off).
let camInfo = '';
const HD = Q.get('hd') === '1';   // ?hd=1 asks for the largest 4:3 picture the camera gives
async function widest(track) {
  camInfo = '';
  try {
    const caps = track.getCapabilities ? track.getCapabilities() : {}, set = track.getSettings();
    if (Q.get('wide') !== '0' && caps.zoom && set.zoom > caps.zoom.min) await track.applyConstraints({ advanced: [{ zoom: caps.zoom.min }] });
    const now = track.getSettings();
    camInfo = `cam ${now.width}x${now.height}` + (caps.zoom ? `  zoom ${(+now.zoom).toFixed(2)} (min ${caps.zoom.min})` : '  zoom n/a');
  } catch (e) { camInfo = 'cam zoom error: ' + e.message; }
}

// ---------- smile detection (MediaPipe Face Landmarker, served from this site) ----------
// The face detector is built for faces close to the camera. To catch people standing a few
// metres back, a second detector looks at a 2x zoomed crop of the middle of the picture,
// where people stand in the photo. The two take turns; the one that sees more faces wins.
let farLandmarker = null;
const ZOOM = clampNum(+Q.get('zoom'), 1.2, 4, 2);
const crop = document.createElement('canvas'), cropX = crop.getContext('2d');
const seen = { near: { faces: 0, scores: [], t: 0 }, far: { faces: 0, scores: [], t: 0 } };
let turn = 0;
async function loadDetector() {
  try {
    const { FilesetResolver, FaceLandmarker } = await import('./vendor/mediapipe/vision_bundle.mjs');
    const files = await FilesetResolver.forVisionTasks(new URL('./vendor/mediapipe/wasm', location.href).href);
    const opts = d => ({ baseOptions: { modelAssetPath: new URL('./models/face_landmarker.task', location.href).href, delegate: d },
      runningMode: 'VIDEO', numFaces: 6, outputFaceBlendshapes: true, minFaceDetectionConfidence: 0.4, minFacePresenceConfidence: 0.4, minTrackingConfidence: 0.4 });
    const make = async () => {
      if (IOS) return FaceLandmarker.createFromOptions(files, opts('CPU'));   // Safari's GPU path for this model is unreliable
      try { return await FaceLandmarker.createFromOptions(files, opts('GPU')); } catch (e) { return FaceLandmarker.createFromOptions(files, opts('CPU')); }
    };
    landmarker = await make();
    detectOK = true;
    if (IOS) await new Promise(r => setTimeout(r, 4000));   // let the iPad settle before the second detector loads
    try { farLandmarker = await make(); } catch (e) { farLandmarker = null; }
  } catch (e) {
    console.warn('Smile detection unavailable:', e);
    detectOK = false;
  }
}
function smileScores(res) {
  return (res.faceBlendshapes || []).map(f => {
    let l = 0, r = 0;
    for (const c of f.categories) { if (c.categoryName === 'mouthSmileLeft') l = c.score; else if (c.categoryName === 'mouthSmileRight') r = c.score; }
    return (l + r) / 2;
  });
}
function detect(now) {
  if (!detectOK || !video.videoWidth || now - lastDetect < (IOS ? 110 : 60)) return;
  lastDetect = now;
  const useFar = farLandmarker && (turn++ % 2 === 1);
  try {
    if (useFar) {
      const vw = video.videoWidth, vh = video.videoHeight, cw = vw / ZOOM, ch = vh / ZOOM;
      const sx = (vw - cw) / 2, sy = Math.max(0, Math.min(vh - ch, vh * 0.42 - ch / 2));   // faces sit a little above the middle
      const k = Math.min(1, 960 / cw); crop.width = Math.round(cw * k); crop.height = Math.round(ch * k);
      cropX.drawImage(video, sx, sy, cw, ch, 0, 0, crop.width, crop.height);
      const s = smileScores(farLandmarker.detectForVideo(crop, now));
      seen.far = { faces: s.length, scores: s, t: now };
    } else {
      const s = smileScores(landmarker.detectForVideo(video, now));
      seen.near = { faces: s.length, scores: s, t: now };
    }
  } catch (e) { return; }
  const fresh = r => now - r.t < 400 ? r : { faces: 0, scores: [] };
  const a = fresh(seen.near), b = fresh(seen.far), best = b.faces > a.faces ? b : a;
  faces = best.faces; bestScore = Math.max(0, ...best.scores); smiling = best.scores.filter(s => s >= SENS).length;
}

// ---------- states ----------
function setStatus(t) { if (statusEl.textContent !== t) statusEl.textContent = t; }
function go(s) { state = s; stateT = 0; }
function startCountdown() {
  if (state !== 'ready' && state !== 'cooldown') return;
  go('countdown'); hold = 0; showCount(COUNT);
}
function showCount(n) { countEl.innerHTML = ''; const s = document.createElement('span'); s.textContent = n; countEl.appendChild(s); beep(n === 1 ? 990 : 660, 0.18); }
// ---------- photo quality: sharpest frame of a burst, then light sharpening ----------
const BURST = clampNum(+Q.get('burst'), 1, 8, 5);          // frames to choose from (?burst=1 turns it off)
const SHARPEN = Q.has('sharpen') ? Math.min(1, Math.max(0, +Q.get('sharpen') || 0)) : 0.35;   // 0 = off
const nextFrame = () => new Promise(r => video.requestVideoFrameCallback ? video.requestVideoFrameCallback(() => r()) : setTimeout(r, 70));
// How sharp a frame is: the variance of a Laplacian on a small greyscale copy of the middle of the picture.
const probe = document.createElement('canvas'), probeX = probe.getContext('2d', { willReadFrequently: true });
function sharpness(vw, vh) {
  const w = 240, h = Math.round(w * vh / vw), sx = vw * 0.2, sy = vh * 0.15;
  probe.width = w; probe.height = h;
  probeX.drawImage(video, sx, sy, vw * 0.6, vh * 0.6, 0, 0, w, h);
  const d = probeX.getImageData(0, 0, w, h).data, g = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11;
  let sum = 0, sum2 = 0, n = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x, l = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - w] - g[i + w];
    sum += l; sum2 += l * l; n++;
  }
  return sum2 / n - (sum / n) ** 2;
}
async function bestFrame() {
  const vw = video.videoWidth, vh = video.videoHeight, mirror = facing === 'user';
  const raw = document.createElement('canvas'); raw.width = vw; raw.height = vh;
  const rx = raw.getContext('2d'); if (mirror) { rx.translate(vw, 0); rx.scale(-1, 1); }
  let best = -1, scores = [];
  for (let k = 0; k < BURST; k++) {
    if (k) await nextFrame();
    const sc = BURST > 1 ? sharpness(vw, vh) : 0; scores.push(sc.toFixed(0));
    if (sc > best) { best = sc; rx.drawImage(video, 0, 0, vw, vh); }
  }
  lastBurst = scores.join(' ');
  return raw;
}
let lastBurst = '';
// A mild unsharp mask on the photo itself (3x3), to undo some of the softness of video frames.
function sharpen(cv, amount) {
  const x = cv.getContext('2d'), w = cv.width, h = cv.height, img = x.getImageData(0, 0, w, h), s = img.data, o = new Uint8ClampedArray(s);
  const W4 = w * 4;
  for (let y = 1; y < h - 1; y++) for (let i = y * W4 + 4, e = y * W4 + W4 - 4; i < e; i++) {
    if ((i & 3) === 3) continue;
    o[i] = s[i] + amount * (4 * s[i] - s[i - 4] - s[i + 4] - s[i - W4] - s[i + W4]);
  }
  img.data.set(o); x.putImageData(img, 0, 0);
}

async function capture() {
  go('capturing');                // leave 'countdown' at once, so the loop fires only one capture
  shutterSound();
  const f = $('flash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
  countEl.innerHTML = '';
  const raw = await bestFrame();                  // the sharpest of a short burst, as guests saw it
  if (SHARPEN > 0) sharpen(raw, SHARPEN);
  const vw = raw.width, vh = raw.height;
  const c = DiwaliFrame.compose(raw, vw, vh, false);
  const [blob, rawBlob] = await Promise.all([new Promise(r => c.toBlob(r, 'image/jpeg', 0.92)), new Promise(r => raw.toBlob(r, 'image/jpeg', 0.95))]);
  const p = { id: `p${Date.now()}`, ts: Date.now(), blob, raw: rawBlob, saved: false };
  try { await putPhoto(p); } catch (e) { console.warn('Could not keep photo on this phone', e); }
  refreshRoll();
  showReview(p);
}
function showReview(p) {
  go('review'); reviewBlob = p;
  const img = $('reviewImg'); if (img.dataset.url) URL.revokeObjectURL(img.dataset.url);
  const u = URL.createObjectURL(p.blob); img.src = u; img.dataset.url = u;
  $('review').hidden = false;
  const bar = $('reviewTimer').firstElementChild;
  bar.style.transition = 'none'; bar.style.transform = 'scaleX(1)'; void bar.offsetWidth;
  bar.style.transition = `transform ${REVIEW_S}s linear`; bar.style.transform = 'scaleX(0)';
  clearTimeout(reviewTimer); reviewTimer = setTimeout(closeReview, REVIEW_S * 1000);
}
function closeReview() {
  clearTimeout(reviewTimer); $('review').hidden = true;
  autoSave(reviewBlob);
  if (liveUpload && reviewBlob) queueUpload([reviewBlob]);
  if (state === 'review') go('cooldown');
}
// ---------- main loop ----------
function loop(now) {
  const dt = Math.min(0.1, (now - lastFrame) / 1000); lastFrame = now; stateT += dt;
  if (video.paused && video.srcObject && state !== 'idle') video.play().catch(() => {});   // Safari can pause the camera feed; nudge it back
  if (video.videoWidth) DiwaliFrame.compose(video, video.videoWidth, video.videoHeight, facing === 'user', preview);

  if (state === 'ready' || state === 'cooldown') detect(now);
  const crowdSmiling = faces > 0 && smiling >= Math.max(1, Math.ceil(faces / 2));
  if (state === 'cooldown' && stateT > COOLDOWN_S) go('ready');
  if (state === 'ready') {
    hold = crowdSmiling ? hold + dt : Math.max(0, hold - dt * 1.5);
    if (hold >= HOLD) startCountdown();
    if (!detectOK) setStatus('Tap the gold button to take a photo');
    else if (!faces) setStatus('Step in front of the camera');
    else if (!crowdSmiling) setStatus(faces > 1 ? 'Everyone, big smiles!' : 'Give us a big smile!');
    else setStatus('Hold that smile…');
  } else if (state === 'cooldown') { hold = 0; setStatus('Get ready for the next one…'); }
  else if (state === 'countdown') {
    setStatus('Smile!');
    const n = COUNT - Math.floor(stateT);
    if (stateT >= COUNT) capture();
    else if (countEl.textContent !== String(n)) showCount(n);
  }
  ring.style.strokeDashoffset = String(RING_LEN * (1 - (state === 'countdown' ? Math.min(1, stateT / COUNT) : Math.min(1, hold / HOLD))));
  if (DEBUG) $('debug').textContent = `state ${state}\nfaces ${faces}  smiling ${smiling}\nbest ${bestScore.toFixed(2)}  need ${SENS}\nhold ${hold.toFixed(2)} / ${HOLD}\ndetector ${detectOK ? 'on' : 'off'}  zoom ${farLandmarker ? ZOOM + 'x' : 'off'}\nnear ${seen.near.faces} faces  far ${seen.far.faces} faces\n${camInfo}${HD ? (video.videoWidth * video.videoHeight > 1920 * 1440 ? '  (hd on)' : '  (hd not available)') : ''}\nburst ${lastBurst || '-'}`;
  requestAnimationFrame(loop);
}

// ---------- wiring ----------
let wake = null;
async function keepAwake() { try { wake = await navigator.wakeLock.request('screen'); } catch (e) { /* not supported */ } }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && state !== 'idle') keepAwake(); });

$('startBtn').addEventListener('click', async () => {
  const err = $('startErr'); err.hidden = true;
  const btn = $('startBtn'); btn.disabled = true; btn.textContent = 'Opening the camera…';
  try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; }
  keepAwake();
  try { navigator.storage?.persist?.()?.catch?.(() => {}); } catch (e) { /* not supported */ }
  try { await openCamera(); }
  catch (e) {
    btn.disabled = false; btn.textContent = 'Try again';
    err.textContent = e && e.name === 'NotAllowedError'
      ? 'The camera is blocked. Allow camera access for this site in the browser settings, then tap Try again.'
      : 'No camera found. Check that no other app is using it, then tap Try again.';
    err.hidden = false; return;
  }
  $('start').hidden = true;
  goFull();            // after the camera prompt, which would otherwise knock the page out of full screen
  setStatus('Loading smile detection…');
  go('cooldown');
  loadDetector();
});
// ---------- full screen ----------
const fsEl = document.documentElement;
const fsReq = fsEl.requestFullscreen || fsEl.webkitRequestFullscreen;
const isFull = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
function goFull() { if (!fsReq || isFull()) return; try { const r = fsReq.call(fsEl); if (r && r.catch) r.catch(() => {}); } catch (e) { /* not allowed here */ } }   // never wait: iPad Safari can leave this hanging
function updFullBtn() { $('fullBtn').hidden = !fsReq || isFull() || state === 'idle'; }
$('fullBtn').addEventListener('click', goFull);
document.addEventListener('fullscreenchange', updFullBtn); document.addEventListener('webkitfullscreenchange', updFullBtn);
setInterval(updFullBtn, 1000);

$('shutter').addEventListener('click', () => { if (state === 'ready' || state === 'cooldown') startCountdown(); });
$('flipBtn').addEventListener('click', async () => {
  if (state === 'idle') return;
  facing = facing === 'user' ? 'environment' : 'user';
  try { await openCamera(); } catch (e) { facing = facing === 'user' ? 'environment' : 'user'; await openCamera().catch(() => {}); }
});
$('nextGuest').addEventListener('click', closeReview);

// photo roll
let rollItems = [], picked = new Set();
async function openRoll() {
  if (state === 'countdown') return;
  const prev = state; go('review');           // pauses the smile trigger while the roll is open
  $('roll').dataset.prev = prev;
  rollUrls.forEach(u => URL.revokeObjectURL(u)); rollUrls = [];
  rollItems = await refreshRoll(); picked.clear();
  const grid = $('rollGrid'); grid.innerHTML = '';
  if (!rollItems.length) { const p = document.createElement('p'); p.id = 'rollEmpty'; p.textContent = 'No photos yet. Smile at the booth to take the first one.'; grid.appendChild(p); }
  for (const it of rollItems) {
    const b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-pressed', 'false'); b.setAttribute('aria-label', 'Pick this photo');
    const img = document.createElement('img'); const u = URL.createObjectURL(it.blob); rollUrls.push(u); img.src = u; img.alt = ''; img.loading = 'lazy';
    b.appendChild(img);
    b.addEventListener('click', () => { const on = !picked.has(it.id); on ? picked.add(it.id) : picked.delete(it.id); b.setAttribute('aria-pressed', String(on)); updRollBtns(); });
    grid.appendChild(b);
  }
  $('clearAll').textContent = 'Delete all'; $('clearAll').dataset.armed = '';
  if (!storageOK) $('rollNote').textContent = STORAGE_WARNING; else if (upError && GALLERY_ON) $('rollNote').textContent = 'Upload to the guest gallery is not working: ' + upError + '. The booth keeps retrying.'; else $('rollNote').textContent = IOS
    ? 'Photos are kept on this iPad. Tap the gold button, then choose "Save Images" to put them in Photos. A tick marks the ones already saved.'
    : 'Every photo has already gone to Downloads. You can save them again from here.';
  markTiles(); updRollBtns(); $('roll').hidden = false;
}
const unsavedItems = () => rollItems.filter(p => !p.exported);
function updRollBtns() {
  if (IOS) {
    const left = unsavedItems();
    $('saveSel').textContent = picked.size ? `Save ${Math.min(picked.size, BATCH)} picked to Photos`
      : left.length ? `Save ${Math.min(left.length, BATCH)} to Photos${left.length > BATCH ? ` (${left.length} left)` : ''}` : 'All saved to Photos';
    $('saveSel').disabled = !picked.size && !left.length;
  } else {
    $('saveSel').textContent = picked.size ? `Save ${picked.size} picked` : `Save all (${rollItems.length})`;
    $('saveSel').disabled = !rollItems.length;
  }
  $('clearAll').disabled = !rollItems.length;
  $('uploadSel').hidden = !GALLERY_ON;
  const notUp = rollItems.filter(p => !p.uploaded).length;
  $('uploadSel').textContent = picked.size ? `Upload ${picked.size} picked to guest gallery` : notUp ? `Upload ${notUp} to guest gallery` : 'All in the guest gallery';
  $('uploadSel').disabled = !picked.size && !notUp;
}
$('rollBtn').addEventListener('click', openRoll);
$('closeRoll').addEventListener('click', () => { $('roll').hidden = true; go('cooldown'); });
$('saveSel').addEventListener('click', async () => {
  let list = picked.size ? rollItems.filter(p => picked.has(p.id)) : (IOS ? unsavedItems() : rollItems);
  if (IOS) list = list.slice(0, BATCH);       // the share sheet handles a batch of 20 photos (40 files) comfortably
  const r = await savePhotos(list);
  const n = `${list.length} photo${list.length === 1 ? '' : 's'}`;
  $('rollNote').textContent = r === 'cancelled' ? 'Nothing saved. Tap the button again and choose "Save Images".'
    : r === 'failed' ? 'Saving did not work. Try again with fewer photos picked.'
    : IOS ? `Saved ${n} with their originals. ${unsavedItems().length ? 'Tap the button again for the next batch.' : 'Everything is in Photos now.'}`
    : `Saved ${n} with their originals to Downloads.`;
  picked.clear(); $('rollGrid').querySelectorAll('[aria-pressed="true"]').forEach(b => b.setAttribute('aria-pressed', 'false'));
  markTiles(); updRollBtns(); refreshRoll();
});
function markTiles() { [...$('rollGrid').children].forEach((b, i) => { const it = rollItems[i]; if (it) { b.classList.toggle('done', !!it.exported); b.classList.toggle('up', !!it.uploaded); } }); }
$('uploadSel').addEventListener('click', async () => {
  const list = picked.size ? rollItems.filter(p => picked.has(p.id)) : rollItems.filter(p => !p.uploaded);
  if (!list.length) { $('rollNote').textContent = 'Every photo is already in the guest gallery.'; return; }
  await queueUpload(list);
  $('rollNote').textContent = `Sending ${list.length} photo${list.length === 1 ? '' : 's'} to the guest gallery. A cloud mark shows the ones that have arrived.`;
  picked.clear(); $('rollGrid').querySelectorAll('[aria-pressed="true"]').forEach(b => b.setAttribute('aria-pressed', 'false')); updRollBtns();
});
$('clearAll').addEventListener('click', async () => {
  const b = $('clearAll');
  if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'Tap again to delete every photo'; return; }
  await clearPhotos().catch(() => {}); openRoll();
});
document.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { if (!$('start').hidden) return; e.preventDefault(); if (!$('review').hidden) closeReview(); else startCountdown(); } });

// Fit the preview: the largest 4:5 box inside the space between the status line and the buttons.
function fitPreview() {
  const r = $('stageWrap').getBoundingClientRect(), pad = 12;
  let h = Math.max(0, r.height - pad * 2), w = h * 1080 / 1350;
  if (w > r.width - pad * 2) { w = Math.max(0, r.width - pad * 2); h = w * 1350 / 1080; }
  preview.style.width = Math.floor(w) + 'px'; preview.style.height = Math.floor(h) + 'px';
}
addEventListener('resize', fitPreview);
addEventListener('orientationchange', () => setTimeout(fitPreview, 300));
window.visualViewport?.addEventListener('resize', fitPreview);
if (window.ResizeObserver) new ResizeObserver(fitPreview).observe($('stageWrap'));
fitPreview();
if (DEBUG) $('debug').hidden = false;
probeStorage().then(ok => { if (!ok) { $('startErr').textContent = STORAGE_WARNING; $('startErr').hidden = false; } });
$('galleryState').textContent = GALLERY_ON ? 'Guest gallery: checking the connection…' : 'Guest gallery: not set up on this device yet.';
if (GALLERY_ON) postScript({ key: GALLERY_KEY, ping: true })
  .then(() => { $('galleryState').textContent = 'Guest gallery: connected and working. Saved photos are sent to it.'; })
  .catch(e => { $('galleryState').textContent = 'Guest gallery problem: ' + e.message + '.'; $('galleryState').style.color = '#ffb4a8'; });
$('liveUpload').checked = liveUpload; $('liveUpload').disabled = !GALLERY_ON;
$('liveUpload').addEventListener('change', e => { liveUpload = e.target.checked; store.set('live-upload', liveUpload ? '1' : '0'); });
pumpUploads();
if (!AUTOSAVE) $('reviewNote').textContent = 'Kept on this iPad. Save the photos to Photos from the Photos button.';
await DiwaliFrame.ready();
refreshRoll();
if (!navigator.mediaDevices?.getUserMedia) {
  $('startErr').textContent = 'This browser cannot use the camera here. Open the booth link in Chrome or Safari.';
  $('startErr').hidden = false; $('startBtn').disabled = true;
}
setStatus('Diwali Photo Booth');
requestAnimationFrame(loop);
