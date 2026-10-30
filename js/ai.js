// IA do adversário (e do robô que joga por você): gera jogadas candidatas, simula cada uma na
// física de verdade e escolhe a melhor para o estilo dela. Sem navegador nem Three.js.
import { SHEET, STONE_R, DT, RELEASE, SPIN_NOM, makeStone, launch, moveStone, simulate, cloneStones, distToButton, inHouse } from './physics.js';
import { scoreEnd, applyHogRule } from './match.js';

export const OPPONENTS = [
  {
    name: 'Dona Cida', style: 'cauteloso', title: 'A cautelosa',
    desc: 'Põe pedra na casa e quase nunca arrisca tirar as suas.',
    noiseV: 0.06, noiseA: 0.0065, sweepSkill: 0.35, samples: 1,
  },
  {
    name: 'Tonhão', style: 'agressivo', title: 'O agressivo',
    desc: 'Tira as suas pedras com força sempre que pode.',
    noiseV: 0.035, noiseA: 0.004, sweepSkill: 0.6, samples: 2,
  },
  {
    name: 'Mestre Yuki', style: 'mestre', title: 'A mestre',
    desc: 'Protege as pedras dela com guardas e quase não erra.',
    noiseV: 0.016, noiseA: 0.0022, sweepSkill: 1, samples: 4,
  },
];
// O robô que joga por você (dev.autoplay e testes): estilo mestre, mão quase perfeita.
export const ROBOT = { name: 'Robô', style: 'mestre', noiseV: 0.008, noiseA: 0.001, sweepSkill: 1, samples: 3 };

