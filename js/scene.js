// Visual: lago congelado ao entardecer, cercado de montanhas e pinheiros, com uma pista de curling
// oficial no meio (gelo com reflexo, casas pintadas, linhas), varal de luzinhas, arquibancada
// com plateia, cabana e placar de madeira. As pedras de granito são desenhadas por instâncias.
// Coordenadas: a pista (x, y) da física vira o mundo (x, 0, -y); o gelo fica em y = 0.
import * as THREE from '../vendor/three/three.module.js';
import { SHEET, STONE_R } from './physics.js';

export const HOUSE_LAYER = 1; // o que a câmera de cima da casa (telão) enxerga
const T = SHEET.tee;
const LEN = SHEET.farEnd - SHEET.nearEnd;
const MID = (SHEET.farEnd + SHEET.nearEnd) / 2;

// ---------- Utilidades ----------
function rnd(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }
function canvasTex(w, h, draw, { repeat = [1, 1], srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 8;
  return t;
}
// Junta várias geometrias numa só (posição, normal, uv e cor). Menos chamadas de desenho no Quest.
export function merge(geos) {
  const parts = geos.map(g => (g.index ? g.toNonIndexed() : g));
  let n = 0;
  for (const g of parts) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = new Float32Array(n * 3);
  let o = 0;
  for (const g of parts) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    if (!g.attributes.normal) g.computeVertexNormals();
    nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    if (g.attributes.color) col.set(g.attributes.color.array, o * 3);
    else col.fill(1, o * 3, (o + c) * 3);
    o += c;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}
function tint(g, color) {
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
const at = (g, x, y, z, ry = 0) => { if (ry) g.rotateY(ry); g.translate(x, y, z); return g; };

// ---------- Texturas ----------
const iceTex = () => canvasTex(512, 512, (g, w, h) => {
  const r = rnd(17);
  g.fillStyle = '#eef5fa'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 9000; i++) {   // o "pebble": gotinhas congeladas
    const v = 225 + r() * 30;
    g.fillStyle = `rgba(${v - 12},${v - 4},${v},${0.25 + r() * 0.35})`;
    g.beginPath(); g.arc(r() * w, r() * h, 0.6 + r() * 1.4, 0, Math.PI * 2); g.fill();
  }
  g.strokeStyle = 'rgba(160,190,215,0.18)'; g.lineWidth = 1;
  for (let i = 0; i < 26; i++) {
    const x = r() * w, y = r() * h, a = r() * Math.PI, l = 20 + r() * 80;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
}, { repeat: [2, 19] });

const lakeTex = () => canvasTex(512, 512, (g, w, h) => {
  const r = rnd(5);
  g.fillStyle = '#c9dbe8'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 260; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.35)' : 'rgba(120,160,190,0.18)';
    g.beginPath(); g.ellipse(r() * w, r() * h, 10 + r() * 60, 4 + r() * 20, r() * 3, 0, Math.PI * 2); g.fill();
  }
  g.strokeStyle = 'rgba(90,130,165,0.35)'; g.lineWidth = 1.2;
  for (let i = 0; i < 40; i++) {
    let x = r() * w, y = r() * h;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 60; y += (r() - 0.5) * 60; g.lineTo(x, y); }
    g.stroke();
  }
}, { repeat: [24, 24] });

const houseTex = () => canvasTex(1024, 1024, (g, w) => {
  const c = w / 2, k = (c - 4) / SHEET.r12;
  const ring = (r, color) => { g.fillStyle = color; g.beginPath(); g.arc(c, c, r * k, 0, Math.PI * 2); g.fill(); };
  ring(SHEET.r12, '#1b58b0');
  ring(SHEET.r8, '#f4f8fb');
  ring(SHEET.r4, '#c41f2e');
  ring(SHEET.button, '#f4f8fb');
  g.strokeStyle = 'rgba(20,40,70,0.5)'; g.lineWidth = 3;
  for (const r of [SHEET.r12, SHEET.r8, SHEET.r4, SHEET.button]) { g.beginPath(); g.arc(c, c, r * k, 0, Math.PI * 2); g.stroke(); }
});

