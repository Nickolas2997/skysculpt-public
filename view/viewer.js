// SkySculpt show viewer — opens a shared drone show on the real 3D map.
// The link (https://skysculptai.com/view/#<id>) is created in SkySculpt Studio.
const API = 'https://vz58nljdjj.execute-api.eu-north-1.amazonaws.com/default/imagetomesh';
const R = Math.PI / 180, A = 6378137, F = 1 / 298.257223563, E2 = F * (2 - F);
const $ = s => document.querySelector(s), msg = t => {$('#msg').textContent = t || '';};
const ecef = (lat, lng, h) => {const p = lat * R, l = lng * R, s = Math.sin(p), N = A / Math.sqrt(1 - E2 * s * s); return [(N + h) * Math.cos(p) * Math.cos(l), (N + h) * Math.cos(p) * Math.sin(l), (N * (1 - E2) + h) * s];};
const basis = (lat, lng) => {const p = lat * R, l = lng * R, sp = Math.sin(p), cp = Math.cos(p), sl = Math.sin(l), cl = Math.cos(l); return {e: [-sl, cl, 0], n: [-sp * cl, -sp * sl, cp], u: [cp * cl, cp * sl, sp]};};
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], norm = a => {const l = Math.hypot(...a) || 1; return a.map(x => x / l);};
const fmt = s => {s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');};

function fail(text) {$('#wait').textContent = text; $('#wait').hidden = false;}

async function start() {
  const id = (location.hash || '').replace(/^#/, '');
  if (!/^[A-Za-z0-9_-]{22}$/.test(id)) return fail('This link is not complete. Please check the address you received.');
  const url = new URL(API); url.searchParams.set('studio', '1'); url.searchParams.set('action', 'share-get');
  const r = await fetch(url, {method: 'POST', credentials: 'omit', cache: 'no-store', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({id})});
  const info = await r.json().catch(() => ({}));
  if (!r.ok) return fail(info.error || 'This show could not be opened.');
  const meta = info.meta, site = {...info.site}, all = meta.all, n = meta.drones, Fr = meta.frames, duration = meta.duration;
  document.title = 'SkySculptAi · Drone show';
  $('#name').textContent = 'SkySculptAi'; $('#stats').textContent = `${n} drones · ${fmt(duration)}`;
  const gz = new Uint8Array(await (await fetch(info.dataUrl, {credentials: 'omit'})).arrayBuffer());
  const raw = new Uint8Array(await new Response(new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  const P = new Int16Array(raw.buffer, 0, Fr * n * 3), C = raw.subarray(Fr * n * 6);

  // ---------------- drones + guides overlay
  const canvas = $('.ssv-fx'), gl = canvas.getContext('webgl', {alpha: true, premultipliedAlpha: false, antialias: true});
  const sh = (t, s) => {const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); return o;};
  const mk = (vs, fs) => {const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p); return p;};
  const prog = mk('attribute vec3 p;attribute vec3 c;uniform mat4 m;uniform float k;uniform float s;uniform float mn;varying vec3 v;void main(){v=c;if(c.r+c.g+c.b<.004){gl_Position=vec4(2.,2.,2.,1.);gl_PointSize=0.;return;}vec4 q=m*vec4(p,1.);gl_Position=q;gl_PointSize=clamp(s*k/max(q.w,.001),mn,96.);}',
    'precision mediump float;varying vec3 v;void main(){vec2 d=gl_PointCoord*2.-1.;float r=dot(d,d);if(r>1.)discard;float core=smoothstep(.12,0.,r);float glow=exp(-r*4.)*.9;gl_FragColor=vec4(v*(glow+core*1.2)+vec3(core*.45),clamp(glow+core,0.,1.));}');
  const lprog = mk('attribute vec3 p;attribute vec4 c;uniform mat4 m;varying vec4 v;void main(){v=c;gl_Position=m*vec4(p,1.);}', 'precision mediump float;varying vec4 v;void main(){gl_FragColor=v;}');
  const aP = gl.getAttribLocation(prog, 'p'), aC = gl.getAttribLocation(prog, 'c'), uM = gl.getUniformLocation(prog, 'm'), uK = gl.getUniformLocation(prog, 'k'), uS = gl.getUniformLocation(prog, 's'), uN = gl.getUniformLocation(prog, 'mn');
  const laP = gl.getAttribLocation(lprog, 'p'), laC = gl.getAttribLocation(lprog, 'c'), luM = gl.getUniformLocation(lprog, 'm');
  const bP = gl.createBuffer(), bC = gl.createBuffer(), lbP = gl.createBuffer(), lbC = gl.createBuffer();
  const world = new Float32Array(n * 3), col = new Float32Array(n * 3), ext = {};
  const toWorld = (x, y, z) => {const r = site.rot * R; return [x * Math.cos(r) + y * Math.sin(r), -x * Math.sin(r) + y * Math.cos(r), z];};
  function fill(t) {
    const f = Math.max(0, Math.min(Fr - 1, t * meta.fps)), i = Math.floor(f), j = Math.min(Fr - 1, i + 1), u = f - i, a = i * n * 3, b = j * n * 3, s = meta.step, c = meta.center, r = site.rot * R, cr = Math.cos(r), sr = Math.sin(r);
    ext.x0 = ext.y0 = ext.z0 = Infinity; ext.x1 = ext.y1 = ext.z1 = -Infinity;
    for (let k = 0; k < n; k++) {
      const q = 3 * k, x = c[0] + (P[a + q] + (P[b + q] - P[a + q]) * u) * s, y = c[1] + (P[a + q + 1] + (P[b + q + 1] - P[a + q + 1]) * u) * s, z = c[2] + (P[a + q + 2] + (P[b + q + 2] - P[a + q + 2]) * u) * s;
      if (x < ext.x0) ext.x0 = x; if (x > ext.x1) ext.x1 = x; if (y < ext.y0) ext.y0 = y; if (y > ext.y1) ext.y1 = y; if (z < ext.z0) ext.z0 = z; if (z > ext.z1) ext.z1 = z;
      world[q] = x * cr + y * sr; world[q + 1] = -x * sr + y * cr; world[q + 2] = z + site.height;
      for (let d = 0; d < 3; d++) col[q + d] = (C[a + q + d] + (C[b + q + d] - C[a + q + d]) * u) / 255;
    }
  }
  function audienceLocal() {const a = site.audience; if (!a) return null; const S = basis(site.lat, site.lng), o = ecef(site.lat, site.lng, site.ground), e = ecef(a.lat, a.lng, a.ground ?? site.ground), d = [e[0] - o[0], e[1] - o[1], e[2] - o[2]]; return [dot(d, S.e), dot(d, S.n), dot(d, S.u)];}
  function guideLines() {
    const Pl = [], Cl = [], seg = (p, q, c) => {Pl.push(...p, ...q); Cl.push(...c, ...c);}, g = site.guides || {}, h = site.height, flat = ext.y1 - ext.y0 < 2;
    const cyan = [.45, .9, 1, .95], soft = [.45, .9, 1, .32], white = [1, 1, 1, .45], amber = [1, .72, .3, .9];
    if (Number.isFinite(ext.x0)) {
      const yc = (ext.y0 + ext.y1) / 2, ground = flat ? [[ext.x0, yc], [ext.x1, yc]] : [[ext.x0, ext.y0], [ext.x1, ext.y0], [ext.x1, ext.y1], [ext.x0, ext.y1]], G = ground.map(([x, y]) => toWorld(x, y, .3));
      if (g.foot) {for (let i = 0; i < G.length; i++) {if (G.length === 2 && i === 1) break; seg(G[i], G[(i + 1) % G.length], cyan);} for (const q of G) {seg([q[0] - 1.5, q[1], q[2]], [q[0] + 1.5, q[1], q[2]], cyan); seg([q[0], q[1] - 1.5, q[2]], [q[0], q[1] + 1.5, q[2]], cyan);}}
      if (g.guides) for (const [x, y] of ground) seg(toWorld(x, y, .3), toWorld(x, y, ext.z1 + h), soft);
      if (g.box) {const B = []; for (const z of [ext.z0 + h, ext.z1 + h]) B.push([ext.x0, ext.y0, z], [ext.x1, ext.y0, z], [ext.x1, ext.y1, z], [ext.x0, ext.y1, z]); const W = B.map(q => toWorld(...q));
        for (const [p, q] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) seg(W[p], W[q], white);}
    }
    if (g.area) {const Q = [[all.x0, all.y0], [all.x1, all.y0], [all.x1, all.y1], [all.x0, all.y1]].map(([x, y]) => toWorld(x, y, .2));
      for (let i = 0; i < 4; i++) {const p = Q[i], d = add(Q[(i + 1) % 4], p, -1); for (let k = 0; k < 12; k += 2) seg(add(p, d, k / 12), add(p, d, (k + 1) / 12), amber);}}
    const q = audienceLocal(); if (q) {seg([q[0] - 3, q[1], .3], [q[0] + 3, q[1], .3], amber); seg([q[0], q[1] - 3, .3], [q[0], q[1] + 3, .3], amber); seg([q[0], q[1], .3], [q[0], q[1], 1.7], amber);}
    return {P: new Float32Array(Pl), C: new Float32Array(Cl)};
  }
  let map = null;
  function camera(w, h) {
    const c = map?.center; if (!c) return null;
    const clat = +c.lat, clng = +c.lng, calt = +(c.altitude || 0), hd = (+map.heading || 0) * R, tl = (+map.tilt || 0) * R, rl = (+map.roll || 0) * R, range = +map.range || 1000, fov = (+map.fov || 35) * R;
    const Bc = basis(clat, clng), S = basis(site.lat, site.lng), o = ecef(site.lat, site.lng, site.ground);
    const toS = v => [dot(v, S.e), dot(v, S.n), dot(v, S.u)], fromC = v => add(add(Bc.e.map(x => x * v[0]), Bc.n, v[1]), Bc.u, v[2]);
    let f = norm(toS(fromC([Math.sin(hd) * Math.sin(tl), Math.cos(hd) * Math.sin(tl), -Math.cos(tl)]))), r = norm(toS(fromC([Math.cos(hd), -Math.sin(hd), 0]))), u = norm(cross(r, f));
    if (rl) {const cr = Math.cos(rl), sr = Math.sin(rl), r2 = add(r.map(x => x * cr), u, sr), u2 = add(u.map(x => x * cr), r, -sr); r = r2; u = u2;}
    const ce = ecef(clat, clng, calt), eye = add(toS([ce[0] - o[0], ce[1] - o[1], ce[2] - o[2]]), f, -range);
    const near = Math.max(1, range / 1000), far = range * 40 + 20000, t = 1 / Math.tan(fov / 2), a = w / h;
    const view = [r[0], u[0], -f[0], 0, r[1], u[1], -f[1], 0, r[2], u[2], -f[2], 0, -dot(r, eye), -dot(u, eye), dot(f, eye), 1];
    const proj = [t / a, 0, 0, 0, 0, t, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, 2 * far * near / (near - far), 0], m = new Float32Array(16);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {let s = 0; for (let k = 0; k < 4; k++) s += proj[k * 4 + j] * view[i * 4 + k]; m[i * 4 + j] = s;}
    return {m, k: h / (2 * Math.tan(fov / 2))};
  }
  let t = 0, tick = 0;
  function draw() {
    const d = Math.min(devicePixelRatio || 1, 2), w = Math.round(innerWidth * d), h = Math.round(innerHeight * d);
    if (canvas.width !== w || canvas.height !== h) {canvas.width = w; canvas.height = h;}
    gl.viewport(0, 0, w, h); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    const cam = camera(w, h); if (!cam) return;
    fill(t); gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND);
    const L = guideLines(); if (L.P.length) {gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.useProgram(lprog);
      gl.bindBuffer(gl.ARRAY_BUFFER, lbP); gl.bufferData(gl.ARRAY_BUFFER, L.P, gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(laP); gl.vertexAttribPointer(laP, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, lbC); gl.bufferData(gl.ARRAY_BUFFER, L.C, gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(laC); gl.vertexAttribPointer(laC, 4, gl.FLOAT, false, 0, 0);
      gl.uniformMatrix4fv(luM, false, cam.m); gl.drawArrays(gl.LINES, 0, L.P.length / 3); gl.disableVertexAttribArray(laC);}
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE); gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, bP); gl.bufferData(gl.ARRAY_BUFFER, world, gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(aP); gl.vertexAttribPointer(aP, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, bC); gl.bufferData(gl.ARRAY_BUFFER, col, gl.DYNAMIC_DRAW); gl.enableVertexAttribArray(aC); gl.vertexAttribPointer(aC, 3, gl.FLOAT, false, 0, 0);
    gl.uniformMatrix4fv(uM, false, cam.m); gl.uniform1f(uK, cam.k); gl.uniform1f(uS, 2.4); gl.uniform1f(uN, Math.max(2.5, h * .004)); gl.drawArrays(gl.POINTS, 0, n);
    if (++tick % 15 === 0) $('#size').textContent = Number.isFinite(ext.x0) ? `Now ${(ext.x1 - ext.x0).toFixed(0)} × ${(ext.y1 - ext.y0).toFixed(0)} m, up to ${(ext.z1 + site.height).toFixed(0)} m high · whole show ${(all.x1 - all.x0).toFixed(0)} × ${(all.y1 - all.y0).toFixed(0)} m` : '';
  }

  // ---------------- controls
  const sync = () => {document.querySelector('.ssv').style.setProperty('--n', (site.night / 100).toFixed(2)); $('#night').value = site.night; $('#nightv').textContent = site.night === 0 ? 'Day' : site.night < 40 ? 'Dusk' : 'Night';
    $('#mode').value = site.mode || 'SATELLITE'; document.querySelectorAll('[data-g]').forEach(c => {c.checked = !!(site.guides || {})[c.dataset.g];}); $('#audview').disabled = !site.audience;
    const q = audienceLocal(); $('#aud').textContent = q ? `The audience stands ${Math.hypot(q[0] - (all.x0 + all.x1) / 2, q[1] - (all.y0 + all.y1) / 2).toFixed(0)} m from the show centre.` : 'No audience point in this show.';};
  site.guides = {foot: true, guides: true, box: false, area: true, ...(site.guides || {})}; sync();
  $('#night').oninput = e => {site.night = +e.target.value; sync();};
  $('#mode').onchange = e => {site.mode = e.target.value; if (map) map.mode = site.mode;};
  document.querySelectorAll('[data-g]').forEach(c => c.onchange = () => {site.guides[c.dataset.g] = c.checked;});
  $('#toggle').onclick = () => {const p = $('#panel'); p.hidden = !p.hidden; $('#toggle').setAttribute('aria-expanded', String(!p.hidden));};
  if (innerWidth < 760) {$('#panel').hidden = true; $('#toggle').setAttribute('aria-expanded', 'false');}
  let playing = false, speed = 1, last = performance.now();
  $('#play').onclick = () => {playing = !playing; $('#play').textContent = playing ? '❚❚' : '▶'; last = performance.now(); if (playing && t >= duration) t = 0;};
  $('#seek').oninput = e => {t = e.target.value / 1000 * duration;};
  const speeds = [.5, 1, 2, 4]; $('#speed').onclick = e => {speed = speeds[(speeds.indexOf(speed) + 1) % speeds.length]; e.target.textContent = speed + '×';};
  $('#full').onclick = () => {document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.();};
  const showSize = Math.max(all.x1 - all.x0, all.y1 - all.y0, all.z1, 20), showH = all.z1 / 2;
  function view(name) {if (!map) return; audOff();
    const V = {front: [0, 88], side: [90, 88], top: [0, 0], '3d': [-35, 68]}[name] || [-35, 68], fov = 35 * R, range = showSize / 2 / Math.tan(fov / 2) * 1.6 + showSize * .3;
    const c = toWorld((all.x0 + all.x1) / 2, (all.y0 + all.y1) / 2, 0), g = toGeo([c[0], c[1], site.height + showH]);
    map.fov = 35; map.flyCameraTo({endCamera: {center: g, range, tilt: V[1], heading: (site.rot + V[0] + 360) % 360}, durationMillis: 1600});
    document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === name)));}
  document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => view(b.dataset.view));
  const toGeo = v => {const S = basis(site.lat, site.lng), o = ecef(site.lat, site.lng, site.ground), w = add(add(add(o, S.e, v[0]), S.n, v[1]), S.u, v[2]);
    const lng = Math.atan2(w[1], w[0]) / R, p = Math.hypot(w[0], w[1]); return {lat: Math.atan2(w[2], p * (1 - E2)) / R, lng, altitude: site.ground + v[2]};};
  // audience camera: moves up/down/left/right and turns, never forwards/backwards
  let aud = null;
  const audCenter = () => {const h = aud.heading * R; return toGeo([aud.x + Math.sin(h) * aud.dist, aud.y + Math.cos(h) * aud.dist, aud.z]);};
  function audApply(fly) {if (!aud || !map) return; const c = audCenter(); map.fov = aud.fov;
    if (fly) map.flyCameraTo({endCamera: {center: c, range: aud.dist, tilt: 90, heading: aud.heading}, durationMillis: 1800}); else {map.center = c; map.range = aud.dist; map.tilt = 90; map.heading = aud.heading;}
    aud.settle = performance.now() + (fly ? 2000 : 250);}
  function audKeep() {if (!aud || !map || performance.now() < aud.settle) return; const c = map.center; if (!c) return; const want = audCenter();
    const off = Math.hypot((+c.lat - want.lat) * 111320, (+c.lng - want.lng) * 111320 * Math.cos(want.lat * R)) + Math.abs((+c.altitude || 0) - want.altitude);
    if (Math.abs(((+map.heading || 0) - aud.heading + 540) % 360 - 180) > .5) aud.heading = ((+map.heading || 0) + 360) % 360;
    if (off > .5 || Math.abs((+map.range || 0) - aud.dist) > .5 || Math.abs((+map.tilt || 0) - 90) > .5) audApply(false);}
  function audMove(dx, dz, turn) {if (!aud) return; const h = aud.heading * R; aud.x += Math.cos(h) * dx; aud.y -= Math.sin(h) * dx; aud.z = Math.max(.5, aud.z + dz); aud.heading = (aud.heading + turn + 360) % 360; audApply(false);}
  function audOff() {aud = null; $('#pad').hidden = true;}
  $('#audview').onclick = () => {const q = audienceLocal(); if (!q || !map) return;
    const c = toWorld((all.x0 + all.x1) / 2, (all.y0 + all.y1) / 2, 0), dx = c[0] - q[0], dy = c[1] - q[1], dist = Math.max(5, Math.hypot(dx, dy));
    const eyeZ = ((site.audience.ground ?? site.ground) - site.ground) + 1.7, top = site.height + all.z1 - eyeZ;
    aud = {x: q[0], y: q[1], z: eyeZ, dist, heading: (Math.atan2(dx, dy) / R + 360) % 360, fov: Math.max(40, Math.min(80, 2 * Math.atan2(top, dist) / R * 1.12)), settle: 0};
    audApply(true); $('#pad').hidden = false; document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', 'false')); msg('Audience view: what people see from where they stand.');};
  document.querySelectorAll('[data-pad]').forEach(b => {const act = () => {const k = b.dataset.pad; if (k === 'exit') {view('3d'); return;}
      ({left: () => audMove(-2, 0, 0), right: () => audMove(2, 0, 0), up: () => audMove(0, 1, 0), down: () => audMove(0, -1, 0), tl: () => audMove(0, 0, -3), tr: () => audMove(0, 0, 3)})[k]?.();};
    let timer = null; b.onpointerdown = e => {e.preventDefault(); act(); clearInterval(timer); timer = setInterval(act, 90);}; const stop = () => {clearInterval(timer);}; b.onpointerup = stop; b.onpointerleave = stop; b.onpointercancel = stop;});
  addEventListener('keydown', e => {if (/INPUT|SELECT/.test(e.target.tagName)) return;
    if (aud && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {e.preventDefault(); ({ArrowLeft: () => audMove(-2, 0, 0), ArrowRight: () => audMove(2, 0, 0), ArrowUp: () => audMove(0, 1, 0), ArrowDown: () => audMove(0, -1, 0)})[e.key](); return;}
    if (e.key === ' ') {e.preventDefault(); $('#play').click();}});
  setTimeout(() => {$('#hint').style.opacity = '0';}, 10000);
  (function loop(now) {const dt = Math.min(.25, (now - last) / 1000); last = now;
    if (playing) {t += dt * speed; if (t >= duration) {t = duration; playing = false; $('#play').textContent = '▶';}}
    $('#seek').value = String(Math.round(t / duration * 1000)); $('#time').textContent = fmt(t) + ' / ' + fmt(duration); audKeep(); draw(); requestAnimationFrame(loop);})(performance.now());

  // ---------------- Google 3D map
  if (!info.mapsKey) return fail('The map is not available right now.');
  await new Promise((resolve, reject) => {window.__ssvMaps = resolve; window.gm_authFailure = () => reject(Error('The map could not be opened on this page.'));
    const s = document.createElement('script'); s.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(info.mapsKey) + '&v=weekly&loading=async&callback=__ssvMaps'; s.async = true; s.onerror = () => reject(Error('Could not load the map.')); document.head.append(s);});
  const lib = await google.maps.importLibrary('maps3d');
  const c0 = toWorld((all.x0 + all.x1) / 2, (all.y0 + all.y1) / 2, 0), g0 = toGeo([c0[0], c0[1], site.height + showH]);
  map = new lib.Map3DElement({center: g0, range: showSize * 3 + 200, tilt: 68, heading: (site.rot - 35 + 360) % 360, mode: site.mode || 'SATELLITE', fov: 35});
  $('.ssv-map').append(map); $('#wait').hidden = true;
  const mark = (p, label) => {const m = new lib.Marker3DElement({position: {lat: p.lat, lng: p.lng}, altitudeMode: 'CLAMP_TO_GROUND', label}); map.append(m);};
  mark(site, 'SHOW'); if (site.audience) mark(site.audience, 'AUDIENCE');
}
addEventListener('hashchange', () => location.reload());
start().catch(error => fail(error?.message || 'This show could not be opened.'));
