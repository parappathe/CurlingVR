// Testes automáticos: node tests/run.js (ou npm test). Não tocam som nem usam navegador.
import { SHEET, STONE_R, DT, RELEASE, SPIN_NOM, makeStone, launch, stepStones, simulate, distToButton, inHouse, speedOf } from '../js/physics.js';
import { Match, scoreEnd, applyHogRule, PLAYER, CPU } from '../js/match.js';
import { OPPONENTS, ROBOT, rng, chooseShot, drawShot, execute, playTurnInstant, matchContext } from '../js/ai.js';
import { CHALLENGES, solveChallenge, setupChallenge } from '../js/challenges.js';

let fails = 0, count = 0;
function ok(cond, msg) {
  count++;
  if (!cond) { fails++; console.log('  FALHOU:', msg); }
}
const T = SHEET.tee;
const throwOne = (speed, angle, spin, sweep = 0) => {
  const s = makeStone(0, RELEASE.x, RELEASE.y);
  launch(s, speed, angle, spin);
  const t = simulate([s], { sweep: sweep ? { id: s.id, s: sweep } : null });
  return { s, t };
};

console.log('Física');
{
  const { s, t } = throwOne(3.7, 0, SPIN_NOM);
  ok(!s.moving && speedOf(s) === 0, 'pedra para sozinha');
  ok(t > 10 && t < 30, `tempo de deslize realista (${t.toFixed(1)} s)`);
  ok(s.y > T - 3 && s.y < T + 3, `velocidade de casa (3,7 m/s) chega perto da casa (parou em y=${s.y.toFixed(2)}, tee em ${T.toFixed(2)})`);
  const cw = throwOne(3.7, 0, SPIN_NOM).s, ccw = throwOne(3.7, 0, -SPIN_NOM).s, none = throwOne(3.7, 0, 0).s;
  ok(cw.x > 0.5 && ccw.x < -0.5, `giro horário curva para a direita e anti-horário para a esquerda (${cw.x.toFixed(2)} / ${ccw.x.toFixed(2)})`);
  ok(Math.abs(none.x) < 1e-6, 'sem giro vai reta');
  ok(Math.abs(cw.x + ccw.x) < 1e-6, 'curva simétrica');
  const weak = throwOne(3.7, 0, SPIN_NOM * 0.3).s;
  ok(weak.x > 0 && weak.x < cw.x, 'giro fraco curva menos');
  const sw = throwOne(3.7, 0, SPIN_NOM, 1).s;
  ok(sw.y > cw.y + 2, `varrer leva mais longe (${(sw.y - cw.y).toFixed(2)} m a mais)`);
  const swHalf = throwOne(3.7, 0, SPIN_NOM, 0.5).s;
  ok(swHalf.y > cw.y && swHalf.y < sw.y, 'varrer mais forte leva mais longe');
  // curva comparada na mesma distância: varrida que para no mesmo ponto curva menos
  const base = throwOne(3.7, 0, SPIN_NOM).s;
  let lo = 2.5, hi = 3.7;
  for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (throwOne(m, 0, SPIN_NOM, 1).s.y < base.y) lo = m; else hi = m; }
  const swSame = throwOne(lo, 0, SPIN_NOM, 1).s;
  ok(Math.abs(swSame.y - base.y) < 0.05 && swSame.x < base.x * 0.8, `varrida curva menos (${swSame.x.toFixed(2)} contra ${base.x.toFixed(2)} m)`);
  // aceleração dos ângulos: lançada torta, a curva acompanha a direção (o caminho só gira)
  const a1 = throwOne(3.7, 0.03, SPIN_NOM).s;
  const rx = base.x * Math.cos(0.03) + (base.y - RELEASE.y) * Math.sin(0.03);
  ok(Math.abs(a1.x - rx) < 1e-3, 'caminho lançado de lado é o mesmo, girado');
}

