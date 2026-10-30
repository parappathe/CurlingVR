// Liga a física, as regras e a IA à tela, ao Quest (controles) e ao mouse/teclado.
import * as THREE from '../vendor/three/three.module.js';
import { SHEET, STONE_R, DT, RELEASE, SPIN_NOM, distToButton, inHouse, speedOf } from './physics.js';
import { Match, scoreEnd, PLAYER, CPU } from './match.js';
import { OPPONENTS, ROBOT, rng, chooseShotGen, execute, sweepDecision, matchContext, speedForDistance } from './ai.js';
import { CHALLENGES, setupChallenge, bestChallengeShotGen } from './challenges.js';
import { buildWorld, makeBroom, HOUSE_LAYER } from './scene.js';
import { Panel, Label } from './ui.js';
import { Sfx } from './audio.js';
import { loadSave, storeSave } from './save.js';

const save = loadSave();
const sfx = new Sfx();
sfx.on = save.sound;
const IS_QUEST = /OculusBrowser|Quest/i.test(navigator.userAgent);
const T = SHEET.tee;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const damp = (k, dt) => 1 - Math.exp(-k * dt);

// No VR: a velocidade da pedra é a da mão vezes isto (no curling de verdade o corpo inteiro
// desliza junto a partir do apoio; aqui o empurrão fica só no braço).
const HAND_GAIN = 2.0;
const VR_STAND = { x: 0.3, y: 0.0 };           // onde a cabeça fica para lançar (olhando a pista)
const VR_SPAWN = { x: 0, y: 0.85 };            // onde a pedra aparece na frente
const VR_WATCH = { x: 0.95, y: T + 2.9 };      // atrás da casa de longe, olhando de volta (vez do computador)
const BROOM_LEN = 1.3;
const PC_SPEED = { min: 2.8, max: 6.4, curve: 1.8 }; // barra do PC: mais precisão nas velocidades de casa

// ---------- Render e cena ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: !IS_QUEST });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, IS_QUEST ? 1 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFoveation?.(1);
document.getElementById('app').appendChild(renderer.domElement);

const world = buildWorld(renderer);
const { scene } = world;
const rig = new THREE.Group();
scene.add(rig);
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.05, 900);
rig.add(camera);
const UP = new THREE.Vector3(0, 1, 0);
const W3 = (x, y, h = 0) => new THREE.Vector3(x, h, -y);

// Telão: câmera de cima da casa de longe, desenhada numa textura
const houseRT = new THREE.WebGLRenderTarget(288, 540, { samples: IS_QUEST ? 0 : 4 });
const houseCam = new THREE.OrthographicCamera(-2.45, 2.45, 4.6, -4.6, 1, 60);
houseCam.position.set(0, 30, -(T + 0.4));
houseCam.up.set(0, 0, -1);
houseCam.lookAt(0, 0, -(T + 0.4));
houseCam.layers.set(HOUSE_LAYER);
const screenMat = new THREE.MeshBasicMaterial({ map: houseRT.texture });
const telao = new THREE.Group();
{
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 1.03), screenMat);
  face.position.z = 0.021;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.63, 1.11, 0.04), new THREE.MeshLambertMaterial({ color: 0x4a2a14 }));
  const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.0, 0.06), new THREE.MeshLambertMaterial({ color: 0x4a2a14 }));
  leg.position.y = -1.05;
  telao.add(frame, face, leg);
  telao.position.copy(W3(1.55, 1.9, 1.45));
  telao.rotation.y = Math.atan2(VR_STAND.x - 1.55, 1.9 - VR_STAND.y);
  telao.visible = false;
  scene.add(telao);
}
const pcInset = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: houseRT.texture, depthTest: false, transparent: true }));
pcInset.renderOrder = 9;
camera.add(pcInset);

const panel = new Panel(0.9);
const fpsLabel = new Label(0.12);
fpsLabel.mesh.position.set(0.16, -0.14, -0.6);
fpsLabel.mesh.visible = false;
camera.add(fpsLabel.mesh);
const statusLabel = new Label(0.5, 1024, 160);
statusLabel.mesh.position.set(0, -0.3, -0.95);
statusLabel.mesh.rotation.x = -0.3;
statusLabel.mesh.visible = false;
camera.add(statusLabel.mesh);

// Vinheta de conforto e escurecer da troca de lugar (presas na câmera)
const vignette = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.45, 'rgba(0,0,0,0)'); gr.addColorStop(0.8, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,1)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
  m.position.z = -0.12; m.renderOrder = 998; m.visible = false;
  camera.add(m);
  return m;
})();
const fader = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 8), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, side: THREE.BackSide, depthTest: false, depthWrite: false }));
fader.renderOrder = 999; fader.visible = false;
camera.add(fader);
const fade = { v: 0, dir: 0, cb: null };
function fadeThen(cb) {
  if (!renderer.xr.isPresenting) { cb(); return; }
  if (fade.dir === 1) { const prev = fade.cb; fade.cb = () => { prev?.(); cb(); }; return; }
  fade.dir = 1; fade.cb = cb;
}
function updateFade(dt) {
  if (fade.dir === 1) {
    fade.v = Math.min(1, fade.v + dt / 0.22);
    if (fade.v >= 1) { const cb = fade.cb; fade.cb = null; fade.dir = -1; cb?.(); }
  } else if (fade.dir === -1) {
    fade.v = Math.max(0, fade.v - dt / 0.3);
    if (fade.v <= 0) fade.dir = 0;
  }
  fader.visible = fade.v > 0.001;
  fader.material.opacity = fade.v;
}

// Mira (risco no gelo), anel da pedra para pegar e poeira de gelo da vassoura
const aimTex = (() => {
  const c = document.createElement('canvas'); c.width = 16; c.height = 64;
  const g = c.getContext('2d'); g.fillStyle = 'rgba(160,220,255,0.9)'; g.fillRect(0, 0, 16, 36);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 60); return t;
})();
const aimLine = new THREE.Mesh(new THREE.PlaneGeometry(0.035, 30).rotateX(-Math.PI / 2).translate(0, 0.004, -15), new THREE.MeshBasicMaterial({ map: aimTex, transparent: true, opacity: 0.7, depthWrite: false }));
aimLine.renderOrder = 4; aimLine.visible = false;
scene.add(aimLine);
const grabRing = new THREE.Mesh(new THREE.RingGeometry(0.19, 0.23, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x9fd6ff, transparent: true, opacity: 0.6, depthWrite: false }));
grabRing.renderOrder = 4; grabRing.visible = false;
scene.add(grabRing);
const DUST = 80;
const dust = { pos: new Float32Array(DUST * 3), vel: new Float32Array(DUST * 3), life: new Float32Array(DUST), next: 0 };
const dustGeo = new THREE.BufferGeometry();
dustGeo.setAttribute('position', new THREE.BufferAttribute(dust.pos, 3));
const dustPts = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.035, transparent: true, opacity: 0.8, depthWrite: false }));
dustPts.frustumCulled = false;
scene.add(dustPts);
function spawnDust(p, n) {
  for (let k = 0; k < n; k++) {
    const i = dust.next = (dust.next + 1) % DUST;
    dust.pos.set([p.x + (Math.random() - 0.5) * 0.25, 0.02, p.z + (Math.random() - 0.5) * 0.12], i * 3);
    dust.vel.set([(Math.random() - 0.5) * 0.6, 0.3 + Math.random() * 0.4, (Math.random() - 0.5) * 0.6], i * 3);
    dust.life[i] = 0.5 + Math.random() * 0.3;
  }
}
function updateDust(dt) {
  for (let i = 0; i < DUST; i++) {
    if (dust.life[i] <= 0) { dust.pos[i * 3 + 1] = -10; continue; }
    dust.life[i] -= dt;
    for (let a = 0; a < 3; a++) dust.pos[i * 3 + a] += dust.vel[i * 3 + a] * dt;
    dust.vel[i * 3 + 1] -= 1.2 * dt;
    if (dust.pos[i * 3 + 1] < 0.01) dust.pos[i * 3 + 1] = 0.01;
  }
  dustGeo.attributes.position.needsUpdate = true;
}