function graniteTex(seed) {
  return canvasTex(512, 128, (g, w, h) => {
    const r = rnd(seed);
    g.fillStyle = '#8a8d94'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 6000; i++) {
      const t = r();
      g.fillStyle = t < 0.45 ? `rgba(40,42,48,${0.5 + r() * 0.5})` : t < 0.8 ? `rgba(200,200,205,${0.4 + r() * 0.5})` : `rgba(150,110,100,${0.4 + r() * 0.4})`;
      g.fillRect(r() * w, r() * h, 1 + r() * 2.5, 1 + r() * 2.5);
    }
    // faixa de batida (a parte mais larga, sem polimento) e o topo polido
    g.fillStyle = 'rgba(210,210,215,0.35)'; g.fillRect(0, h * 0.44, w, h * 0.16);
    g.fillStyle = 'rgba(30,30,36,0.25)'; g.fillRect(0, h * 0.75, w, h * 0.25);
  });
}

const woodTex = (base = '#7a4a26', dark = '#3a2010', seed = 9, rep = [1, 1]) => canvasTex(256, 256, (g, w, h) => {
  const r = rnd(seed);
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) {
    const y = r() * h;
    g.strokeStyle = dark; g.globalAlpha = 0.06 + r() * 0.2; g.lineWidth = 1 + r() * 3;
    g.beginPath(); g.moveTo(0, y);
    for (let x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin(x * 0.03 + i) * 3);
    g.stroke();
  }
  g.globalAlpha = 1;
}, { repeat: rep });

// ---------- Céu ----------
function skyMesh() {
  const geo = new THREE.SphereGeometry(500, 32, 16);
  const p = geo.attributes.position;
  const col = new Float32Array(p.count * 3);
  const top = new THREE.Color('#0d1b3d'), mid = new THREE.Color('#4a5a9a'), low = new THREE.Color('#f0a070'), glow = new THREE.Color('#ffd49a');
  const sunDir = new THREE.Vector3(0.35, 0.08, -1).normalize();
  const c = new THREE.Color(), v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i), p.getZ(i)).normalize();
    const hgt = Math.max(0, v.y);
    if (hgt < 0.12) c.copy(low).lerp(mid, hgt / 0.12);
    else c.copy(mid).lerp(top, Math.min(1, (hgt - 0.12) / 0.5));
    const s = Math.max(0, v.dot(sunDir));
    c.lerp(glow, Math.pow(s, 12) * 0.8);
    if (v.y < 0) c.copy(low).multiplyScalar(0.8);
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  m.renderOrder = -10;
  return m;
}

// ---------- Montanhas e pinheiros ----------
function mountains() {
  const r = rnd(31);
  const geos = [];
  const rock = new THREE.Color('#3b4766'), rock2 = new THREE.Color('#58617f'), snow = new THREE.Color('#e8eef8');
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + r() * 0.2;
    const dist = 230 + r() * 120;
    const hgt = 50 + r() * 90, rad = 60 + r() * 70;
    const g = new THREE.ConeGeometry(rad, hgt, 7 + Math.floor(r() * 4), 4);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {    // deixa o pico irregular
      const y = p.getY(k);
      if (y > -hgt / 2 + 1 && y < hgt / 2 - 0.1) { p.setX(k, p.getX(k) * (0.85 + r() * 0.3)); p.setZ(k, p.getZ(k) * (0.85 + r() * 0.3)); p.setY(k, y + (r() - 0.5) * hgt * 0.08); }
    }
    const ng = g.toNonIndexed();
    const pp = ng.attributes.position;
    const col = new Float32Array(pp.count * 3);
    const c = new THREE.Color();
    for (let k = 0; k < pp.count; k += 3) {
      const y = (pp.getY(k) + pp.getY(k + 1) + pp.getY(k + 2)) / 3;
      const f = (y + hgt / 2) / hgt;
      c.copy(f > 0.62 + r() * 0.08 ? snow : (r() < 0.5 ? rock : rock2));
      for (let j = 0; j < 3; j++) col.set([c.r, c.g, c.b], (k + j) * 3);
    }
    ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
    ng.computeVertexNormals();
    ng.translate(Math.sin(a) * dist, hgt / 2 - 4, -MID - Math.cos(a) * dist);
    geos.push(ng);
  }
  return new THREE.Mesh(merge(geos), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
}