console.log('Batidas');
{
  // batida de frente: quase toda a velocidade passa para a parada
  const a = makeStone(0, 0, 20), b = makeStone(1, 0, 22);
  launch(a, 2, 0, 0);
  const st = [a, b], ev = [];
  let before = null;
  for (let i = 0; i < 2000 && !ev.length; i++) { before = [a.vx + b.vx, a.vy + b.vy, a.vx ** 2 + a.vy ** 2 + b.vx ** 2 + b.vy ** 2]; stepStones(st, DT, null, ev); }
  ok(ev.length === 1 && ev[0].type === 'hit', 'bateu');
  const after = [a.vx + b.vx, a.vy + b.vy, a.vx ** 2 + a.vy ** 2 + b.vx ** 2 + b.vy ** 2];
  ok(Math.abs(after[1] - before[1]) / before[1] < 0.02 && Math.abs(after[0]) < 1e-9, `momento conservado na batida de frente (${before[1].toFixed(3)} → ${after[1].toFixed(3)})`);
  ok(after[2] < before[2] && after[2] > 0.7 * before[2], 'perde um pouco de energia');
  ok(speedOf(b) > 1.6 && speedOf(a) < 0.2, `a parada sai com quase tudo (${speedOf(b).toFixed(2)} m/s), a que bateu quase para (${speedOf(a).toFixed(2)})`);
  // batida de lado
  const c = makeStone(0, 0, 20), d = makeStone(1, 0.15, 22);
  launch(c, 2.5, 0, SPIN_NOM);
  const ev2 = [];
  let pb = null;
  for (let i = 0; i < 2000 && !ev2.length; i++) { pb = [c.vx + d.vx, c.vy + d.vy]; stepStones([c, d], DT, null, ev2); }
  const pa = [c.vx + d.vx, c.vy + d.vy];
  ok(Math.hypot(pa[0] - pb[0], pa[1] - pb[1]) / Math.hypot(...pb) < 0.02, 'momento conservado na batida de lado');
  ok(d.vx > 0 && c.vx < 0, 'de lado: cada uma vai para um lado');
  simulate([c, d]);
  ok(Math.hypot(c.x - d.x, c.y - d.y) >= 2 * STONE_R - 1e-6, 'pedras não ficam uma dentro da outra');
  // não atravessa em alta velocidade
  const e = makeStone(0, 0, 10), f = makeStone(1, 0, 25);
  launch(e, 8, 0, 0);
  simulate([e, f]);
  ok(f.y > 26 || f.out, 'batida a 8 m/s não atravessa');
}

console.log('Fora de jogo');
{
  const s = makeStone(0, RELEASE.x, RELEASE.y);
  launch(s, 6, 0, 0);
  const ev = [];
  simulate([s], { events: ev });
  ok(s.out && ev.some(e => e.type === 'out' && e.why === 'fundo'), 'passou da linha de fundo: sai');
  const l = makeStone(0, RELEASE.x, RELEASE.y);
  launch(l, 3.7, 0.08, 0);
  simulate([l]);
  ok(l.out, 'encostou na lateral: sai');
}

console.log('Regra do hog');
{
  const m = new Match({ hammer: CPU });
  m.deliver({ speed: 2.6, angle: 0, spin: SPIN_NOM });
  while (m.phase === 'moving') m.step();
  ok(m.stones[0].out && m.events.some(e => e.type === 'hog'), `pedra fraca que não passa da hog do outro lado sai (parou em ${m.stones[0].y.toFixed(1)})`);
  // fraca, mas bateu numa pedra em jogo: fica
  const m2 = new Match({ hammer: CPU });
  const g = makeStone(CPU, 0.0, SHEET.farHog + 0.3);
  m2.stones.push(g);
  m2.deliver({ speed: 3.45, angle: 0, spin: 0 });
  while (m2.phase === 'moving') m2.step();
  const s2 = m2.stones[1];
  ok(s2.hit && !s2.out && s2.y - STONE_R <= SHEET.farHog, `bateu em pedra em jogo e parou antes da hog: fica (y=${s2.y.toFixed(2)})`);
  const m3 = new Match({ hammer: CPU });
  m3.deliver({ speed: 3.7, angle: 0, spin: 0, y: SHEET.nearHog + 0.1 });
  ok(m3.stones[0].out && m3.events.some(e => e.type === 'hogRelease') && m3.phase === 'settled', 'soltou depois da linha de hog: pedra anulada');
  const st = makeStone(0, 0, SHEET.farHog + STONE_R + 0.01);
  ok(!applyHogRule(st) && !st.out, 'passou inteira da hog: fica');
}