// ---------- Estado do jogo ----------
let app = 'menu';            // 'menu' | 'play' | 'paused'
let mode = 'match';          // 'match' | 'challenge'
let match = null;
let oppIndex = 0, chIndex = 0;
let chStart = [], chThrown = [];
let phase = 'idle';          // 'intro' | 'ready' | 'think' | 'moving' | 'settled' | 'endover' | 'over'
let timer = 0;
let plan = null;             // jogada planejada (da IA ou do robô): usada para varrer
let follow = null;           // pedra que a câmera acompanha
let pending = null;          // pedra do jogador esperando para ser lançada (VR)
let msg = null;              // aviso { text, t }
let sweepS = 0, sweepRaw = 0, aiSweep = 0, aiSweepT = 0;
let outAt = new Map();
let random = rng(Date.now() % 100000);
let time = 0, acc = 0;
let pcSpin = SPIN_NOM;
const opponent = () => OPPONENTS[oppIndex];

const menuStones = [
  { team: 0, x: 0.25, y: T + 0.15, ang: 0.4 }, { team: 1, x: -0.55, y: T - 0.5, ang: 1.2 },
  { team: 0, x: 0.95, y: T + 1.0, ang: 2.2 }, { team: 1, x: 0.15, y: T - 3.4, ang: 0.1 },
  { team: 1, x: -0.9, y: T + 0.9, ang: 3.0 },
];

function newMatch(i) {
  mode = 'match';
  oppIndex = clamp(i, 0, OPPONENTS.length - 1);
  // sorteio: quem fica com o martelo (a última pedra) no primeiro end
  match = new Match({ hammer: random() < 0.5 ? PLAYER : CPU });
  outAt = new Map();
  app = 'play';
  panel.hide();
  msg = { text: match.hammer === PLAYER ? 'Sorteio: você tem o martelo (a última pedra do end).' : `Sorteio: ${opponent().name} tem o martelo. Você começa.`, t: 4 };
  beginTurn();
}

function newChallenge(i, skipIntro = false) {
  mode = 'challenge';
  chIndex = clamp(i, 0, CHALLENGES.length - 1);
  const ch = CHALLENGES[chIndex];
  const set = setupChallenge(ch);
  match = new Match({ solo: true, perTeam: ch.throws, ends: 1 });
  match.stones = set.stones;
  chStart = set.start;
  chThrown = [];
  outAt = new Map();
  app = 'play';
  msg = null;
  if (skipIntro || dev.autoplay) { panel.hide(); beginTurn(); }
  else { phase = 'intro'; placeForPhase(); showScreen('chIntro'); }
}

function beginTurn() {
  plan = null; follow = null; sweepS = sweepRaw = aiSweep = 0;
  timer = 0;
  thinker = null;
  if (match.turnTeam === PLAYER) {
    phase = 'ready';
    pending = { team: PLAYER, x: VR_SPAWN.x, y: VR_SPAWN.y, ang: 0 };
  } else {
    phase = 'think';
    timer = 1.1;
    pending = null;
    startCpuThinking();
  }
  held = null;
  placeForPhase();
  updateHint();
}

// Lugar do jogador (VR) ou da câmera (PC) em cada fase
function placeForPhase() {
  const vr = renderer.xr.isPresenting;
  if (vr) {
    fadeThen(() => {
      if (phase === 'think' || (phase === 'moving' && follow?.team === CPU)) placeRig(VR_WATCH.x, VR_WATCH.y, Math.PI);
      else if (phase === 'moving' && follow) placeRig(follow.x - 0.8, follow.y + 0.25, 0);
      else if (phase === 'settled' || phase === 'endover' || phase === 'over') { if (!rigNearHouse()) placeRig(VR_WATCH.x, VR_WATCH.y, Math.PI); }
      else placeRig(VR_STAND.x, VR_STAND.y, 0);
      if (panel.visible) placePanelVR();
    });
  } else pcCamSnap = true;
}
function rigNearHouse() { camera.getWorldPosition(_v); return -_v.z > T - 8; }

// Põe a cabeça do jogador no ponto (x, y) da pista, olhando para a direção yaw (0 = pista abaixo).
function placeRig(x, y, yaw) {
  const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
  rig.rotation.set(0, yaw - e.y, 0);
  const head = camera.position.clone().setY(0).applyAxisAngle(UP, rig.rotation.y);
  rig.position.set(x - head.x, 0, -y - head.z);
  rig.updateMatrixWorld(true);
}

// Lança. shot: { speed, angle, spin, x, y }
function deliver(shot) {
  const s = match.deliver(shot);
  if (!s) return;
  if (mode === 'challenge') chThrown.push(s);
  pending = null;
  follow = s;
  sfx.release();
  acc = 0;
  if (match.phase === 'settled') { onSettled(); return; }
  phase = 'moving';
  if (renderer.xr.isPresenting && s.team === PLAYER) {
    // segue a pedra a partir de onde o jogador está (sem escurecer: ele acabou de soltar)
  } else if (renderer.xr.isPresenting && s.team === CPU) {
    // já está atrás da casa
  }
  updateHint();
}

// A IA pensa aos poucos (alguns milissegundos por quadro), para a imagem não travar no óculos.
let thinker = null;
function startThinking(gen) { thinker = { gen, result: null, done: false }; }
function pumpThinker(budgetMs = 6) {
  if (!thinker || thinker.done) return;
  const t0 = performance.now();
  do {
    const x = thinker.gen.next();
    if (x.done) { thinker.done = true; thinker.result = x.value; return; }
  } while (performance.now() - t0 < budgetMs);
}
function startCpuThinking() { startThinking(chooseShotGen(match.stones, CPU, matchContext(match), opponent(), random)); }
function startRobotThinking() {
  startThinking(mode === 'challenge'
    ? bestChallengeShotGen(CHALLENGES[chIndex], { stones: match.stones, start: chStart, thrown: chThrown })
    : chooseShotGen(match.stones, PLAYER, matchContext(match), ROBOT, random));
}
function cpuThrow() {
  plan = thinker.result;
  thinker = null;
  deliver(execute(plan, opponent(), random));
  aiSweepT = 0;
}
function robotThrow() {
  const res = thinker.result;
  thinker = null;
  if (mode === 'challenge') { plan = res.shot; deliver({ ...plan }); }
  else { plan = res; deliver(execute(plan, ROBOT, random)); }
  aiSweepT = 0;
}

const teamName = (t) => (t === PLAYER ? 'Você' : opponent().name);
function onSettled() {
  phase = 'settled';
  timer = 2.2;
  const s = follow;
  if (s && match.events.some(e => e.type === 'hogRelease')) {
    msg = { text: 'Queimou a linha de hog: soltou a pedra depois dela. Pedra anulada.', t: 3 };
    sfx.groan();
  } else if (s && match.events.some(e => e.type === 'hog')) {
    msg = { text: 'Não passou da linha de hog do outro lado: pedra fora.', t: 3 };
    sfx.groan();
  } else if (mode === 'match') {
    const sc = scoreEnd(match.stones);
    const knocked = match.stones.filter(o => o.out && o.team !== s.team && (outAt.get(o.id) ?? -1) >= throwStart).length;
    let t = sc.team === -1 ? 'Ninguém na casa.' : `${teamName(sc.team)} ${sc.team === PLAYER ? 'marca' : 'marca'} ${sc.points} agora.`;
    if (knocked) t = `${s.team === PLAYER ? 'Você tirou' : `${opponent().name} tirou`} ${knocked} pedra${knocked > 1 ? 's' : ''}! ` + t;
    msg = { text: t, t: 3 };
    const good = s.team === PLAYER && (knocked || (sc.team === PLAYER && inHouse(s)));
    if (good) { sfx.cheer(0.6 + 0.2 * knocked); world.cheer(0.8); }
    else if (s.team === CPU && (knocked || sc.team === CPU)) sfx.claps(10, 1.2);
  } else {
    const ch = CHALLENGES[chIndex];
    const g = ch.grade({ stones: match.stones, start: chStart, thrown: chThrown });
    msg = { text: match.left(PLAYER) > 1 ? `Por enquanto: ${'★'.repeat(g.stars)}${'☆'.repeat(3 - g.stars)}` : '', t: 2.5 };
  }
  for (const e of match.events) if (e.type === 'hogRelease' || e.type === 'hog') outAt.set(e.id, time);
  match.events = [];
  placeForPhase();
  updateHint();
}

let throwStart = 0;
function afterSettle() {
  match.next();
  throwStart = time;
  if (match.phase === 'aim') { beginTurn(); return; }
  if (mode === 'challenge') { finishChallenge(); return; }
  if (match.phase === 'endover') {
    phase = 'endover';
    timer = 3;
    sfx.horn();
    const e = match.lastEnd;
    if (e.team === PLAYER) { sfx.cheer(1); world.cheer(1); } else if (e.team === CPU) sfx.groan();
    showScreen('endover');
  } else if (match.phase === 'over') finishMatch();
  updateHint();
}