function pines() {
  const tree = merge([
    tint(at(new THREE.CylinderGeometry(0.18, 0.25, 1.4, 6), 0, 0.7, 0), '#4a3020'),
    tint(at(new THREE.ConeGeometry(1.6, 2.6, 7), 0, 2.4, 0), '#1f4a3a'),
    tint(at(new THREE.ConeGeometry(1.25, 2.2, 7), 0, 3.6, 0), '#245440'),
    tint(at(new THREE.ConeGeometry(0.85, 1.8, 7), 0, 4.7, 0), '#2a5e48'),
    tint(at(new THREE.ConeGeometry(0.55, 0.7, 7), 0, 5.2, 0), '#e8f0f6'),
  ]);
  const r = rnd(77);
  const N = 170;
  const mesh = new THREE.InstancedMesh(tree, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), N);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  let k = 0;
  while (k < N) {
    const a = r() * Math.PI * 2, d = 70 + r() * 110;
    const x = Math.sin(a) * d, z = -MID - Math.cos(a) * d * 1.2;
    const sc = 1.6 + r() * 2.2;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6);
    m.compose(p.set(x, 0, z), q, s.set(sc, sc * (0.8 + r() * 0.5), sc));
    mesh.setMatrixAt(k++, m);
  }
  return mesh;
}

// ---------- Pedras ----------
function stoneGeometry() {
  const prof = [[0, 0], [0.055, 0], [0.062, 0.004], [0.1, 0.013], [0.13, 0.028], [0.143, 0.045], [STONE_R, 0.057], [0.143, 0.07], [0.132, 0.087], [0.105, 0.103], [0.07, 0.111], [0, 0.114]];
  return new THREE.LatheGeometry(prof.map(([r, h]) => new THREE.Vector2(r, h)), 40);
}
function handleGeometry() {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.112, 0.035), new THREE.Vector3(0, 0.15, 0.03), new THREE.Vector3(0, 0.168, -0.02), new THREE.Vector3(0, 0.168, -0.12),
  ]);
  return merge([
    new THREE.TubeGeometry(curve, 16, 0.017, 10, false),
    at(new THREE.SphereGeometry(0.017, 10, 8), 0, 0.168, -0.12),
    at(new THREE.CylinderGeometry(0.058, 0.064, 0.012, 24), 0, 0.118, 0),
  ]);
}

function makeStones(scene, envMap) {
  const MAX = 24;
  const body = stoneGeometry(), handle = handleGeometry();
  const granite = new THREE.MeshStandardMaterial({ map: graniteTex(41), roughness: 0.32, metalness: 0.05, envMapIntensity: 0.8 });
  const colors = [0xd8262e, 0xf2c21a];
  const handleMats = colors.map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, metalness: 0.05 }));
  const mk = (geo, mat, mirror) => {
    const m = new THREE.InstancedMesh(geo, mat, MAX);
    m.count = 0;
    m.frustumCulled = false;
    if (mirror) m.scale.y = -1; else m.layers.enable(HOUSE_LAYER);
    scene.add(m);
    return m;
  };
  const real = { body: mk(body, granite, false), h: handleMats.map(hm => mk(handle, hm, false)) };
  const refl = { body: mk(body, granite, true), h: handleMats.map(hm => mk(handle, hm, true)) };
  // sombrinha de contato embaixo de cada pedra
  const shadowTex = canvasTex(128, 128, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  });
  const shadowGeo = new THREE.PlaneGeometry(0.44, 0.44).rotateX(-Math.PI / 2);
  const shadow = new THREE.InstancedMesh(shadowGeo, new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }), MAX);
  shadow.count = 0; shadow.frustumCulled = false; shadow.renderOrder = 3; shadow.layers.enable(HOUSE_LAYER);
  scene.add(shadow);

  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), sc = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  // list: [{ team, x, y, ang, scale, lift }] em coordenadas da pista
  function update(list) {
    const n = Math.min(MAX, list.length);
    const counts = [0, 0];
    for (let i = 0; i < n; i++) {
      const s = list[i];
      q.setFromAxisAngle(UP, -(s.ang || 0));
      sc.copy(one).multiplyScalar(s.scale ?? 1);
      m.compose(p.set(s.x, s.lift || 0, -s.y), q, sc);
      real.body.setMatrixAt(i, m); refl.body.setMatrixAt(i, m);
      const hm = real.h[s.team], rm = refl.h[s.team], k = counts[s.team]++;
      hm.setMatrixAt(k, m); rm.setMatrixAt(k, m);
      m.compose(p.set(s.x, 0.003, -s.y), q, sc);
      shadow.setMatrixAt(i, m);
    }
    for (const mesh of [real.body, refl.body, shadow]) { mesh.count = n; mesh.instanceMatrix.needsUpdate = true; }
    for (let t = 0; t < 2; t++) for (const mesh of [real.h[t], refl.h[t]]) { mesh.count = counts[t]; mesh.instanceMatrix.needsUpdate = true; }
  }
  return { update, granite };
}