console.log('Pontuação');
{
  const P = (team, x, dy) => makeStone(team, x, T + dy);
  ok(scoreEnd([]).team === -1, 'casa vazia: ninguém marca');
  let sc = scoreEnd([P(0, 0, 0.1), P(0, 0.5, 0), P(1, 0.9, 0), P(0, 1.2, 0)]);
  ok(sc.team === 0 && sc.points === 2, `2 suas mais perto que a melhor deles (${sc.points})`);
  sc = scoreEnd([P(1, 0, 0.2), P(0, 0.4, 0), P(1, 0.6, 0.3), P(1, 1.0, 0)]);
  ok(sc.team === 1 && sc.points === 1, 'adversário marca 1');
  sc = scoreEnd([P(0, 0, 0.1), P(0, 0.3, 0.3), P(0, -0.6, 0), P(0, 0, -1.2)]);
  ok(sc.team === 0 && sc.points === 4, 'quatro na casa sem adversária: 4');
  sc = scoreEnd([P(0, 0, SHEET.r12 + STONE_R - 0.01), P(1, 0, -(SHEET.r12 + STONE_R + 0.02))]);
  ok(sc.team === 0 && sc.points === 1, 'pedra só encostando no anel de fora conta; a que não encosta não');
  const out = P(1, 0, 0); out.out = true;
  sc = scoreEnd([out, P(0, 1.0, 0)]);
  ok(sc.team === 0 && sc.points === 1, 'pedra fora de jogo não conta');
  sc = scoreEnd([P(0, 0, 3), P(1, 2.0, 0)]);
  ok(sc.team === -1, 'pedras fora da casa: end em branco');
}

console.log('Partida');
{
  const m = new Match({ hammer: CPU });
  ok(m.turnTeam === PLAYER, 'sem o martelo lança primeiro');
  let order = [];
  for (let i = 0; i < 8; i++) {
    order.push(m.turnTeam);
    m.deliver({ speed: 2.0, angle: 0, spin: 0 });
    while (m.phase === 'moving') m.step();
    m.next();
  }
  ok(order.join('') === '01010101', `ordem alternada (${order.join('')})`);
  ok(m.phase === 'endover' && m.scores[0][0] === 0 && m.scores[1][0] === 0, 'end em branco');
  ok(m.hammer === CPU, 'end em branco: martelo continua');
  m.startNextEnd();
  // jogador põe uma no botão, o resto fraco
  for (let i = 0; i < 8; i++) {
    const shot = i === 0 ? drawShot({ x: 0, y: T }, SPIN_NOM) : { speed: 2.0, angle: 0, spin: 0 };
    m.deliver(shot);
    while (m.phase === 'moving') m.step();
    m.next();
  }
  ok(m.scores[0][1] === 1 && m.hammer === CPU, `roubou 1: o martelo fica com quem não marcou (placar ${m.scores[0][1]}, martelo ${m.hammer})`);
  m.startNextEnd();
  for (let e = 0; e < 2; e++) {
    for (let i = 0; i < 8; i++) { m.deliver({ speed: 2.0, angle: 0, spin: 0 }); while (m.phase === 'moving') m.step(); m.next(); }
    if (m.phase === 'endover') m.startNextEnd();
  }
  ok(m.phase === 'over' && m.winner === PLAYER && m.scores[0].length === 4, '4 ends e o jogador ganha 1 a 0');
  // empate: end extra
  const m2 = new Match({ hammer: CPU });
  for (let e = 0; e < 4; e++) {
    for (let i = 0; i < 8; i++) { m2.deliver({ speed: 2.0, angle: 0, spin: 0 }); while (m2.phase === 'moving') m2.step(); m2.next(); }
    if (m2.phase === 'endover' && e < 3) m2.startNextEnd();
  }
  ok(m2.phase === 'endover' && m2.scores[0].length === 4, 'empatado depois de 4 ends: tem end extra');
  m2.startNextEnd();
  for (let i = 0; i < 8; i++) { m2.deliver({ speed: 2.0, angle: 0, spin: 0 }); while (m2.phase === 'moving') m2.step(); m2.next(); }
  ok(m2.phase === 'over' && m2.winner === -1, 'end extra empatado: termina empatado');
  // modo desafio: só o jogador lança
  const solo = new Match({ solo: true, perTeam: 2 });
  ok(solo.turnTeam === PLAYER && solo.left(PLAYER) === 2, 'desafio: só o jogador lança');
  for (let i = 0; i < 2; i++) { solo.deliver({ speed: 2.0, angle: 0, spin: 0 }); while (solo.phase === 'moving') solo.step(); solo.next(); }
  ok(solo.phase === 'over' && solo.left(PLAYER) === 0, 'desafio termina depois das pedras dele');
}