function finishMatch() {
  phase = 'over';
  save.games[oppIndex]++;
  if (match.winner === PLAYER) { save.wins[oppIndex]++; sfx.cheer(1); world.cheer(1); }
  storeSave(save);
  sfx.horn();
  timer = 4;
  showScreen('over');
}

let chResult = null;
function finishChallenge() {
  phase = 'over';
  const ch = CHALLENGES[chIndex];
  chResult = ch.grade({ stones: match.stones, start: chStart, thrown: chThrown });
  const prev = save.ch[chIndex] || 0;
  save.ch[chIndex] = Math.max(prev, chResult.stars);
  storeSave(save);
  for (let k = 0; k < chResult.stars; k++) setTimeout(() => sfx.star(k), 250 * k);
  if (chResult.stars === 3) { sfx.cheer(1); world.cheer(1); }
  timer = 3;
  showScreen('chResult');
}

function nextEnd() {
  match.startNextEnd();
  outAt = new Map();
  panel.hide();
  beginTurn();
}

function goMenu() {
  app = 'menu';
  phase = 'idle';
  match = null;
  pending = null; held = null; follow = null;
  if (renderer.xr.isPresenting) fadeThen(() => { placeRig(VR_STAND.x, VR_STAND.y, 0); placePanelVR(); });
  showScreen('main');
  updateHint();
}

function togglePause() {
  if (app === 'play' && !panel.visible) { app = 'paused'; showScreen('pause'); }
  else if (app === 'paused') { app = 'play'; panel.hide(); }
  updateHint();
}

// ---------- Menus ----------
const challengeUnlocked = (i) => i === 0 || (save.ch[i - 1] || 0) >= 1;
const vinhetaTxt = () => (save.vignette >= 1 ? 'forte' : save.vignette > 0 ? 'fraca' : 'não');
function showScreen(name) {
  const vr = renderer.xr.isPresenting;
  if (vr) placePanelVR();
  panel.show((p) => {
    if (name === 'main') {
      p.title('Pedra no Gelo', 72);
      p.text('Curling no lago congelado. Empurre, dê giro e varra!', 512, 132, { size: 28, color: '#93a9c4' });
      p.button('Partida contra o computador', () => showScreen('opponents'), 212, 180, 600, 92, { size: 36 });
      p.button('Desafios', () => showScreen('challenges'), 212, 288, 600, 80);
      p.button('Como jogar', () => showScreen('help'), 212, 384, 600, 80);
      p.button(`Som: ${save.sound ? 'sim' : 'não'}`, () => { save.sound = !save.sound; sfx.setOn(save.sound); storeSave(save); showScreen('main'); }, 212, 482, 190, 66, { size: 26 });
      p.button(`FPS: ${save.fps ? 'sim' : 'não'}`, () => { save.fps = !save.fps; storeSave(save); showScreen('main'); }, 417, 482, 190, 66, { size: 26 });
      p.button(`Vinheta: ${vinhetaTxt()}`, () => { save.vignette = save.vignette >= 1 ? 0.5 : save.vignette > 0 ? 0 : 1; storeSave(save); showScreen('main'); }, 622, 482, 190, 66, { size: 24 });
      const stars = Object.values(save.ch).reduce((a, b) => a + b, 0);
      p.text(`Vitórias: ${save.wins.reduce((a, b) => a + b, 0)}   ·   Estrelas nos desafios: ${stars} de 30`, 512, 600, { size: 26, color: '#ffd25a' });
      p.text(vr ? 'Aponte com o controle e aperte o gatilho' : 'No Quest: abra esta página no navegador do óculos e aperte "Entrar em VR"', 512, 660, { size: 22, color: '#93a9c4' });
    } else if (name === 'opponents') {
      p.title('Escolha o adversário', 62);
      OPPONENTS.forEach((o, i) => {
        const y = 120 + i * 160;
        p.button(`${o.name}  ·  ${o.title}`, () => newMatch(i), 112, y, 800, 136, { size: 36, sub: `${o.desc}   (vitórias: ${save.wins[i]} de ${save.games[i]})` });
      });
      p.text('4 ends de 4 pedras para cada lado. Empate: um end extra.', 512, 610, { size: 24, color: '#93a9c4' });
      p.button('Voltar', () => showScreen('main'), 362, 640, 300, 62, { size: 28 });
    } else if (name === 'challenges') {
      p.title('Desafios', 56);
      CHALLENGES.forEach((ch, i) => {
        const c = i % 5, r = Math.floor(i / 5);
        p.tile(52 + c * 186, 110 + r * 200, 172, 176, {
          num: i + 1, name: ch.name, stars: save.ch[i] || 0, done: save.ch[i] != null, locked: !challengeUnlocked(i),
          action: () => newChallenge(i),
        });
      });
      p.text('Passe um desafio (1 estrela) para liberar o próximo.', 512, 540, { size: 24, color: '#93a9c4' });
      p.button('Voltar', () => showScreen(app === 'paused' ? 'pause' : 'main'), 362, 600, 300, 70, { size: 30 });
    } else if (name === 'help') {
      p.title('Como jogar', 60);
      const rows = vr ? [
        'Lançar: aperte o botão lateral com a mão perto da pedra.',
        'Ela segue a sua mão no gelo. Empurre para a frente e solte.',
        'A força da mão na hora de soltar é a força da pedra.',
        'Gire o pulso logo antes de soltar: horário curva à direita.',
        'Varrer: o controle vira vassoura. Encoste no gelo na frente',
        'da pedra e esfregue rápido: ela vai mais longe e curva menos.',
        'Gatilho segurado: acelera o tempo.   B ou Y: pausa.',
        'Solte antes da linha de hog. Ganha quem fica mais perto do botão.',
      ] : [
        'Arraste o mouse para trás e solte: quanto mais longe, mais forte.',
        'Arrastar para um lado mira para o outro (como um estilingue).',
        'Rodinha ou Q/E: giro. Horário curva para a direita no fim.',
        'Varrer: segure Espaço (ou mexa o mouse rápido) com a pedra',
        'andando. A pedra vai mais longe e curva menos.',
        'Shift: acelera o tempo.   Esc: pausa.   F: FPS.',
        'Ponto: cada pedra sua mais perto do botão que a melhor deles.',
        'Pedra que não passa da linha de hog do outro lado sai.',
      ];
      rows.forEach((t, i) => p.text(t, 56, 128 + i * 54, { size: 27, align: 'left' }));
      p.button('Voltar', () => showScreen(app === 'paused' ? 'pause' : 'main'), 362, 586, 300, 80);
    } else if (name === 'pause') {
      p.title('Pausa', 66);
      p.text(mode === 'match' ? `Contra ${opponent().name} · End ${match.end + 1} · ${match.total(0)} x ${match.total(1)}` : `Desafio ${chIndex + 1}: ${CHALLENGES[chIndex].name}`, 512, 130, { size: 28, color: '#93a9c4' });
      p.button('Continuar', () => togglePause(), 262, 176, 500, 84);
      p.button(mode === 'match' ? 'Recomeçar a partida' : 'Recomeçar o desafio', () => (mode === 'match' ? newMatch(oppIndex) : newChallenge(chIndex, true)), 262, 276, 500, 84);
      p.button('Como jogar', () => showScreen('help'), 262, 376, 245, 84, { size: 30 });
      p.button('Recentralizar', () => { togglePause(); placeForPhase(); }, 517, 376, 245, 84, { size: 30, locked: !vr });
      p.button('Menu principal', () => goMenu(), 262, 476, 500, 84);
    } else if (name === 'endover') {
      const e = match.lastEnd;
      p.title(`Fim do end ${match.scores[0].length}`, 66);
      p.text(e.team === -1 ? 'End em branco: ninguém marcou.' : `${teamName(e.team)} marc${e.team === PLAYER ? 'ou' : 'ou'} ${e.points} ponto${e.points > 1 ? 's' : ''}.`, 512, 150, { size: 38, bold: true, color: e.team === PLAYER ? '#ff8a7a' : e.team === CPU ? '#ffd34a' : '#eef6ff' });
      p.text(`Placar: Você ${match.total(0)} x ${match.total(1)} ${opponent().name}`, 512, 220, { size: 32 });
      const extra = match.scores[0].length >= match.ends;
      p.text(extra ? 'Empatado! Vai para o end extra.' : `Martelo no próximo end: ${teamName(match.hammer)}`, 512, 276, { size: 26, color: '#93a9c4' });
      p.button(extra ? 'Jogar o end extra' : 'Próximo end', () => nextEnd(), 262, 340, 500, 96, { size: 38 });
      p.button('Menu principal', () => goMenu(), 262, 470, 500, 80);
    } else if (name === 'over') {
      const w = match.winner;
      p.title(w === PLAYER ? 'Você venceu!' : w === CPU ? `${opponent().name} venceu` : 'Empate!', 72);
      p.text(`Você ${match.total(0)} x ${match.total(1)} ${opponent().name}`, 512, 150, { size: 40, bold: true });
      p.text(`Ends: ${match.scores[0].map((v, i) => `${v}-${match.scores[1][i]}`).join('   ')}`, 512, 210, { size: 28, color: '#93a9c4' });
      p.text(`Contra ${opponent().name}: ${save.wins[oppIndex]} vitória(s) em ${save.games[oppIndex]} partida(s)`, 512, 258, { size: 24, color: '#93a9c4' });
      p.button('Jogar de novo', () => newMatch(oppIndex), 262, 310, 500, 92, { size: 36 });
      p.button('Outro adversário', () => showScreen('opponents'), 262, 420, 500, 80);
      p.button('Menu principal', () => goMenu(), 262, 520, 500, 80);
    } else if (name === 'chIntro') {
      const ch = CHALLENGES[chIndex];
      p.title(`Desafio ${chIndex + 1}: ${ch.name}`, 66);
      p.text(ch.desc, 512, 150, { size: 28 });
      p.text(`${ch.throws} pedra${ch.throws > 1 ? 's' : ''} para lançar`, 512, 200, { size: 26, color: '#93a9c4' });
      p.text(ch.goal, 512, 250, { size: 24, color: '#ffd25a' });
      p.button('Começar', () => { panel.hide(); beginTurn(); }, 262, 320, 500, 96, { size: 38 });
      p.button('Desafios', () => showScreen('challenges'), 262, 440, 500, 80);
    } else if (name === 'chResult') {
      const ch = CHALLENGES[chIndex];
      p.title(chResult.stars ? 'Desafio cumprido!' : 'Não foi dessa vez', 66);
      p.stars(chResult.stars, 512, 160, 80);
      p.text(ch.goal, 512, 240, { size: 24, color: '#93a9c4' });
      p.text(`Melhor: ${save.ch[chIndex] || 0} estrela(s)`, 512, 284, { size: 26 });
      p.button('Tentar de novo', () => newChallenge(chIndex, true), 262, 330, 245, 84, { size: 30 });
      p.button('Próximo', () => newChallenge(chIndex + 1), 517, 330, 245, 84, { size: 30, locked: chIndex >= CHALLENGES.length - 1 || !challengeUnlocked(chIndex + 1) });
      p.button('Desafios', () => showScreen('challenges'), 262, 434, 500, 80);
      p.button('Menu principal', () => goMenu(), 262, 534, 500, 80);
    }
  });
}

