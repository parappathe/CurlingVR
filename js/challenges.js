// Modo desafio: 10 situações prontas, cada uma com 1 ou 2 pedras para lançar e nota de 0 a 3
// estrelas. Também tem o robô que acha a solução (usado nos testes). Sem navegador nem Three.js.
import { SHEET, STONE_R, RELEASE, SPIN_NOM, makeStone, cloneStones, distToButton, inHouse } from './physics.js';
import { scoreEnd } from './match.js';
import { candidates, trial, drawShot, throughShot, speedForDistance, drain } from './ai.js';

const T = SHEET.tee;
const ME = 0, THEM = 1;

// Ajudas para dar nota. res = { stones, start: [{ id, team, x, y }], thrown: [pedras lançadas] }
const find = (res, id) => res.stones.find(s => s.id === id);
const startOf = (res, team) => res.start.filter(s => s.team === team);
const outCount = (res, team) => startOf(res, team).filter(s0 => find(res, s0.id).out).length;
const moved = (res, s0) => { const s = find(res, s0.id); return s.out ? 99 : Math.hypot(s.x - s0.x, s.y - s0.y); };
const myBest = (res) => res.stones.filter(s => s.team === ME && inHouse(s)).reduce((m, s) => Math.min(m, distToButton(s)), Infinity);
const in4 = (d) => d - STONE_R <= SHEET.r4;
const in8 = (d) => d - STONE_R <= SHEET.r8;
const in12 = (d) => d - STONE_R <= SHEET.r12;
const last = (res) => find(res, res.thrown[res.thrown.length - 1].id);
const guardZone = (s) => !s.out && s.y - STONE_R > SHEET.farHog && distToButton(s) - STONE_R > SHEET.r12 && s.y < T;