// ---------- Sorteio reproduzível ----------
export function rng(seed = 1) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
export function gauss(r) {
  const u = Math.max(1e-9, r()), v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ---------- Caminho livre (sem batidas): a curva não depende da direção ----------
// Como a curva é sempre perpendicular à velocidade, o caminho lançado num ângulo θ é o caminho
// reto girado de θ em torno do ponto de soltura. Basta guardar onde a pedra para, para cada
// velocidade, lançando reto.
const bearing = (x, y) => Math.atan2(x, y);          // 0 = pista acima, + = para a direita
const SPEEDS = { min: 0.5, max: 9.5, step: 0.05 };
const stopTables = new Map();
function freeStop(speed, spin) {
  const s = makeStone(0, 0, 0);
  launch(s, speed, 0, spin);
  while (s.moving) moveStone(s, DT, 0);
  return [s.x, s.y];
}
function stopTable(spin) {
  const key = spin.toFixed(3);
  let t = stopTables.get(key);
  if (!t) {
    t = [];
    for (let v = SPEEDS.min; v <= SPEEDS.max + 1e-9; v += SPEEDS.step) {
      const [x, y] = freeStop(v, spin);
      t.push({ v, x, y, d: Math.hypot(x, y) });
    }
    stopTables.set(key, t);
  }
  return t;
}
// Velocidade para a pedra parar a uma distância d do ponto de soltura (e onde ela para, lançada reto).
export function speedForDistance(d, spin) {
  const t = stopTable(spin);
  if (d <= t[0].d) return { ...t[0] };
  for (let i = 1; i < t.length; i++) {
    if (t[i].d >= d) {
      const a = t[i - 1], b = t[i], f = (d - a.d) / (b.d - a.d);
      return { v: a.v + (b.v - a.v) * f, x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, d };
    }
  }
  return { ...t[t.length - 1] };
}
// Onde a pedra para (sem batidas, sem varrer), dado velocidade, ângulo e giro.
export function predictStop(speed, angle, spin, from = RELEASE) {
  const [x, y] = freeStop(speed, spin);
  const c = Math.cos(angle), s = Math.sin(angle);
  return { x: from.x + x * c + y * s, y: from.y - x * s + y * c };
}

// Jogada que para no ponto alvo (sem batidas).
export function drawShot(target, spin, from = RELEASE) {
  const dx = target.x - from.x, dy = target.y - from.y;
  const r = speedForDistance(Math.hypot(dx, dy), spin);
  return { speed: r.v, angle: bearing(dx, dy) - bearing(r.x, r.y), spin };
}
// Jogada que passa pelo ponto P com a velocidade inicial dada (para bater numa pedra).
export function throughShot(P, speed, spin, from = RELEASE) {
  const dx = P.x - from.x, dy = P.y - from.y, D = Math.hypot(dx, dy);
  const s = makeStone(0, 0, 0);
  launch(s, speed, 0, spin);
  let px = 0, py = 0;
  while (s.moving) {
    px = s.x; py = s.y;
    moveStone(s, DT, 0);
    const d = Math.hypot(s.x, s.y);
    if (d >= D) {
      const d0 = Math.hypot(px, py), f = (D - d0) / (d - d0 || 1);
      const qx = px + (s.x - px) * f, qy = py + (s.y - py) * f;
      return { speed, angle: bearing(dx, dy) - bearing(qx, qy), spin };
    }
  }
  return null; // não chega lá
}

// ---------- Leitura da casa ----------
const T = SHEET.tee;
export const isGuard = (s) => !s.out && !inHouse(s) && s.y - STONE_R > SHEET.farHog && s.y < T && Math.abs(s.x) < 1.6;
// g está na frente de s, no caminho vindo do ponto de soltura?
export function covers(g, s, width = 2 * STONE_R + 0.06) {
  if (g === s || g.out || g.y >= s.y - 0.2) return false;
  const dx = s.x - RELEASE.x, dy = s.y - RELEASE.y, L = Math.hypot(dx, dy);
  const gx = g.x - RELEASE.x, gy = g.y - RELEASE.y;
  const along = (gx * dx + gy * dy) / L;
  const side = Math.abs(gx * dy - gy * dx) / L;
  return along > 0 && along < L && side < width;
}

// Valor de uma posição para o time `team`. ctx: { myLeft, oppLeft, style }.
export function evaluate(stones, team, ctx) {
  const opp = 1 - team;
  const sc = scoreEnd(stones);
  let v = sc.team === team ? sc.points : sc.team === opp ? -sc.points : 0;
  if (ctx.myLeft + ctx.oppLeft === 0) return v; // última pedra: só o placar conta
  const style = ctx.style || 'mestre';
  const live = stones.filter(s => !s.out);
  // pontos no placar ainda podem mudar: pesam um pouco menos, e quem lança por último leva vantagem
  v *= 0.85;
  for (const s of live) {
    const own = s.team === team ? 1 : -1;
    if (inHouse(s)) {
      const d = distToButton(s);
      v += own * (0.12 + 0.28 * (1 - d / (SHEET.r12 + STONE_R)));
      if (style === 'cauteloso' && own > 0) v += 0.12;
    } else if (isGuard(s)) {
      v += own * (style === 'mestre' ? 0.1 : 0.03);
    }
  }
  if (style === 'mestre') {
    // pedra que marca, escondida atrás de uma guarda, é difícil de tirar
    const counting = live.filter(inHouse).sort((a, b) => distToButton(a) - distToButton(b)).slice(0, 3);
    for (const s of counting) {
      if (live.some(g => isGuard(g) && covers(g, s))) v += s.team === team ? 0.35 : -0.3;
    }
  }
  if (style === 'agressivo') v -= 0.3 * live.filter(s => s.team === opp).length;
  return v;
}

// ---------- Candidatas ----------
const DRAW_TARGETS = (() => {
  const t = [{ x: 0, y: T }];
  for (const r of [0.4, 0.85, 1.35]) for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4;
    t.push({ x: r * Math.sin(a), y: T + r * Math.cos(a) });
  }
  return t;
})();
const GUARD_TARGETS = [];
for (const dy of [-2.6, -3.6, -4.8]) for (const x of [-0.7, -0.35, 0, 0.35, 0.7]) GUARD_TARGETS.push({ x, y: T + dy });
const WEIGHTS = { tap: 1.3, hit: 7, peel: 16 }; // quanto além da pedra a lançada pararia sozinha (m)

export function candidates(stones, team, style = 'mestre') {
  const list = [];
  const live = stones.filter(s => !s.out);
  const opp = live.filter(s => s.team !== team);
  const draws = style === 'agressivo' && opp.length ? DRAW_TARGETS.slice(0, 9) : DRAW_TARGETS;
  for (const spin of [SPIN_NOM, -SPIN_NOM]) {
    for (const p of draws) list.push({ kind: 'draw', target: p, ...drawShot(p, spin) });
    const guards = style === 'agressivo' ? [] : style === 'cauteloso' ? GUARD_TARGETS.filter((_, i) => i % 2 === 0) : GUARD_TARGETS;
    for (const p of guards) list.push({ kind: 'guard', target: p, ...drawShot(p, spin) });
    // encostar e contornar: parar na frente ou atrás das pedras que estão em jogo
    for (const s of live) {
      if (s.y < SHEET.farHog) continue;
      for (const [ox, oy] of [[0, -0.32], [0.3, 0.38], [-0.3, 0.38]]) {
        const p = { x: s.x + ox, y: s.y + oy };
        if (Math.abs(p.x) < SHEET.half - 0.3 && p.y < SHEET.farBack) list.push({ kind: 'draw', target: p, ...drawShot(p, spin) });
      }
    }
    // batidas
    const targets = style === 'cauteloso'
      ? opp.filter(inHouse).sort((a, b) => distToButton(a) - distToButton(b)).slice(0, 1)
      : live.filter(s => s.y > SHEET.farHog);
    for (const s of targets) {
      const dx = s.x - RELEASE.x, dy = s.y - RELEASE.y, L = Math.hypot(dx, dy);
      const px = dy / L, py = -dx / L;
      const weights = style === 'cauteloso' ? ['tap', 'hit'] : ['tap', 'hit', 'peel'];
      for (const w of weights) {
        const speed = speedForDistance(L + WEIGHTS[w], spin).v;
        for (const off of [-0.13, 0, 0.13]) {
          const shot = throughShot({ x: s.x + px * off, y: s.y + py * off }, speed, spin);
          if (shot) list.push({ kind: w, target: { x: s.x, y: s.y }, ...shot });
        }
      }
    }
  }
  return list;
}