// ---------- Painel no PC e no VR ----------
function fitPC() {
  if (renderer.xr.isPresenting) return;
  const aspect = window.innerWidth / window.innerHeight;
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  if (panel.mesh.parent !== camera) camera.add(panel.mesh);
  const half = THREE.MathUtils.degToRad(camera.fov / 2);
  const visH = 2 * 0.8 * Math.tan(half), visW = visH * aspect;
  panel.mesh.position.set(0, 0, -0.8);
  panel.mesh.quaternion.identity();
  panel.mesh.scale.setScalar(Math.min(1, visW * 0.94 / 0.9, visH * 0.92 / 0.633));
  // telão no canto de cima, à direita
  const vh = 2 * Math.tan(half), vw = vh * aspect;
  const h = Math.min(vh * 0.42, vw * 0.42 * 540 / 288), w = h * 288 / 540;
  pcInset.scale.set(w, h, 1);
  pcInset.position.set(vw / 2 - w / 2 - vh * 0.02, vh / 2 - h / 2 - vh * 0.02, -1);
}
function placePanelVR() {
  const head = new THREE.Vector3(), hq = new THREE.Quaternion();
  camera.getWorldPosition(head);
  camera.getWorldQuaternion(hq);
  const yaw = new THREE.Euler().setFromQuaternion(hq, 'YXZ').y;
  const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  panel.mesh.position.copy(head).addScaledVector(fwd, 1.0);
  panel.mesh.position.y = head.y - 0.1;
  panel.mesh.rotation.set(0, yaw, 0);
}

// ---------- Controles do VR ----------
const ctrls = [];
const markGeo = new THREE.SphereGeometry(0.02, 12, 8);
const markMat = new THREE.MeshStandardMaterial({ color: 0x9fd6ff, roughness: 0.3, metalness: 0.4 });
for (let i = 0; i < 2; i++) {
  const ctrl = renderer.xr.getController(i);
  const grip = renderer.xr.getControllerGrip(i);
  rig.add(ctrl, grip);
  const laser = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]), new THREE.LineBasicMaterial({ color: 0x9fd6ff }));
  laser.visible = false;
  ctrl.add(laser);
  const mark = new THREE.Mesh(markGeo, markMat);
  grip.add(mark);
  const broom = makeBroom(0);
  scene.add(broom.shaft, broom.head);
  const entry = { ctrl, grip, laser, mark, broom, source: null, side: null, prevButtons: [], hoverIndex: -1, trigger: false, head: new THREE.Vector3(), prevHead: null, onIce: false, sweepPulse: 0 };
  ctrls.push(entry);
  ctrl.addEventListener('connected', (e) => { entry.source = e.data; entry.side = e.data.handedness; });
  ctrl.addEventListener('disconnected', () => { if (held?.side === entry.side) dropHeld(); entry.source = null; entry.side = null; });
  ctrl.addEventListener('selectstart', () => { entry.trigger = true; onSelect(entry); });
  ctrl.addEventListener('selectend', () => { entry.trigger = false; if (entry.source?.hand && held?.side === entry.side) releaseHeld(); });
  ctrl.addEventListener('squeezestart', () => { sfx.unlock(); if (!entry.source?.hand) tryGrab(entry); });
  ctrl.addEventListener('squeezeend', () => { if (!entry.source?.hand && held?.side === entry.side) releaseHeld(); });
}
const entryFor = (side) => ctrls.find(e => e.side === side && e.source);
function pulse(side, v, ms) {
  try { entryFor(side)?.source?.gamepad?.hapticActuators?.[0]?.pulse?.(clamp(v, 0, 1), ms); } catch { /* sem vibração */ }
}
const pulseAll = (v, ms) => { pulse('left', v, ms); pulse('right', v, ms); };

const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
function handPose(entry) {
  entry.grip.getWorldPosition(_v);
  entry.grip.getWorldQuaternion(_q);
  if (!Number.isFinite(_v.x)) return null;
  _e.setFromQuaternion(_q, 'YXZ');
  return { x: _v.x, y: -_v.z, h: _v.y, yaw: _e.y, q: _q.clone(), p: _v.clone() };
}