export const CHALLENGES = [
  {
    name: 'Na mosca', throws: 1, stones: [],
    desc: 'Casa vazia. Pare a pedra o mais perto possível do botão.',
    goal: '3★ a até 30 cm do centro · 2★ a até 90 cm · 1★ na casa',
    grade(res) {
      const s = last(res);
      const d = s.out ? Infinity : distToButton(s);
      return { stars: d <= 0.3 ? 3 : d <= 0.9 ? 2 : in12(d) ? 1 : 0, score: -Math.min(d, 50) };
    },
  },
  {
    name: 'Guarda central', throws: 1, stones: [],
    desc: 'Pare a pedra entre a linha de hog e a casa, bem na frente do botão.',
    goal: '3★ a até 25 cm da linha do meio · 2★ até 60 cm · 1★ na zona de guarda',
    grade(res) {
      const s = last(res);
      if (!guardZone(s)) return { stars: 0, score: -50 - (s.out ? 0 : distToButton(s)) };
      const x = Math.abs(s.x);
      return { stars: x <= 0.25 ? 3 : x <= 0.6 ? 2 : x <= 1.2 ? 1 : 0, score: -x - 0.05 * Math.abs(s.y - (T - 3.5)) };
    },
  },
  {
    name: 'Tira e fica', throws: 1, stones: [[THEM, 0.12, T + 0.15]],
    desc: 'A pedra amarela está no botão. Tire ela e deixe a sua na casa.',
    goal: '3★ tirou e a sua ficou no anel vermelho · 2★ tirou e ficou na casa · 1★ tirou',
    grade(res) {
      const gone = outCount(res, THEM) === 1;
      const d = myBest(res);
      const stars = !gone ? 0 : in4(d) ? 3 : in12(d) ? 2 : 1;
      return { stars, score: stars * 10 - (Number.isFinite(d) ? d : 5) };
    },
  },
  {
    name: 'Dois de uma vez', throws: 1, stones: [[THEM, -0.55, T - 0.25], [THEM, 0.45, T + 0.55]],
    desc: 'Duas amarelas na casa e só uma pedra sua. Tire as duas com uma batida só.',
    goal: '3★ tirou as duas e a sua ficou em jogo · 2★ tirou as duas · 1★ tirou uma',
    grade(res) {
      const n = outCount(res, THEM);
      const mine = !last(res).out;
      const stars = n === 2 ? (mine ? 3 : 2) : n === 1 ? 1 : 0;
      return { stars, score: stars * 10 + (mine ? 1 : 0) - startOf(res, THEM).reduce((a, s0) => a + Math.max(0, 3 - moved(res, s0)), 0) * 0.1 };
    },
  },
  {
    name: 'Contorne a guarda', throws: 1, stones: [[THEM, -0.3, T - 3.4]],
    desc: 'Tem uma guarda amarela no meio. Use a curva para dar a volta e parar atrás dela.',
    goal: '3★ no anel vermelho · 2★ no anel branco do meio · 1★ na casa (sem mexer na guarda)',
    grade(res) {
      const g = res.start[0];
      const ok = moved(res, g) < 0.05;
      const d = myBest(res);
      const stars = !ok ? 0 : in4(d) ? 3 : in8(d) ? 2 : in12(d) ? 1 : 0;
      return { stars, score: (ok ? 0 : -20) - Math.min(d, 20) };
    },
  },
  {
    name: 'Promoção', throws: 1, stones: [[ME, 0.15, T - 2.6], [THEM, 0.75, T + 0.35]],
    desc: 'Sua pedra está curta, na frente da casa. Bata nela de leve e empurre ela até o botão.',
    goal: '3★ a pedra empurrada parou no anel vermelho · 2★ no anel branco do meio · 1★ na casa',
    grade(res) {
      const p = find(res, res.start[0].id);
      const d = p.out ? Infinity : distToButton(p);
      const stars = in4(d) ? 3 : in8(d) ? 2 : in12(d) ? 1 : 0;
      return { stars, score: -Math.min(d, 20) };
    },
  },
  {
    name: 'Encostar', throws: 1, stones: [[THEM, -0.1, T + 0.05]],
    desc: 'Pare a sua pedra encostada na frente da amarela (o "congelamento"), sem tirar ela.',
    goal: '3★ a até 8 cm dela · 2★ a até 30 cm · 1★ na casa',
    grade(res) {
      const s = last(res), o = find(res, res.start[0].id);
      if (s.out) return { stars: 0, score: -50 };
      const gap = o.out ? 99 : Math.hypot(s.x - o.x, s.y - o.y) - 2 * STONE_R;
      const front = s.y < o.y;
      const d = distToButton(s);
      const stars = gap <= 0.08 && front && in12(d) ? 3 : gap <= 0.3 && in12(d) ? 2 : in12(d) ? 1 : 0;
      return { stars, score: -Math.min(gap, 20) - (front ? 0 : 0.5) };
    },
  },
  {
    name: 'Limpar a casa', throws: 2, stones: [[THEM, -0.65, T - 0.35], [THEM, 0.55, T + 0.3], [THEM, 0.05, T + 1.05]],
    desc: 'Três amarelas na casa e duas pedras suas. Tire o máximo que puder.',
    goal: '3★ tirou as três · 2★ tirou duas · 1★ tirou uma',
    grade(res) {
      const n = outCount(res, THEM);
      return { stars: Math.min(3, n), score: n * 10 + res.thrown.filter(t => !find(res, t.id).out).length };
    },
  },
  {
    name: 'Último arremesso', throws: 1, stones: [[THEM, 0.25, T + 0.1], [ME, -0.75, T + 0.35], [THEM, 0.45, T - 3.6], [THEM, -1.25, T + 0.9]],
    desc: 'Última pedra do end. A amarela está no botão. Tire ela ou pare mais perto e marque.',
    goal: '3★ marcou 2 · 2★ marcou 1 · 1★ ninguém marcou',
    grade(res) {
      const sc = scoreEnd(res.stones);
      const stars = sc.team === ME ? (sc.points >= 2 ? 3 : 2) : sc.team === -1 ? 1 : 0;
      return { stars, score: (sc.team === ME ? sc.points : sc.team === -1 ? 0 : -sc.points) * 10 - (Number.isFinite(myBest(res)) ? myBest(res) : 3) };
    },
  },
  {
    name: 'Atrás da guarda', throws: 1, stones: [[THEM, -0.25, T - 0.35], [THEM, -0.2, T - 3.9]],
    desc: 'A amarela da casa está escondida atrás de uma guarda. Curve em volta e tire ela.',
    goal: '3★ tirou e a sua ficou na casa · 2★ tirou · 1★ mexeu nela mais de 40 cm',
    grade(res) {
      const t = res.start[0];
      const gone = find(res, t.id).out || !inHouse(find(res, t.id));
      const d = myBest(res);
      const stars = gone ? (in12(d) ? 3 : 2) : moved(res, t) > 0.4 ? 1 : 0;
      return { stars, score: stars * 10 + Math.min(moved(res, t), 5) - (Number.isFinite(d) ? d * 0.1 : 0.5) };
    },
  },
];

