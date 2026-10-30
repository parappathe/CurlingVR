// Física do curling, sem navegador nem Three.js (os testes rodam no Node).
// As pedras são discos no plano do gelo. Coordenadas da pista, em metros:
//   x = lado (0 = linha do meio, + = direita de quem lança),
//   y = ao longo da pista (0 = linha do tee da casa de perto, cresce para a casa de longe).

export const SHEET = {
  half: 2.375,        // meia largura (pista de 4,75 m)
  nearEnd: -5.487,    // tabela do fundo, lado de quem lança (45,72 m de tabela a tabela)
  hack: -3.658,       // apoio (hack), 3,66 m atrás do tee
  nearBack: -1.829,
  nearHog: 6.401,     // linha de hog: 6,40 m do tee
  farHog: 28.346,
  tee: 34.747,        // tee a tee: 34,75 m
  farBack: 36.576,    // linha de fundo: 1,83 m atrás do tee
  farEnd: 40.234,
  r12: 1.829, r8: 1.219, r4: 0.610, button: 0.152,
};
export const STONE_R = 0.145;          // pedra de 29 cm de diâmetro
export const DT = 1 / 100;             // passo fixo da física
export const A_ICE = 0.2;              // desaceleração do gelo (m/s²)
export const CURL_K = 0.05;            // força da curva (curl)
export const SPIN_NOM = 1.5;           // giro "cheio" (rad/s) na soltura
export const SWEEP_FRICTION = 0.3;     // varrer no máximo tira 30% do atrito...
export const SWEEP_CURL = 0.55;        // ...e 55% da curva
export const RESTITUTION = 0.88;       // batida pedra contra pedra: quase elástica
export const RELEASE = { x: 0, y: 2.0 }; // ponto de soltura usado pela IA, pelo PC e pelos desafios

let nextId = 1;
export function makeStone(team, x, y) {
  return { id: nextId++, team, x, y, vx: 0, vy: 0, w: 0, ang: 0, curl: 0, moving: false, out: false, hit: false, delivered: false };
}
export function cloneStones(stones) { return stones.map(s => ({ ...s })); }

// Giro na soltura -> fator de curva com sinal. Horário (spin > 0) curva para a direita.
export function curlFactor(spin) {
  const m = Math.abs(spin);
  if (m < 0.05) return 0;
  return Math.sign(spin) * (0.6 + 0.4 * Math.min(1, m / SPIN_NOM));
}

// angle: 0 = reto pela pista, positivo = para a direita (rad). spin: rad/s, + = horário.
export function launch(s, speed, angle, spin) {
  s.vx = speed * Math.sin(angle);
  s.vy = speed * Math.cos(angle);
  s.w = spin;
  s.curl = curlFactor(spin);
  s.moving = speed > 0;
  s.delivered = true;
}

export const speedOf = (s) => Math.hypot(s.vx, s.vy);
export const allStopped = (stones) => stones.every(s => s.out || !s.moving);

// Move uma pedra solta por um passo (atrito, curva, varrida). Não olha bordas nem batidas.
export function moveStone(s, dt = DT, sw = 0) {
  const v = Math.hypot(s.vx, s.vy);
  const a = A_ICE * (1 + 0.15 / (v + 0.15)) * (1 - SWEEP_FRICTION * sw);
  const v2 = v - a * dt;
  if (v2 <= 0.004) { s.vx = s.vy = 0; s.w = 0; s.moving = false; return; }
  const dx = s.vx / v, dy = s.vy / v;
  // curva: aceleração de lado (perpendicular à velocidade), maior quando a pedra está lenta
  const lat = CURL_K * s.curl * (1 - SWEEP_CURL * sw) / (v + 0.6);
  let nvx = s.vx + dy * lat * dt, nvy = s.vy - dx * lat * dt;
  const nv = Math.hypot(nvx, nvy);
  nvx *= v2 / nv; nvy *= v2 / nv;
  s.x += (s.vx + nvx) * 0.5 * dt;
  s.y += (s.vy + nvy) * 0.5 * dt;
  s.vx = nvx; s.vy = nvy;
  s.w *= v2 / v;      // o giro morre junto com a velocidade
  s.ang += s.w * dt;
}

// Um passo de física. sweep: { id, s } = pedra sendo varrida e intensidade 0..1.
// events (opcional) recebe { type: 'hit', v, x, y } e { type: 'out', id, why }.
export function stepStones(stones, dt = DT, sweep = null, events = null) {
  for (const s of stones) {
    if (!s.moving || s.out) continue;
    moveStone(s, dt, sweep && sweep.id === s.id ? sweep.s : 0);
  }
  collide(stones, events);
  for (const s of stones) {
    if (s.out || !s.moving) continue;
    let why = null;
    if (Math.abs(s.x) + STONE_R >= SHEET.half) why = 'lado';
    else if (s.y - STONE_R > SHEET.farBack) why = 'fundo';
    else if (s.y < SHEET.nearEnd + STONE_R) why = 'fundo';
    if (why) { s.out = true; s.moving = false; s.vx = s.vy = 0; events?.push({ type: 'out', id: s.id, why }); }
  }
}

const D2 = (2 * STONE_R) ** 2;
function collide(stones, events) {
  const n = stones.length;
  for (let i = 0; i < n; i++) {
    const a = stones[i];
    if (a.out) continue;
    for (let j = i + 1; j < n; j++) {
      const b = stones[j];
      if (b.out || (!a.moving && !b.moving)) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= D2) continue;
      const d = Math.sqrt(d2) || 1e-6;
      const nx = dx / d, ny = dy / d;
      // separa as duas igualmente (mesma massa)
      const push = (2 * STONE_R - d) / 2;
      a.x -= nx * push; a.y -= ny * push;
      b.x += nx * push; b.y += ny * push;
      const vn = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (vn <= 0) continue;
      const J = (1 + RESTITUTION) / 2 * vn;
      a.vx -= J * nx; a.vy -= J * ny;
      b.vx += J * nx; b.vy += J * ny;
      // a pedra atingida sai quase sem giro (vai reta); a que bateu perde a maior parte
      for (const [s, o] of [[a, b], [b, a]]) {
        if (!s.moving) { s.w = o.w * 0.25; s.curl = 0; }
        else { s.curl *= 0.35; s.w *= 0.5; }
      }
      a.moving = Math.hypot(a.vx, a.vy) > 0.004;
      b.moving = Math.hypot(b.vx, b.vy) > 0.004;
      a.hit = b.hit = true;
      events?.push({ type: 'hit', v: vn, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    }
  }
}

// Roda até tudo parar. sweep: { id, s } fixo, ou função (stones, t) -> { id, s } | null.
export function simulate(stones, { sweep = null, maxT = 90, events = null, onStep = null } = {}) {
  let t = 0;
  while (!allStopped(stones) && t < maxT) {
    const sw = typeof sweep === 'function' ? sweep(stones, t) : sweep;
    stepStones(stones, DT, sw, events);
    t += DT;
    onStep?.(stones, t);
  }
  return t;
}

// Situação da pedra em relação às regras: na casa, distância ao botão.
export const distToButton = (s) => Math.hypot(s.x, s.y - SHEET.tee);
export const inHouse = (s) => !s.out && distToButton(s) - STONE_R <= SHEET.r12;
// Passou inteira da linha de hog do outro lado (pedra em jogo).
export const pastFarHog = (s) => s.y - STONE_R > SHEET.farHog;