// Segurar a pedra: ela segue a mão no plano do gelo. Guarda o caminho da mão para medir a
// velocidade e o giro do pulso na hora de soltar.
let held = null;
function tryGrab(entry) {
  if (app !== 'play' || phase !== 'ready' || !pending || held || panel.visible || dev.autoplay) return;
  const h = handPose(entry);
  if (!h) return;
  if (Math.hypot(h.x - pending.x, h.y - pending.y) > 0.6 || h.h > 1.25) return;
  held = { side: entry.side, entry, offX: pending.x - h.x, offY: pending.y - h.y, yaw0: h.yaw, ang0: pending.ang, hist: [] };
  sfx.grab();
  pulse(entry.side, 0.4, 30);
}
function updateHeld() {
  if (!held) return;
  const h = handPose(held.entry);
  if (!h) return;
  pending.x = clamp(h.x + held.offX, -SHEET.half + STONE_R + 0.03, SHEET.half - STONE_R - 0.03);
  pending.y = clamp(h.y + held.offY, SHEET.nearBack, SHEET.nearHog + 0.6);
  let dyaw = h.yaw - held.yaw0;
  pending.ang = held.ang0 - dyaw;
  held.hist.push({ t: time, x: pending.x, y: pending.y, yaw: h.yaw });
  while (held.hist.length && held.hist[0].t < time - 0.45) held.hist.shift();
}
function handVelocity() {
  const H = held.hist;
  if (H.length < 3) return { vx: 0, vy: 0 };
  const last = H[H.length - 1];
  let first = H[0];
  for (const p of H) if (p.t >= last.t - 0.1) { first = p; break; }
  const dt = Math.max(1e-3, last.t - first.t);
  return { vx: (last.x - first.x) / dt, vy: (last.y - first.y) / dt };
}
function wristSpin() {
  const H = held.hist;
  if (H.length < 3) return 0;
  const last = H[H.length - 1];
  let first = H[0];
  for (const p of H) if (p.t >= last.t - 0.3) { first = p; break; }
  let d = last.yaw - first.yaw;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  const rate = d / Math.max(0.05, last.t - first.t);
  // girar para a direita (horário visto de cima) diminui o yaw
  return clamp(-rate * 0.45, -2, 2);
}
function releaseHeld() {
  if (!held) return;
  const v = handVelocity();
  const spin = wristSpin();
  const side = held.side;
  const sp = Math.hypot(v.vx, v.vy) * HAND_GAIN;
  held = null;
  pulse(side, 0.25, 20);
  if (v.vy * HAND_GAIN < 0.6) { msg = { text: 'Pedra solta parada. Pegue de novo e empurre para a frente.', t: 2.5 }; return; }
  const angle = clamp(Math.atan2(v.vx, v.vy), -0.15, 0.15);
  const spinTxt = Math.abs(spin) < 0.25 ? 'quase sem giro (vai curvar pouco)' : spin > 0 ? 'giro horário (curva para a direita)' : 'giro anti-horário (curva para a esquerda)';
  msg = { text: `${sp.toFixed(1).replace('.', ',')} m/s, ${spinTxt}`, t: 3 };
  deliver({ speed: sp, angle, spin, x: pending.x, y: pending.y });
}
function dropHeld() { held = null; }

function onSelect(entry) {
  sfx.unlock();
  if (panel.visible) {
    if (entry.hoverIndex >= 0) {
      const a = panel.actionAt(entry.hoverIndex);
      if (a) { sfx.click(); a(); }
    }
    return;
  }
  if (entry.source?.hand) tryGrab(entry); // mão rastreada: pinça segura a pedra
}

function pollButtons() {
  for (const e of ctrls) {
    const gp = e.source?.gamepad;
    if (!gp || e.source.hand) continue;
    const b = gp.buttons.map(x => x.pressed);
    if (b[5] && !e.prevButtons[5]) togglePause();   // B ou Y
    e.prevButtons = b;
  }
}

// Vassouras do VR: o cabo sai da mão para a frente e para baixo; se alcança o gelo, a cabeça deita nele.
const broomDir = new THREE.Vector3();
function updateBroomsVR(dt) {
  const show = renderer.xr.isPresenting && app === 'play' && (phase === 'moving' || phase === 'settled') && !panel.visible;
  let best = 0;
  for (const e of ctrls) {
    const b = e.broom;
    const on = show && !!e.source && !e.source.hand;
    b.shaft.visible = b.head.visible = on;
    e.mark.visible = renderer.xr.isPresenting && !!e.source && !e.source.hand && !on;
    if (!on) { e.prevHead = null; e.onIce = false; continue; }
    e.grip.getWorldPosition(_v);
    e.grip.getWorldQuaternion(_q);
    broomDir.set(0, -0.45, -1).normalize().applyQuaternion(_q);
    let len = BROOM_LEN;
    e.onIce = false;
    if (broomDir.y < -0.05) {
      const t = (_v.y - 0.03) / -broomDir.y;
      if (t <= BROOM_LEN) { len = t; e.onIce = true; }
    }
    e.head.copy(_v).addScaledVector(broomDir, len);
    if (e.onIce) e.head.y = 0.002;
    b.shaft.position.copy(_v);
    b.shaft.lookAt(e.head);
    b.shaft.scale.set(1, 1, _v.distanceTo(e.head));
    b.head.position.copy(e.head);
    b.head.rotation.set(0, Math.atan2(broomDir.x, broomDir.z), 0);
    // velocidade da cabeça no gelo e se ela está na frente da pedra que anda
    let speed = 0;
    if (e.prevHead && e.onIce && dt > 0) speed = Math.hypot(e.head.x - e.prevHead.x, e.head.z - e.prevHead.z) / dt;
    e.prevHead = e.onIce ? e.head.clone() : null;
    if (e.onIce && follow && follow.moving && follow.team === PLAYER) {
      const s = sweepZone(follow, e.head.x, -e.head.z) * clamp(speed / 1.4, 0, 1);
      best = Math.max(best, s);
      if (s > 0.05) {
        e.sweepPulse -= dt;
        if (e.sweepPulse <= 0) { pulse(e.side, 0.08 + 0.2 * s, 30); e.sweepPulse = 0.07; }
        if (Math.random() < s * 0.8) spawnDust(e.head, 1);
      }
    }
  }
  return best;
}
// 1 quando (x, y) está logo na frente da pedra, 0 longe dela.
function sweepZone(s, x, y) {
  const v = speedOf(s);
  if (v < 0.03) return 0;
  const dx = s.vx / v, dy = s.vy / v;
  const rx = x - s.x, ry = y - s.y;
  const along = rx * dx + ry * dy, lat = Math.abs(rx * dy - ry * dx);
  if (along < 0.05 || along > 1.7 || lat > 0.5) return 0;
  return (along < 1.0 ? 1 : (1.7 - along) / 0.7) * (lat < 0.3 ? 1 : (0.5 - lat) / 0.2);
}

// Vassoura automática (PC, robô e computador): desenhada na frente da pedra, indo e vindo.
const autoBrooms = [makeBroom(0), makeBroom(1)];
for (const b of autoBrooms) scene.add(b.shaft, b.head);
function updateAutoBroom(intensity, s) {
  for (const b of autoBrooms) b.shaft.visible = b.head.visible = false;
  if (!s || !s.moving || intensity < 0.03) return;
  const b = autoBrooms[s.team];
  const v = speedOf(s);
  if (v < 0.03) return;
  const dx = s.vx / v, dy = s.vy / v;
  const wig = Math.sin(time * 18) * 0.18 * Math.min(1, intensity * 1.5);
  const hx = s.x + dx * 0.55 + dy * wig, hy = s.y + dy * 0.55 - dx * wig;
  const head = W3(hx, hy, 0.002);
  const hand = W3(s.x - 0.65, s.y - 0.1, 1.0);
  b.head.position.copy(head);
  b.head.rotation.set(0, Math.atan2(head.x - hand.x, head.z - hand.z), 0);
  b.shaft.position.copy(hand);
  b.shaft.lookAt(head);
  b.shaft.scale.set(1, 1, hand.distanceTo(head));
  b.shaft.visible = b.head.visible = true;
  if (Math.random() < intensity * 0.7) spawnDust(head, 1);
}