// ---------- Placar de madeira ----------
export function makeScoreboard() {
  const W = 1024, H = 512;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const wood = document.createElement('canvas');
  wood.width = W; wood.height = H;
  {
    const w = wood.getContext('2d'), r = rnd(23);
    for (let i = 0; i < 6; i++) {         // tábuas
      const y = i * H / 6;
      w.fillStyle = ['#6b3f1f', '#744524', '#61391b'][i % 3]; w.fillRect(0, y, W, H / 6);
      for (let k = 0; k < 30; k++) {
        const yy = y + r() * H / 6;
        w.strokeStyle = `rgba(40,20,8,${0.08 + r() * 0.2})`; w.lineWidth = 1 + r() * 2;
        w.beginPath(); w.moveTo(0, yy); for (let x = 0; x <= W; x += 32) w.lineTo(x, yy + Math.sin(x * 0.01 + k) * 2); w.stroke();
      }
      w.fillStyle = 'rgba(20,10,4,0.55)'; w.fillRect(0, y, W, 3);
    }
    w.fillStyle = '#3a2210'; for (const [x, y] of [[24, 24], [W - 24, 24], [24, H - 24], [W - 24, H - 24]]) { w.beginPath(); w.arc(x, y, 9, 0, Math.PI * 2); w.fill(); }
  }
  let last = '';
  function draw(d) {
    const key = JSON.stringify(d);
    if (key === last) return;
    last = key;
    g.drawImage(wood, 0, 0);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#f6e7c8'; g.font = 'bold 46px Georgia, serif';
    g.fillText(d.title || 'Pedra no Gelo', W / 2, 52);
    const ends = Math.max(4, d.scores[0].length, d.ends || 4);
    const x0 = 330, cw = Math.min(110, (W - x0 - 150) / ends);
    g.font = 'bold 30px Georgia, serif'; g.fillStyle = '#e8c88a';
    for (let e = 0; e < ends; e++) g.fillText(e < 4 ? String(e + 1) : 'E', x0 + cw * (e + 0.5), 125);
    g.fillText('Total', W - 85, 125);
    const rows = [{ y: 220, color: '#e8323a' }, { y: 330, color: '#f4c430' }];
    rows.forEach((row, t) => {
      g.fillStyle = row.color; g.beginPath(); g.arc(52, row.y, 20, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#f6e7c8'; g.font = 'bold 36px Georgia, serif'; g.textAlign = 'left';
      g.fillText(d.names[t], 84, row.y);
      if (d.hammer === t) { g.font = '30px serif'; g.fillText('🔨', 84 + g.measureText(d.names[t]).width + 14, row.y); g.font = 'bold 36px Georgia, serif'; }
      g.textAlign = 'center';
      for (let e = 0; e < ends; e++) {
        g.fillStyle = 'rgba(20,10,4,0.45)'; g.fillRect(x0 + cw * e + 6, row.y - 40, cw - 12, 80);
        const v = d.scores[t][e];
        g.fillStyle = e === d.end ? '#fff3c0' : '#f6e7c8';
        g.font = 'bold 48px Georgia, serif';
        g.fillText(v == null ? (e === d.end ? '·' : '') : String(v), x0 + cw * (e + 0.5), row.y + 2);
      }
      g.fillStyle = 'rgba(20,10,4,0.6)'; g.fillRect(W - 140, row.y - 44, 110, 88);
      g.fillStyle = '#ffd56a'; g.font = 'bold 58px Georgia, serif';
      g.fillText(String(d.scores[t].reduce((a, b) => a + b, 0)), W - 85, row.y + 2);
      // pedras que faltam neste end
      for (let k = 0; k < (d.left?.[t] ?? 0); k++) { g.fillStyle = row.color; g.beginPath(); g.arc(x0 - 40 - k * 26, row.y + 34, 9, 0, Math.PI * 2); g.fill(); }
    });
    g.fillStyle = '#e8c88a'; g.font = 'italic 28px Georgia, serif';
    g.fillText(d.footer || '', W / 2, 440);
    tex.needsUpdate = true;
  }
  const frameMat = new THREE.MeshLambertMaterial({ map: woodTex('#4a2a14', '#1e0e04', 3) });
  const faceMat = new THREE.MeshBasicMaterial({ map: tex });
  function makeMesh(width) {
    const grp = new THREE.Group();
    const h = width / 2;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(width, h), faceMat);
    face.position.z = 0.051;
    const back = new THREE.Mesh(new THREE.BoxGeometry(width + 0.12, h + 0.12, 0.1), frameMat);
    const legs = new THREE.Mesh(merge([
      at(new THREE.BoxGeometry(0.1, 2.5, 0.1), -width * 0.4, -h / 2 - 1.25 + 0.06, -0.06),
      at(new THREE.BoxGeometry(0.1, 2.5, 0.1), width * 0.4, -h / 2 - 1.25 + 0.06, -0.06),
    ]), frameMat);
    grp.add(back, face, legs);
    return grp;
  }
  return { draw, makeMesh, tex };
}

