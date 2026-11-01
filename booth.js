// Diwali Photo Booth — live camera, smile trigger, countdown, framed photo, local photo roll.
// URL options: ?sens=0.45 (smile threshold 0–1), ?hold=0.7 (seconds a smile must last),
//              ?count=3 (countdown seconds), ?preview=10 (seconds each photo shows before it saves),
//              ?cam=back (start on the rear camera), ?zoom=2, ?debug
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
const putPhoto = p => tx('readwrite', s => s.put(p));
const allPhotos = async () => { const r = await tx('readonly', s => s.getAll()); return (r || []).sort((a, b) => b.ts - a.ts); };
const clearPhotos = () => tx('readwrite', s => s.clear());
let rollUrls = [];
async function refreshRoll() {
  let list = [];
  try { list = await allPhotos(); } catch (e) { /* storage blocked: roll stays empty */ }
  const left = list.filter(p => !p.exported && !(AUTOSAVE && p.saved)).length;
  $('rollCount').textContent = (list.length === 1 ? '1 photo' : `${list.length} photos`) + (!AUTOSAVE && left ? ` · ${left} to save` : '');
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
async function markExported(items) { for (const p of items) { p.exported = true; try { await putPhoto(p); } catch (e) { /* only a convenience */ } } }

// ---------- camera ----------
async function openCamera() {
  if (stream) stream.getTracks().forEach(t => t.stop());
  stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1920 } } });
  video.srcObject = stream;
  await video.play().catch(() => {});
  await new Promise(r => { if (video.videoWidth) r(); else video.onloadedmetadata = () => r(); });
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
    const make = async () => { try { return await FaceLandmarker.createFromOptions(files, opts('GPU')); } catch (e) { return FaceLandmarker.createFromOptions(files, opts('CPU')); } };
    landmarker = await make();
    detectOK = true;
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
  if (!detectOK || !video.videoWidth || now - lastDetect < 60) return;
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
async function capture() {
  go('capturing');                // leave 'countdown' at once, so the loop fires only one capture
  shutterSound();
  const f = $('flash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
  countEl.innerHTML = '';
  const vw = video.videoWidth, vh = video.videoHeight, mirror = facing === 'user';
  const raw = document.createElement('canvas'); raw.width = vw; raw.height = vh;   // the full camera picture, as guests saw it
  const rx = raw.getContext('2d'); if (mirror) { rx.translate(vw, 0); rx.scale(-1, 1); } rx.drawImage(video, 0, 0, vw, vh);
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
  if (state === 'review') go('cooldown');
}
// ---------- main loop ----------
function loop(now) {
  const dt = Math.min(0.1, (now - lastFrame) / 1000); lastFrame = now; stateT += dt;
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
  if (DEBUG) $('debug').textContent = `state ${state}\nfaces ${faces}  smiling ${smiling}\nbest ${bestScore.toFixed(2)}  need ${SENS}\nhold ${hold.toFixed(2)} / ${HOLD}\ndetector ${detectOK ? 'on' : 'off'}  zoom ${farLandmarker ? ZOOM + 'x' : 'off'}\nnear ${seen.near.faces} faces  far ${seen.far.faces} faces`;
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
  try { await document.documentElement.requestFullscreen?.(); } catch (e) { /* phones without full screen */ }
  keepAwake();
  try { await navigator.storage?.persist?.(); } catch (e) { /* not supported */ }
  try { await openCamera(); }
  catch (e) {
    btn.disabled = false; btn.textContent = 'Try again';
    err.textContent = e && e.name === 'NotAllowedError'
      ? 'The camera is blocked. Allow camera access for this site in the browser settings, then tap Try again.'
      : 'No camera found. Check that no other app is using it, then tap Try again.';
    err.hidden = false; return;
  }
  $('start').hidden = true;
  setStatus('Loading smile detection…');
  go('cooldown');
  loadDetector();
});
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
  $('rollNote').textContent = IOS
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
function markTiles() { [...$('rollGrid').children].forEach((b, i) => { const it = rollItems[i]; if (it) b.classList.toggle('done', !!it.exported); }); }
$('clearAll').addEventListener('click', async () => {
  const b = $('clearAll');
  if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'Tap again to delete every photo'; return; }
  await clearPhotos().catch(() => {}); openRoll();
});
document.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { if (!$('start').hidden) return; e.preventDefault(); if (!$('review').hidden) closeReview(); else startCountdown(); } });

if (DEBUG) $('debug').hidden = false;
if (!AUTOSAVE) $('reviewNote').textContent = 'Kept on this iPad. Save the photos to Photos from the Photos button.';
await DiwaliFrame.ready();
refreshRoll();
if (!navigator.mediaDevices?.getUserMedia) {
  $('startErr').textContent = 'This browser cannot use the camera here. Open the booth link in Chrome or Safari.';
  $('startErr').hidden = false; $('startBtn').disabled = true;
}
setStatus('Diwali Photo Booth');
requestAnimationFrame(loop);