// ---------- Mouse e teclado (PC) ----------
const mouse = { ndc: new THREE.Vector2(), drag: false, x0: 0, y0: 0, x: 0, y: 0, moved: 0 };
const keys = new Set();
const raycaster = new THREE.Raycaster();
let pcAim = null;  // { speed, angle, power }
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
renderer.domElement.addEventListener('pointerdown', (e) => {
  sfx.unlock();
  mouse.ndc.set(e.clientX / window.innerWidth * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  if (panel.visible) {
    raycaster.setFromCamera(mouse.ndc, camera);
    const a = panel.actionAt(panel.pick(raycaster.intersectObject(panel.mesh)[0]?.uv));
    if (a) { sfx.click(); a(); }
    return;
  }
  if (app === 'play' && phase === 'ready' && !renderer.xr.isPresenting && !dev.autoplay) {
    mouse.drag = true; mouse.x0 = mouse.x = e.clientX; mouse.y0 = mouse.y = e.clientY;
    pcAim = aimFromDrag(0, 0);
    renderer.domElement.setPointerCapture?.(e.pointerId);
  }
});
renderer.domElement.addEventListener('pointermove', (e) => {
  mouse.ndc.set(e.clientX / window.innerWidth * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  mouse.moved += Math.hypot(e.movementX || 0, e.movementY || 0);
  if (mouse.drag) { mouse.x = e.clientX; mouse.y = e.clientY; pcAim = aimFromDrag(mouse.x - mouse.x0, mouse.y - mouse.y0); }
});
window.addEventListener('pointerup', () => {
  if (!mouse.drag) return;
  mouse.drag = false;
  if (pcAim && pcAim.power > 0.02 && phase === 'ready' && app === 'play') {
    msg = { text: `${pcAim.speed.toFixed(2).replace('.', ',')} m/s, ${spinName(pcSpin)}`, t: 3 };
    deliver({ speed: pcAim.speed, angle: pcAim.angle, spin: pcSpin, x: RELEASE.x, y: RELEASE.y });
  }
  pcAim = null;
});
renderer.domElement.addEventListener('wheel', (e) => {
  if (app !== 'play' || phase !== 'ready') return;
  e.preventDefault();
  const steps = [-SPIN_NOM, -SPIN_NOM / 2, 0, SPIN_NOM / 2, SPIN_NOM];
  let i = steps.findIndex(v => Math.abs(v - pcSpin) < 1e-6);
  i = clamp(i + (e.deltaY < 0 ? 1 : -1), 0, steps.length - 1);
  pcSpin = steps[i];
  updateHint();
}, { passive: false });
window.addEventListener('blur', () => { keys.clear(); mouse.drag = false; pcAim = null; });
window.addEventListener('keydown', (e) => {
  sfx.unlock();
  const k = e.key.toLowerCase();
  if (k === 'escape' || k === 'p') { togglePause(); return; }
  if (k === 'f') { save.fps = !save.fps; storeSave(save); return; }
  if (k === 'q' && phase === 'ready') { pcSpin = -SPIN_NOM; updateHint(); }
  if (k === 'e' && phase === 'ready') { pcSpin = SPIN_NOM; updateHint(); }
  if (k === ' ') e.preventDefault();
  keys.add(k);
});
window.addEventListener('keyup', (e) => { keys.delete(e.key.toLowerCase()); });
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  fitPC();
});
const spinName = (s) => (Math.abs(s) < 1e-6 ? 'sem giro' : `${Math.abs(s) < SPIN_NOM - 1e-6 ? 'meio giro ' : 'giro '}${s > 0 ? 'horário' : 'anti-horário'}`);

function aimFromDrag(dx, dy) {
  const H = window.innerHeight, Wd = window.innerWidth;
  const power = clamp(dy / (0.45 * H), 0, 1);
  const speed = PC_SPEED.min + Math.pow(power, PC_SPEED.curve) * (PC_SPEED.max - PC_SPEED.min);
  const angle = clamp(-dx / (0.5 * Wd) * 0.1, -0.12, 0.12);
  return { power, speed, angle };
}

// Barra de força do PC, com as marcas de onde a pedra para (sem varrer, sem batida)
const powerEl = document.getElementById('power');
const powerFill = document.getElementById('powerFill');
const powerMarks = document.getElementById('powerMarks');
const powerText = document.getElementById('powerText');
let marksSpin = null;
function updatePowerBar() {
  const show = !renderer.xr.isPresenting && app === 'play' && phase === 'ready' && !panel.visible && !dev.autoplay;
  powerEl.style.display = show ? 'block' : 'none';
  if (!show) return;
  if (marksSpin !== pcSpin) {
    marksSpin = pcSpin;
    const f = (y) => {
      const v = speedForDistance(y - RELEASE.y, pcSpin || 0.0001).v;
      return 100 * Math.pow(clamp((v - PC_SPEED.min) / (PC_SPEED.max - PC_SPEED.min), 0, 1), 1 / PC_SPEED.curve);
    };
    const a = f(T - SHEET.r12 - STONE_R), b = f(T + SHEET.r12 + STONE_R);
    powerMarks.innerHTML = `<div style="left:${f(T - 3.6).toFixed(1)}%;transform:translateX(-100%);border-left:0;border-right:2px solid #fff;padding:0 3px 0 0">guarda</div>`
      + `<div class="band" style="left:${a.toFixed(1)}%;width:${(b - a).toFixed(1)}%">casa</div>`
      + `<div style="left:${f(T + 9).toFixed(1)}%">tirada</div>`;
  }
  const a = pcAim || { power: 0, speed: PC_SPEED.min, angle: 0 };
  powerFill.style.width = `${(a.power * 100).toFixed(1)}%`;
  powerText.textContent = pcAim ? `${a.speed.toFixed(2).replace('.', ',')} m/s · mira ${(a.angle * 180 / Math.PI).toFixed(1).replace('.', ',')}° · ${spinName(pcSpin)}` : `Arraste para trás e solte · ${spinName(pcSpin)}`;
}

// ---------- Câmera do PC ----------
const pcCam = { pos: new THREE.Vector3(0, 1.6, 3.5), look: new THREE.Vector3(0, 0, -(T - 4)) };
let pcCamSnap = true;
function updatePCCamera(dt) {
  if (renderer.xr.isPresenting) return;
  let pos, look;
  if (app === 'menu') {
    const a = time * 0.05;
    pos = new THREE.Vector3(Math.sin(a) * 3.2 + 1.2, 2.1 + Math.sin(a * 1.3) * 0.3, -(T - 6.5 + Math.cos(a) * 1.0));
    look = W3(0, T + 0.2, 0);
  } else if (phase === 'moving' && follow && !follow.out) {
    const s = follow;
    const nearHouse = clamp((s.y - (T - 12)) / 7, 0, 1);
    const chase = W3(s.x * 0.6, s.y - 3.6, 1.35);
    const house = W3(0, T - 7.5, 5.2);
    pos = chase.lerp(house, nearHouse);
    look = W3(s.x, s.y + 5, 0).lerp(W3(0, T + 0.2, 0), nearHouse);
  } else if (phase === 'settled' || phase === 'endover' || phase === 'over' || (phase === 'moving')) {
    pos = W3(0, T - 7.5, 5.2); look = W3(0, T + 0.2, 0);
  } else {
    pos = W3(0, -4.4, 1.75); look = W3(0, T - 11, 0);
  }
  if (pcCamSnap) { pcCam.pos.copy(pos); pcCam.look.copy(look); pcCamSnap = false; }
  pcCam.pos.lerp(pos, damp(3, dt));
  pcCam.look.lerp(look, damp(4, dt));
  camera.position.copy(pcCam.pos);
  camera.lookAt(pcCam.look);
}

// ---------- VR: sessão ----------
let recenterIn = 0;
renderer.xr.addEventListener('sessionstart', () => {
  recenterIn = 5;
  if (panel.mesh.parent) panel.mesh.parent.remove(panel.mesh);
  scene.add(panel.mesh);
  panel.mesh.scale.setScalar(1);
  pcInset.visible = false;
  updateHint();
});
renderer.xr.addEventListener('sessionend', () => {
  held = null;
  rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0);
  camera.position.set(0, 1.6, 3); camera.quaternion.identity();
  pcCamSnap = true;
  fitPC();
  updateHint();
});

// ---------- Raios dos menus ----------
const rayOrigin = new THREE.Vector3(), rayDir = new THREE.Vector3();
function updateMenuRays() {
  const vr = renderer.xr.isPresenting;
  let hover = -1;
  for (const e of ctrls) {
    e.hoverIndex = -1;
    e.laser.visible = false;
    if (!vr || !e.source || !panel.visible) continue;
    e.ctrl.getWorldPosition(rayOrigin);
    e.ctrl.getWorldQuaternion(_q);
    rayDir.set(0, 0, -1).applyQuaternion(_q);
    raycaster.set(rayOrigin, rayDir);
    const hit = raycaster.intersectObject(panel.mesh)[0];
    e.laser.visible = true;
    e.laser.scale.z = hit ? hit.distance : 2;
    e.hoverIndex = panel.pick(hit?.uv);
    if (e.hoverIndex >= 0) hover = e.hoverIndex;
  }
  if (!vr) {
    if (panel.visible) {
      raycaster.setFromCamera(mouse.ndc, camera);
      hover = panel.pick(raycaster.intersectObject(panel.mesh)[0]?.uv);
      renderer.domElement.style.cursor = hover >= 0 && panel.actionAt(hover) ? 'pointer' : 'default';
    } else renderer.domElement.style.cursor = app === 'play' && phase === 'ready' ? (mouse.drag ? 'grabbing' : 'grab') : 'default';
  }
  if (panel.visible) panel.setHover(hover);
}