// ---------- Mundo ----------
export function buildWorld(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#7a6f9a');
  scene.fog = new THREE.Fog('#b89aa8', 120, 520);

  // Reflexo do céu: uma cena só com o céu e as luzinhas, processada uma vez pelo PMREM.
  const envScene = new THREE.Scene();
  envScene.add(skyMesh());
  const bulbEnv = new THREE.MeshBasicMaterial({ color: 0xffc070 });
  for (let i = 0; i < 12; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(4, 8, 6), bulbEnv); b.position.set((i % 2 ? 1 : -1) * 30, 18, -i * 30 + 150); envScene.add(b); }
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromScene(envScene, 0.02).texture;
  scene.environment = envMap;

  scene.add(skyMesh());
  const hemi = new THREE.HemisphereLight(0xbfd4ff, 0xe8d8d0, 1.5);
  const sun = new THREE.DirectionalLight(0xffc08a, 1.6);
  sun.position.set(40, 30, -120);
  for (const l of [hemi, sun]) { l.layers.enable(HOUSE_LAYER); scene.add(l); }
  scene.add(sun.target);

  // Lago e montanhas
  const lake = new THREE.Mesh(new THREE.CircleGeometry(420, 48).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: lakeTex() }));
  lake.position.set(0, -0.06, -MID);
  scene.add(lake, mountains(), pines());

  // Pista: gelo transparente por cima da pintura branca; no meio, as pedras espelhadas (reflexo)
  const sheetW = SHEET.half * 2;
  const base = new THREE.Mesh(new THREE.PlaneGeometry(sheetW, LEN).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xc4d2dc }));
  base.position.set(0, -0.32, -MID);
  const iceMat = new THREE.MeshStandardMaterial({ map: iceTex(), color: 0xffffff, roughness: 0.07, metalness: 0, transparent: true, opacity: 0.66, envMapIntensity: 1.1 });
  const ice = new THREE.Mesh(new THREE.PlaneGeometry(sheetW, LEN).rotateX(-Math.PI / 2), iceMat);
  ice.position.set(0, 0, -MID);
  ice.renderOrder = 1;
  ice.layers.enable(HOUSE_LAYER);
  scene.add(base, ice);

  // Casas e linhas (pintadas debaixo do gelo: ficam semitransparentes)
  const hTex = houseTex();
  const houseMat = new THREE.MeshBasicMaterial({ map: hTex, transparent: true, opacity: 0.86, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
  for (const y of [0, T]) {
    const h = new THREE.Mesh(new THREE.CircleGeometry(SHEET.r12, 64).rotateX(-Math.PI / 2), houseMat);
    h.position.set(0, 0.001, -y);
    h.renderOrder = 2;
    h.layers.enable(HOUSE_LAYER);
    scene.add(h);
  }
  const line = (x0, x1, y0, y1) => new THREE.PlaneGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0)).rotateX(-Math.PI / 2).translate((x0 + x1) / 2, 0.002, -(y0 + y1) / 2);
  const thin = 0.013;
  const dark = merge([
    line(-thin, thin, SHEET.hack, T - SHEET.hack), // linha do meio
    ...[0, T].map(y => line(-SHEET.half, SHEET.half, y - thin, y + thin)),            // tee
    ...[SHEET.nearBack, SHEET.farBack].map(y => line(-SHEET.half, SHEET.half, y - thin, y + thin)), // fundo
  ]);
  const hogs = merge([SHEET.nearHog, SHEET.farHog].map(y => line(-SHEET.half, SHEET.half, y - 0.05, y + 0.05)));
  const lineMatDark = new THREE.MeshBasicMaterial({ color: 0x1a2a40, transparent: true, opacity: 0.75, depthWrite: false });
  const lineMatHog = new THREE.MeshBasicMaterial({ color: 0xb01e2a, transparent: true, opacity: 0.8, depthWrite: false });
  for (const [g, m] of [[dark, lineMatDark], [hogs, lineMatHog]]) {
    const mesh = new THREE.Mesh(g, m); mesh.renderOrder = 2; mesh.layers.enable(HOUSE_LAYER); scene.add(mesh);
  }
  // apoios (hacks) de borracha
  const hacks = merge([0, T].flatMap(y => {
    const yy = y === 0 ? SHEET.hack : T - SHEET.hack;
    return [-0.09, 0.09].map(x => at(new THREE.BoxGeometry(0.1, 0.03, 0.2), x, 0.015, -yy));
  }));
  scene.add(new THREE.Mesh(hacks, new THREE.MeshStandardMaterial({ color: 0x202020, roughness: 0.8 })));

  // Tabelas laterais e do fundo (madeira), montes de neve
  const boardMat = new THREE.MeshLambertMaterial({ map: woodTex('#8a5a32', '#40220e', 13, [12, 1]) });
  const boards = merge([
    at(new THREE.BoxGeometry(0.08, 0.16, LEN), -SHEET.half - 0.04, 0.08, -MID),
    at(new THREE.BoxGeometry(0.08, 0.16, LEN), SHEET.half + 0.04, 0.08, -MID),
    at(new THREE.BoxGeometry(sheetW + 0.16, 0.25, 0.1), 0, 0.125, -SHEET.nearEnd + 0.05),
    at(new THREE.BoxGeometry(sheetW + 0.16, 0.25, 0.1), 0, 0.125, -SHEET.farEnd - 0.05),
  ]);
  const boardMesh = new THREE.Mesh(boards, boardMat);
  boardMesh.layers.enable(HOUSE_LAYER);
  scene.add(boardMesh);
  const snowMat = new THREE.MeshLambertMaterial({ color: 0xf2f6fb });
  const snow = [];
  const rs = rnd(91);
  for (let z = SHEET.nearEnd; z < SHEET.farEnd; z += 2.2) for (const side of [-1, 1]) {
    const g = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    g.scale(0.55 + rs() * 0.35, 0.22 + rs() * 0.18, 1.3 + rs() * 0.5);
    snow.push(at(g, side * (SHEET.half + 1.35 + rs() * 0.5), 0, -z));
  }
  scene.add(new THREE.Mesh(merge(snow), snowMat));

  // Varal de luzinhas: postes de madeira, fio e lâmpadas (as lâmpadas também refletem no gelo)
  const poleGeos = [], wire = [], bulbs = [];
  for (let z = SHEET.nearEnd + 1; z <= SHEET.farEnd; z += 6) for (const side of [-1, 1]) {
    poleGeos.push(at(new THREE.CylinderGeometry(0.06, 0.08, 3.2, 6), side * (SHEET.half + 0.6), 1.6, -z));
  }
  for (const side of [-1, 1]) {
    for (let z = SHEET.nearEnd + 1; z < SHEET.farEnd - 5; z += 6) {
      for (let k = 0; k <= 12; k++) {
        const f = k / 12, zz = z + f * 6, sag = 3.1 - Math.sin(f * Math.PI) * 0.45;
        wire.push(new THREE.Vector3(side * (SHEET.half + 0.6), sag, -zz));
        if (k % 2 === 1) bulbs.push([side * (SHEET.half + 0.6), sag - 0.06, -zz]);
      }
    }
  }
  const poleMesh = new THREE.Mesh(merge(poleGeos), new THREE.MeshLambertMaterial({ color: 0x5a3a22 }));
  const wireLine = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(wire.flatMap((p, i) => (i % 13 === 12 ? [] : [p, wire[i + 1]]))), new THREE.LineBasicMaterial({ color: 0x222222 }));
  const bulbGeo = new THREE.SphereGeometry(0.045, 8, 6);
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd28a });
  const mkBulbs = (mirror) => {
    const im = new THREE.InstancedMesh(bulbGeo, bulbMat, bulbs.length);
    const mm = new THREE.Matrix4();
    const cols = [0xffd28a, 0xff9a6a, 0x9ad8ff, 0xfff0c0];
    bulbs.forEach((b, i) => { mm.makeTranslation(...b); im.setMatrixAt(i, mm); im.setColorAt(i, new THREE.Color(cols[i % 4])); });
    if (mirror) im.scale.y = -1;
    return im;
  };
  scene.add(poleMesh, wireLine, mkBulbs(false), mkBulbs(true));

  // Arquibancada com plateia (lado esquerdo, perto da casa de longe) e cabana perto do apoio
  const benchMat = new THREE.MeshLambertMaterial({ map: woodTex('#9a6a3a', '#4a2a10', 5, [4, 1]) });
  const benches = [];
  const crowd = [];
  const rc = rnd(55);
  for (let row = 0; row < 4; row++) {
    const x = -SHEET.half - 3.2 - row * 0.9, y = 0.45 + row * 0.5;
    benches.push(at(new THREE.BoxGeometry(0.8, 0.12, 22), x, y, -(T - 6)));
    benches.push(at(new THREE.BoxGeometry(0.8, y, 22), x, y / 2, -(T - 6)));
    for (let z = T - 16.5; z < T + 4.5; z += 0.55) if (rc() < 0.72) crowd.push([x, y + 0.06, -z]);
  }
  scene.add(new THREE.Mesh(merge(benches), benchMat));
  const body = merge([
    at(new THREE.CapsuleGeometry(0.2, 0.42, 3, 8), 0, 0.42, 0),
    at(new THREE.ConeGeometry(0.15, 0.2, 8), 0, 1.15, 0),
  ]);
  const crowdMesh = new THREE.InstancedMesh(body, new THREE.MeshLambertMaterial({ vertexColors: true }), crowd.length);
  const headMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.14, 10, 8).translate(0, 0.98, 0), new THREE.MeshLambertMaterial({ color: 0xe8c0a0 }), crowd.length);
  const coats = ['#c0392b', '#2e6fb0', '#2f8a5a', '#e0a020', '#7a3fa0', '#d06080', '#3a3a48', '#e8e8e8'];
  const mm = new THREE.Matrix4(), qq = new THREE.Quaternion(), ss = new THREE.Vector3(), pp = new THREE.Vector3();
  const crowdBase = [];
  crowd.forEach((c, i) => {
    qq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2 + (rc() - 0.5) * 0.6);
    mm.compose(pp.set(...c), qq, ss.setScalar(0.9 + rc() * 0.2));
    crowdMesh.setMatrixAt(i, mm);
    headMesh.setMatrixAt(i, mm);
    crowdMesh.setColorAt(i, new THREE.Color(coats[Math.floor(rc() * coats.length)]));
    crowdBase.push(mm.clone());
  });
  scene.add(crowdMesh, headMesh);

  // Cabana de aquecimento
  const cabinWood = new THREE.MeshLambertMaterial({ map: woodTex('#6a3e1e', '#2e160a', 21, [3, 2]) });
  const cabin = new THREE.Group();
  const walls = new THREE.Mesh(new THREE.BoxGeometry(4, 2.6, 3.2), cabinWood);
  walls.position.y = 1.3;
  const roofShape = new THREE.Shape([new THREE.Vector2(-2.4, 0), new THREE.Vector2(2.4, 0), new THREE.Vector2(0, 1.6)]);
  const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(roofShape, { depth: 3.6, bevelEnabled: false }).translate(0, 0, -1.8), new THREE.MeshLambertMaterial({ color: 0x4a2e22 }));
  roof.position.y = 2.6;
  const roofSnow = new THREE.Mesh(new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(-2.5, 0.05), new THREE.Vector2(2.5, 0.05), new THREE.Vector2(0, 1.72)]), { depth: 3.7, bevelEnabled: false }).translate(0, 0, -1.85), snowMat);
  roofSnow.position.y = 2.66; roofSnow.scale.set(0.98, 0.96, 1);
  const win = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.8), new THREE.MeshBasicMaterial({ color: 0xffb060 }));
  win.position.set(2.01, 1.5, 0); win.rotation.y = Math.PI / 2;
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.6, 0.5), new THREE.MeshLambertMaterial({ color: 0x6a6a70 }));
  chimney.position.set(-1, 3.6, 0.6);
  cabin.add(walls, roof, roofSnow, win, chimney);
  cabin.position.set(-SHEET.half - 6.5, 0, -(SHEET.nearEnd + 2));
  scene.add(cabin);

  const stones = makeStones(scene, envMap);
  const scoreboard = makeScoreboard();
  const sbNear = scoreboard.makeMesh(2.0);
  sbNear.position.set(-SHEET.half - 1.6, 2.4, -2.5);
  sbNear.rotation.y = 0.75;
  const sbFar = scoreboard.makeMesh(3.0);
  sbFar.position.set(0, 3.0, -(SHEET.farEnd + 1.8));
  scene.add(sbNear, sbFar);

  // Plateia mexendo (comemoração): sobe e desce
  let cheer = 0;
  function animate(dt, time) {
    cheer = Math.max(0, cheer - dt * 0.6);
    if (cheer <= 0.001 && crowdMesh.userData.still) return;
    crowdMesh.userData.still = cheer <= 0.001;
    for (let i = 0; i < crowdBase.length; i++) {
      mm.copy(crowdBase[i]);
      const j = Math.max(0, Math.sin(time * 9 + i * 1.7)) * 0.12 * cheer;
      mm.elements[13] += j;
      crowdMesh.setMatrixAt(i, mm);
      headMesh.setMatrixAt(i, mm);
    }
    crowdMesh.instanceMatrix.needsUpdate = true;
    headMesh.instanceMatrix.needsUpdate = true;
  }
  return { scene, stones, scoreboard, envMap, animate, cheer: (v) => { cheer = Math.min(1, Math.max(cheer, v)); crowdMesh.userData.still = false; } };
}

// ---------- Vassoura ----------
// Cabo (ao longo de +z, comprimento 1; escalar em z) e cabeça separada, que deita no gelo.
const shaftGeo = new THREE.CylinderGeometry(0.014, 0.014, 1, 8).translate(0, 0.5, 0).rotateX(Math.PI / 2);
const shaftMat = new THREE.MeshStandardMaterial({ color: 0x1c1c22, roughness: 0.4, metalness: 0.6 });
const padMat = new THREE.MeshStandardMaterial({ color: 0x1b2f6a, roughness: 0.9 });
const topMats = [new THREE.MeshStandardMaterial({ color: 0xd8262e, roughness: 0.6 }), new THREE.MeshStandardMaterial({ color: 0xf2c21a, roughness: 0.6 })];
export function makeBroom(team = 0) {
  const shaft = new THREE.Mesh(shaftGeo, shaftMat);
  const head = new THREE.Group();
  const pad = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.03, 0.12), padMat);
  pad.position.y = 0.015;
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.025, 0.09), topMats[team]);
  top.position.y = 0.042;
  head.add(pad, top);
  shaft.visible = head.visible = false;
  return { shaft, head };
}