console.log('Robô e IA');
{
  const r = rng(3);
  let inH = 0;
  for (let k = 0; k < 5; k++) {
    const m = new Match({ hammer: CPU });
    const { stone } = playTurnInstant(m, ROBOT, r);
    if (inHouse(stone)) inH++;
  }
  ok(inH === 5, `robô põe a pedra na casa vazia (${inH} de 5)`);
  // com pedra adversária no botão, a IA agressiva tira
  const st = [makeStone(PLAYER, 0.05, T + 0.1)];
  const shot = chooseShot(st, CPU, { myLeft: 3, oppLeft: 3 }, OPPONENTS[1], rng(5));
  ok(['hit', 'peel', 'tap'].includes(shot.kind), `agressivo bate na pedra do botão (${shot.kind})`);
  const t0 = Date.now();
  chooseShot([makeStone(PLAYER, 0.3, T), makeStone(CPU, -0.5, T - 3), makeStone(PLAYER, 0.9, T + 0.8)], CPU, { myLeft: 2, oppLeft: 2 }, OPPONENTS[2], rng(9));
  const ms = Date.now() - t0;
  ok(ms < 1500, `mestre pensa rápido (${ms} ms)`);
  console.log(`  mestre pensou em ${ms} ms`);
}

console.log('Desafios (o robô resolve todos)');
{
  ok(CHALLENGES.length === 10, '10 desafios');
  for (const [i, ch] of CHALLENGES.entries()) {
    ok(ch.name && ch.desc && ch.goal && ch.throws >= 1, `desafio ${i + 1}: tem nome, texto e meta`);
    const empty = setupChallenge(ch);
    const lost = Object.assign(makeStone(PLAYER, 0, 10), { out: true });
    const g0 = ch.grade({ ...empty, thrown: [lost], stones: [...empty.stones, lost] });
    ok(g0.stars === 0, `desafio ${i + 1}: pedra perdida não ganha estrela`);
    const res = solveChallenge(ch);
    ok(res.stars >= 1, `desafio ${i + 1} (${ch.name}): robô resolve (${res.stars} estrela(s))`);
    console.log(`  ${String(i + 1).padStart(2)}. ${ch.name.padEnd(20)} ${'★'.repeat(res.stars)}${'☆'.repeat(3 - res.stars)}  ${res.shots.map(s => `${s.kind} ${s.speed.toFixed(2)} m/s ${s.spin > 0 ? 'horário' : 'anti-horário'}`).join(' + ')}`);
  }
}

console.log('IA mais forte ganha da mais fraca');
{
  const play = (lvA, lvB, seed) => {
    const r = rng(seed);
    const m = new Match({ hammer: seed % 2 });
    while (m.phase !== 'over') {
      if (m.phase === 'endover') m.startNextEnd();
      const lv = m.turnTeam === 0 ? lvA : lvB;
      playTurnInstant(m, lv, r);
    }
    return m;
  };
  const t0 = Date.now();
  let wins = 0, losses = 0;
  const N = 7;
  const lines = [];
  for (let k = 0; k < N; k++) {
    const m = play(OPPONENTS[2], OPPONENTS[0], 100 + k);
    if (m.winner === 0) wins++; else if (m.winner === 1) losses++;
    lines.push(`${m.total(0)}x${m.total(1)}`);
  }
  console.log(`  Mestre Yuki x Dona Cida em ${N} partidas: ${wins} vitórias, ${losses} derrotas (${lines.join(', ')}) em ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  ok(wins > N / 2, `mestre ganha a maioria (${wins} de ${N})`);
  let w2 = 0;
  const l2 = [];
  for (let k = 0; k < 5; k++) {
    const m = play(OPPONENTS[1], OPPONENTS[0], 200 + k);
    if (m.winner === 0) w2++;
    l2.push(`${m.total(0)}x${m.total(1)}`);
  }
  console.log(`  Tonhão x Dona Cida em 5 partidas: ${w2} vitórias (${l2.join(', ')})`);
}

console.log(fails ? `\n${fails} de ${count} verificações falharam` : `\nTudo certo (${count} verificações)`);
process.exit(fails ? 1 : 0);