// ---------- HUD ----------
const hintEl = document.getElementById('hint');
const hudEl = document.getElementById('hud');
const fpsEl = document.getElementById('fps');
function updateHint() {
  if (renderer.xr.isPresenting) { hintEl.textContent = ''; return; }
  let t;
  if (app !== 'play' || panel.visible) t = 'Clique nas opções do painel';
  else if (phase === 'ready') t = `Arraste o mouse para trás e solte · Rodinha ou Q/E: giro (${spinName(pcSpin)}) · Esc: pausa`;
  else if (phase === 'moving' && follow?.team === PLAYER) t = 'Segure Espaço (ou mexa o mouse rápido) para varrer · Shift: acelerar';
  else t = 'Shift: acelerar · Esc: pausa';
  hintEl.innerHTML = `<span>${t}</span>`;
}

function statusLines() {
  if (mode === 'challenge') {
    const ch = CHALLENGES[chIndex];
    return [`Desafio ${chIndex + 1}: ${ch.name}`, `${ch.desc}  (pedras: ${match.left(PLAYER)})`];
  }
  const o = opponent();
  const head = `Você ${match.total(0)} x ${match.total(1)} ${o.name} · End ${match.end + 1}${match.end >= match.ends ? ' (extra)' : ''} · Pedra ${Math.min(8, match.thrown + 1)} de 8`;
  let line;
  if (phase === 'ready') line = renderer.xr.isPresenting ? 'Sua vez: aperte o botão lateral perto da pedra, empurre e solte. Gire o pulso para dar giro.' : 'Sua vez.';
  else if (phase === 'think') line = `${o.name} está pensando...`;
  else if (phase === 'moving') line = follow?.team === PLAYER ? (renderer.xr.isPresenting ? 'Varra! Encoste a vassoura no gelo na frente da pedra e esfregue.' : 'Varra com Espaço!') : `Pedra de ${o.name}${renderer.xr.isPresenting ? ' · gatilho: acelerar' : ''}`;
  else line = '';
  return [head, line];
}

function updateHud(dt) {
  if (msg) { msg.t -= dt; if (msg.t <= 0) msg = null; }
  const vr = renderer.xr.isPresenting;
  const playing = app === 'play' && match && !panel.visible;
  if (!vr) {
    statusLabel.mesh.visible = false;
    hudEl.style.display = playing ? 'block' : 'none';
    if (playing) {
      const [a, b] = statusLines();
      const html = `<b>${a}</b>${b ? `<br>${b}` : ''}${msg && msg.text ? `<br><em>${msg.text}</em>` : ''}${mode === 'match' && match.turnTeam === PLAYER && phase === 'ready' && match.isLastStone ? '<br><em>Última pedra do end!</em>' : ''}`;
      if (hudEl.dataset.last !== html) { hudEl.innerHTML = html; hudEl.dataset.last = html; }
    }
    return;
  }
  hudEl.style.display = 'none';
  statusLabel.mesh.visible = playing;
  if (!playing) return;
  const [a, b] = statusLines();
  statusLabel.set([
    { text: a, size: 0.34, color: '#9fd6ff' },
    { text: msg?.text || b, size: 0.3, bold: false, color: msg?.text ? '#ffe3a0' : '#eef6ff' },
  ]);
}

function updateScoreboard() {
  if (!match) {
    world.scoreboard.draw({ title: 'Pedra no Gelo', names: ['Você', 'Computador'], scores: [[], []], end: -1, hammer: -1, left: [0, 0], footer: 'Escolha uma partida ou um desafio' });
    return;
  }
  if (mode === 'challenge') {
    const ch = CHALLENGES[chIndex];
    world.scoreboard.draw({ title: `Desafio ${chIndex + 1}: ${ch.name}`, names: ['Você', 'Amarelas'], scores: [[], []], end: -1, hammer: -1, left: [match.left(PLAYER), 0], footer: ch.goal });
    return;
  }
  world.scoreboard.draw({
    title: 'Pedra no Gelo', names: ['Você', opponent().name], scores: match.scores, end: match.phase === 'over' ? -1 : match.end,
    hammer: match.hammer, left: [match.left(0), match.left(1)], ends: Math.max(4, match.end + 1),
    footer: match.phase === 'over' ? 'Fim de jogo' : `End ${match.end + 1} · ${opponent().title}`,
  });
}

// ---------- Botão de VR ----------
const vrBtn = document.getElementById('vr');
async function setupVR() {
  const ok = navigator.xr && await navigator.xr.isSessionSupported('immersive-vr').catch(() => false);
  if (!ok) {
    vrBtn.textContent = window.isSecureContext ? 'VR não disponível neste navegador' : 'VR precisa de HTTPS';
    vrBtn.disabled = true;
    return;
  }
  vrBtn.textContent = 'Entrar em VR';
  vrBtn.disabled = false;
  vrBtn.onclick = async () => {
    sfx.unlock();
    if (renderer.xr.isPresenting) { renderer.xr.getSession()?.end(); return; }
    try {
      const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
      await renderer.xr.setSession(session);
      vrBtn.textContent = 'Sair do VR';
      session.addEventListener('end', () => { vrBtn.textContent = 'Entrar em VR'; });
    } catch (err) {
      vrBtn.textContent = 'Erro ao entrar em VR';
      console.error(err);
    }
  };
}
setupVR();

// ---------- Laço principal ----------
let lastT = performance.now();
let fpsFrames = 0, fpsTime = 0, frameNo = 0;
let rigPrev = new THREE.Vector3(), rigSpeed = 0;

function stoneList() {
  const list = [];
  if (!match) return menuStones;
  for (const s of match.stones) {
    if (!s.out) list.push(s);
    else if (time - (outAt.get(s.id) ?? -99) < 1.0) list.push({ team: s.team, x: s.x, y: s.y, ang: s.ang, scale: 1 - (time - outAt.get(s.id)) * 0.6 });
  }
  if (pending) list.push(pending);
  // pedras que faltam, encostadas do lado de fora das tabelas perto do apoio
  for (const team of [PLAYER, CPU]) {
    let n = match.left(team);
    if (team === PLAYER && pending) n--;
    else if (match.current?.team === team) n--;
    for (let k = 0; k < n; k++) list.push({ team, x: (team === PLAYER ? -1 : 1) * (SHEET.half + 0.42), y: -0.6 - k * 0.38, ang: 0 });
  }
  return list;
}