// Joga uma candidata numa cópia da pedra e devolve a cópia (com a regra do hog aplicada).
export function trial(stones, team, shot, noise = null, r = null) {
  const sim = cloneStones(stones);
  const s = makeStone(team, RELEASE.x, RELEASE.y);
  let speed = shot.speed, angle = shot.angle;
  if (noise && r) { speed += gauss(r) * noise.noiseV; angle += gauss(r) * noise.noiseA; }
  launch(s, Math.max(0.3, speed), angle, shot.spin);
  sim.push(s);
  simulate(sim);
  applyHogRule(s);
  return { stones: sim, stone: s };
}

// Escolhe a jogada. ctx: { myLeft, oppLeft } contando as pedras DEPOIS desta.
// Versão em passos (gerador): o navegador pensa um pouco por quadro, sem travar a imagem.
export function* chooseShotGen(stones, team, ctx, level, r = rng(7)) {
  const style = level.style;
  const c = { ...ctx, style };
  const cands = candidates(stones, team, style);
  for (const shot of cands) {
    shot.value = evaluate(trial(stones, team, shot).stones, team, c) + r() * 1e-3;
    yield;
  }
  cands.sort((a, b) => b.value - a.value);
  let best = cands[0];
  if (level.samples > 1) {
    // as melhores de novo, com o erro de mão da IA: prefere jogada que dá certo mesmo errando um pouco
    const top = cands.slice(0, 10);
    for (const shot of top) {
      let sum = shot.value;
      for (let k = 0; k < level.samples; k++) { sum += evaluate(trial(stones, team, shot, level, r).stones, team, c); yield; }
      shot.robust = sum / (level.samples + 1);
    }
    top.sort((a, b) => b.robust - a.robust);
    best = top[0];
  }
  return best;
}
export function drain(gen) {
  for (;;) { const x = gen.next(); if (x.done) return x.value; }
}
export const chooseShot = (...args) => drain(chooseShotGen(...args));

// Erro de mão na hora de lançar.
export function execute(shot, level, r) {
  return { ...shot, speed: Math.max(0.3, shot.speed + gauss(r) * level.noiseV), angle: shot.angle + gauss(r) * level.noiseA };
}

// Varredura da IA: só em pedra que é para parar (casa ou guarda). Prevê onde a pedra para sem
// varrer; se vai ficar curta do alvo ou curvar demais, varre (com a habilidade do nível).
export function sweepDecision(stone, shot, skill) {
  if (!shot || !shot.target || (shot.kind !== 'draw' && shot.kind !== 'guard') || !stone.moving) return 0;
  const p = { ...stone };
  while (p.moving) moveStone(p, DT * 2, 0);
  const v = Math.hypot(stone.vx, stone.vy);
  const dx = stone.vx / v, dy = stone.vy / v;
  const ex = shot.target.x - p.x, ey = shot.target.y - p.y;
  const short = ex * dx + ey * dy;                 // > 0: vai parar antes do alvo
  const side = (ex * dy - ey * dx) * Math.sign(stone.curl || 1); // < 0: vai curvar demais
  return short > 0.12 || side < -0.15 ? skill : 0;
}

// Contexto da jogada para o time da vez numa partida (pedras que sobram depois desta).
export function matchContext(match) {
  const team = match.turnTeam;
  return { myLeft: match.left(team) - 1, oppLeft: match.left(1 - team) };
}

// Joga a vez inteira na hora (sem animação): escolhe, erra um pouco, lança e varre. Usado pelos
// testes; o navegador faz o mesmo passo a passo.
export function playTurnInstant(match, level, r) {
  const team = match.turnTeam;
  const plan = chooseShot(match.stones, team, matchContext(match), level, r);
  const shot = execute(plan, level, r);
  const s = match.deliver(shot);
  let sweepS = 0, k = 0;
  while (match.phase === 'moving') {
    if (k++ % 20 === 0) sweepS = sweepDecision(s, plan, level.sweepSkill);
    match.step(DT, sweepS ? { id: s.id, s: sweepS } : null);
  }
  match.next();
  return { plan, shot, stone: s };
}