// Monta as pedras iniciais de um desafio.
export function setupChallenge(ch) {
  const stones = ch.stones.map(([team, x, y]) => makeStone(team, x, y));
  return { stones, start: stones.map(s => ({ id: s.id, team: s.team, x: s.x, y: s.y })), thrown: [] };
}

export function gradeChallenge(ch, res) {
  return ch.grade(res);
}

// Candidatas a mais para o robô dos desafios: alvos de parada numa grade fina e batidas
// em cada pedra com vários desvios e forças.
function extraCandidates(stones) {
  const list = [];
  for (const spin of [SPIN_NOM, -SPIN_NOM]) {
    for (let x = -1.6; x <= 1.6 + 1e-9; x += 0.2) for (let y = T - 5; y <= T + 1.6 + 1e-9; y += 0.2) {
      list.push({ kind: 'draw', target: { x, y }, ...drawShot({ x, y }, spin) });
    }
    for (const s of stones) {
      if (s.out) continue;
      const dx = s.x - RELEASE.x, dy = s.y - RELEASE.y, L = Math.hypot(dx, dy);
      const px = dy / L, py = -dx / L;
      for (const extra of [0.6, 1.2, 2, 3.5, 6, 10, 16]) {
        const speed = speedForDistance(L + extra, spin).v;
        for (let off = -0.26; off <= 0.26 + 1e-9; off += 0.04) {
          const shot = throughShot({ x: s.x + px * off, y: s.y + py * off }, speed, spin);
          if (shot) list.push({ kind: 'hit', target: { x: s.x, y: s.y }, ...shot });
        }
      }
    }
  }
  return list;
}

// Melhor jogada para a próxima pedra do desafio (sem erro de mão). res = situação atual.
export function* bestChallengeShotGen(ch, res) {
  const pool = [...candidates(res.stones, ME, 'mestre'), ...extraCandidates(res.stones)];
  let best = null;
  for (const shot of pool) {
    const t = trial(res.stones, ME, shot);
    const g = ch.grade({ ...res, stones: t.stones, thrown: [...res.thrown, t.stone] });
    const key = g.stars * 1000 + g.score;
    if (!best || key > best.key) best = { key, shot, t };
    yield;
  }
  return best;
}
export const bestChallengeShot = (ch, res) => drain(bestChallengeShotGen(ch, res));

// Robô: para cada pedra, testa todas as candidatas e fica com a de melhor nota.
// Devolve { stars, score, shots, res }.
export function solveChallenge(ch) {
  const res = setupChallenge(ch);
  const shots = [];
  for (let k = 0; k < ch.throws; k++) {
    const best = bestChallengeShot(ch, res);
    shots.push(best.shot);
    res.stones = best.t.stones;
    res.thrown.push(best.t.stone);
  }
  return { ...ch.grade(res), shots, res };
}

export { cloneStones };