function tick(dt) {
  time += dt;
  frameNo++;
  const vr = renderer.xr.isPresenting;
  if (recenterIn > 0 && --recenterIn === 0) { placeForPhase(); if (panel.visible) placePanelVR(); }
  pollButtons();
  rig.updateMatrixWorld(true);
  updateFade(dt);

  // Turno
  if (app === 'play' && match) {
    if (phase === 'ready') {
      updateHeld();
      if (dev.autoplay) {
        if (!thinker) startRobotThinking();
        pumpThinker();
        timer += dt;
        if (timer > 0.7 && thinker.done) robotThrow();
      }
    } else if (phase === 'think') {
      timer -= dt;
      pumpThinker();
      if (timer <= 0 && thinker?.done) cpuThrow();
    } else if (phase === 'moving') {
      const fast = keys.has('shift') || ctrls.some(c => c.trigger && !c.onIce);
      // varrer: jogador (VR ou PC), robô ou computador
      let raw = 0;
      if (follow && follow.team === PLAYER && !dev.autoplay) {
        if (vr) raw = vrSweep;
        else raw = Math.max(keys.has(' ') ? 1 : 0, clamp(mouse.moved / Math.max(dt, 1e-3) / 1400, 0, 1));
      } else if (follow && (follow.team === CPU || dev.autoplay)) {
        aiSweepT -= dt;
        if (aiSweepT <= 0) { aiSweep = sweepDecision(follow, plan, follow.team === CPU ? opponent().sweepSkill : ROBOT.sweepSkill); aiSweepT = 0.2; }
        raw = aiSweep;
      }
      sweepRaw = raw;
      sweepS += (raw - sweepS) * damp(raw > sweepS ? 10 : 5, dt);
      acc += dt * (fast ? 3 : 1);
      const n = Math.min(400, Math.floor(acc / DT));
      for (let i = 0; i < n && match.phase === 'moving'; i++) {
        match.step(DT, follow && follow.moving && sweepS > 0.01 ? { id: follow.id, s: sweepS } : null);
      }
      acc -= n * DT;
      handleEvents();
      if (match.phase === 'settled') onSettled();
    } else if (phase === 'settled') {
      timer -= dt;
      if (timer <= 0) afterSettle();
    } else if ((phase === 'endover' || phase === 'over') && dev.autoplay) {
      timer -= dt;
      if (timer <= 0) {
        if (phase === 'endover') nextEnd();
        else if (mode === 'match') newMatch(oppIndex);
      }
    }
  }
  mouse.moved = 0;

  // VR: seguir a pedra do jogador deslizando pela pista
  if (vr && app === 'play' && phase === 'moving' && follow && follow.team === PLAYER && !follow.out && fade.dir === 0) {
    camera.getWorldPosition(_v);
    const tx = follow.x - 0.8, tz = -(follow.y + 0.25);
    rig.position.x += (tx - _v.x) * damp(1.2, dt);
    rig.position.z += (tz - _v.z) * damp(3, dt);
  }
  rigSpeed = dt > 0 ? rig.position.distanceTo(rigPrev) / dt : 0;
  rigPrev.copy(rig.position);
  vignette.visible = vr && save.vignette > 0;
  vignette.material.opacity += (clamp((rigSpeed - 0.25) / 1.5, 0, 1) * 0.92 * save.vignette - vignette.material.opacity) * damp(6, dt);

  // Visual
  vrSweep = updateBroomsVR(dt);
  updateAutoBroom((phase === 'moving' && follow && (follow.team === CPU || dev.autoplay || !vr)) ? sweepS : 0, follow);
  sfx.setBroom(phase === 'moving' ? sweepS : 0, time);
  world.stones.update(stoneList());
  world.animate(dt, time);
  updateDust(dt);
  updateAim();
  updatePCCamera(dt);
  updateHud(dt);
  updateMenuRays();
  updatePowerBar();
  updateScoreboard();
  telao.visible = vr && app === 'play' && (phase === 'ready');
  pcInset.visible = !vr && app === 'play' && !panel.visible && (phase === 'ready' || phase === 'think' || (phase === 'moving' && follow && follow.y < T - 10));

  // Som: ronco da pedra mais rápida, mais alto perto de quem ouve
  let vmax = 0, near = 0;
  camera.getWorldPosition(_v);
  if (match) for (const s of match.stones) {
    if (!s.moving || s.out) continue;
    const v = speedOf(s);
    if (v > vmax) { vmax = v; near = clamp(1 - Math.hypot(s.x - _v.x, -s.y - _v.z) / 35, 0.12, 1); }
  }
  sfx.setRumble(vmax, near);
  sfx.updateCrowd(dt, app === 'play' ? 1 : 0.6);

  fpsFrames++; fpsTime += dt;
  if (fpsTime >= 0.5) {
    const f = Math.round(fpsFrames / fpsTime);
    fpsFrames = 0; fpsTime = 0;
    fpsEl.style.display = save.fps && !vr ? 'block' : 'none';
    fpsEl.textContent = `${f} FPS`;
    fpsLabel.mesh.visible = save.fps && vr;
    fpsLabel.set(`${f} FPS`);
  }
}
let vrSweep = 0;

// Risco de mira: no PC enquanto arrasta; no VR enquanto segura a pedra (na direção da mão).
function updateAim() {
  let show = false, x = 0, y = 0, ang = 0;
  if (app === 'play' && phase === 'ready' && !panel.visible) {
    if (!renderer.xr.isPresenting && !dev.autoplay) { show = true; x = RELEASE.x; y = RELEASE.y; ang = pcAim ? pcAim.angle : 0; }
    else if (held && pending) {
      show = true; x = pending.x; y = pending.y;
      const v = handVelocity();
      ang = v.vy > 0.3 ? clamp(Math.atan2(v.vx, v.vy), -0.15, 0.15) : 0;
    }
  }
  aimLine.visible = show;
  if (show) { aimLine.position.copy(W3(x, y)); aimLine.rotation.y = -ang; }
  // anel embaixo da pedra para pegar (VR): acende quando a mão está perto
  grabRing.visible = renderer.xr.isPresenting && app === 'play' && phase === 'ready' && !!pending && !held && !panel.visible;
  if (grabRing.visible) {
    grabRing.position.copy(W3(pending.x, pending.y, 0.005));
    let close = false;
    for (const e of ctrls) {
      if (!e.source || e.source.hand) continue;
      const h = handPose(e);
      if (h && Math.hypot(h.x - pending.x, h.y - pending.y) < 0.6 && h.h < 1.25) close = true;
    }
    grabRing.material.color.set(close ? 0x7dff9a : 0x9fd6ff);
    grabRing.material.opacity = close ? 0.85 : 0.35 + 0.25 * Math.sin(time * 4);
  }
}

function handleEvents() {
  for (const ev of match.events) {
    if (ev.type === 'hit') {
      sfx.hit(ev.v / 2.5);
      if (renderer.xr.isPresenting) pulseAll(Math.min(1, ev.v / 3), 40);
      if (ev.v > 1.5) sfx.claps(6, 0.6);
    } else if (ev.type === 'out') {
      outAt.set(ev.id, time);
      if (ev.why === 'fundo') sfx.board();
    } else if (ev.type === 'hog' || ev.type === 'hogRelease') outAt.set(ev.id, time);
  }
  // eventos de fim de lance ficam para o onSettled ler
  const keep = match.events.filter(e => e.type === 'hog' || e.type === 'hogRelease');
  match.events = keep;
}

function frame() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  tick(dt);
  if (app === 'play' && (telao.visible || pcInset.visible) && frameNo % (IS_QUEST ? 3 : 1) === 0) renderHouse();
  renderer.render(scene, camera);
}
function renderHouse() {
  const xr = renderer.xr.enabled;
  renderer.xr.enabled = false;
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(houseRT);
  renderer.render(scene, houseCam);
  renderer.setRenderTarget(prev);
  renderer.xr.enabled = xr;
}

// ---------- Depuração (console do navegador) ----------
// dev.autoplay = true     o robô joga por você (e as partidas continuam sozinhas)
// dev.advance(20)         avança 20 s de jogo na hora
// dev.state()             resumo: tela, fase, placar, pedras
// dev.loadLevel(3)        abre o desafio 3 (1 a 10)
// dev.startMatch(2)       partida contra o adversário 2 (1 a 3)
// dev.resetSave()         apaga o progresso
const dev = {
  _auto: false,
  get autoplay() { return this._auto; },
  set autoplay(v) { this._auto = !!v; held = null; if (phase === 'ready') { timer = 0; thinker = null; } },
  loadLevel(n) { newChallenge(n - 1, true); return this.state(); },
  startMatch(n = 1) { newMatch(n - 1); return this.state(); },
  advance(sec, step = 1 / 60) {
    const frames = Math.round(sec / step);
    for (let i = 0; i < frames; i++) tick(step);
    lastT = performance.now();
    if (app === 'play') renderHouse();
    renderer.render(scene, camera);
    return this.state();
  },
  state() {
    const base = { tela: app, modo: mode, fase: phase };
    if (!match) return base;
    return {
      ...base,
      adversario: mode === 'match' ? opponent().name : null,
      desafio: mode === 'challenge' ? `${chIndex + 1}: ${CHALLENGES[chIndex].name}` : null,
      end: match.end + 1, pedra: match.thrown + 1, vez: teamName(match.turnTeam),
      placar: [match.total(0), match.total(1)], ends: match.scores.map(a => a.join(',')),
      pedras: match.stones.filter(s => !s.out).map(s => ({ time: s.team === PLAYER ? 'vermelha' : 'amarela', x: +s.x.toFixed(2), y: +s.y.toFixed(2), noBotao: +distToButton(s).toFixed(2) })),
      andando: !!match.stones.some(s => s.moving), varrendo: +sweepS.toFixed(2),
      estrelas: mode === 'challenge' && chResult && phase === 'over' ? chResult.stars : null,
      vencedor: match.phase === 'over' && mode === 'match' ? (match.winner === PLAYER ? 'você' : match.winner === CPU ? opponent().name : 'empate') : null,
      salvo: { vitorias: save.wins, desafios: save.ch },
    };
  },
  resetSave() { save.wins = [0, 0, 0]; save.games = [0, 0, 0]; save.ch = {}; storeSave(save); },
};
window.dev = dev;
window.curling = { dev, get match() { return match; }, save, camera, scene, renderer };

fitPC();
goMenu();
renderer.setAnimationLoop(frame);
