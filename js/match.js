// Regras e placar de uma partida de curling. Sem navegador nem Three.js.
import { SHEET, STONE_R, DT, RELEASE, makeStone, launch, stepStones, allStopped, distToButton, inHouse, pastFarHog } from './physics.js';

export const PLAYER = 0, CPU = 1;
export const TEAM_NAMES = ['Você', 'Computador'];

// Pontuação oficial: quem tem a pedra mais perto do botão marca 1 por pedra mais perto
// que a melhor do adversário. Só conta pedra na casa (encostando no anel de 1,83 m).
export function scoreEnd(stones) {
  const inH = stones.filter(inHouse).sort((a, b) => distToButton(a) - distToButton(b));
  if (!inH.length) return { team: -1, points: 0 };
  const team = inH[0].team;
  const other = inH.find(s => s.team !== team);
  const lim = other ? distToButton(other) : Infinity;
  return { team, points: inH.filter(s => s.team === team && distToButton(s) < lim).length };
}

// Regra do hog para a pedra lançada, depois que tudo parou: se não passou inteira da linha de
// hog do outro lado e não bateu em nenhuma pedra em jogo, sai.
export function applyHogRule(stone) {
  if (!stone || stone.out) return false;
  if (!pastFarHog(stone) && !stone.hit) { stone.out = true; return true; }
  return false;
}

export class Match {
  // hammer: time que lança a última pedra do primeiro end (o martelo).
  // solo: modo desafio (só o jogador lança, perTeam pedras, sem placar).
  constructor({ ends = 4, perTeam = 4, hammer = CPU, extraEnds = 1, solo = false } = {}) {
    this.solo = solo;
    this.ends = ends; this.perTeam = perTeam; this.extraEnds = extraEnds;
    this.hammer = hammer;
    this.end = 0;                 // end atual (0 = primeiro)
    this.scores = [[], []];       // pontos por end
    this.stones = [];
    this.thrown = 0;              // pedras lançadas neste end
    this.phase = 'aim';           // 'aim' | 'moving' | 'settled' | 'endover' | 'over'
    this.current = null;          // pedra lançada agora
    this.events = [];
    this.lastEnd = null;          // { team, points } do último end
    this.t = 0;
  }

  get totalEnds() { return this.scores[0].length; }
  total(team) { return this.scores[team].reduce((a, b) => a + b, 0); }
  get turnTeam() { if (this.solo) return PLAYER; const first = 1 - this.hammer; return this.thrown % 2 === 0 ? first : this.hammer; }
  // pedras que ainda faltam lançar neste end (para cada time)
  left(team) {
    if (this.solo) return team === PLAYER ? this.perTeam - this.thrown : 0;
    const first = 1 - this.hammer;
    const thrownBy = team === first ? Math.ceil(this.thrown / 2) : Math.floor(this.thrown / 2);
    return this.perTeam - thrownBy;
  }
  get inPlay() { return this.stones.filter(s => !s.out); }
  get isLastStone() { return this.thrown === (this.solo ? this.perTeam : 2 * this.perTeam) - 1; }

  // Lança a pedra do time da vez. x, y: onde a pedra foi solta (padrão: ponto de soltura).
  deliver({ speed, angle, spin, x = RELEASE.x, y = RELEASE.y }) {
    if (this.phase !== 'aim') return null;
    const s = makeStone(this.turnTeam, x, y);
    launch(s, speed, angle, spin);
    this.stones.push(s);
    this.current = s;
    this.t = 0;
    if (y + STONE_R > SHEET.nearHog) {
      // queimou a linha de hog: soltou depois dela
      s.out = true; s.moving = false; s.vx = s.vy = 0;
      this.events.push({ type: 'hogRelease', id: s.id });
      this.phase = 'settled';
    } else this.phase = 'moving';
    return s;
  }

  // Avança a física. sweep: { id, s } (intensidade 0..1 na pedra que está sendo varrida).
  step(dt = DT, sweep = null) {
    if (this.phase !== 'moving') return;
    stepStones(this.stones, dt, sweep, this.events);
    this.t += dt;
    if (allStopped(this.stones) || this.t > 120) {
      for (const s of this.stones) { s.moving = false; s.vx = s.vy = 0; }
      if (applyHogRule(this.current)) this.events.push({ type: 'hog', id: this.current.id });
      this.phase = 'settled';
      this.events.push({ type: 'settled' });
    }
  }

  // Depois que tudo parou: próxima pedra, ou fecha o end.
  next() {
    if (this.phase !== 'settled') return;
    this.thrown++;
    this.current = null;
    if (this.solo) { this.phase = this.thrown < this.perTeam ? 'aim' : 'over'; return; }
    if (this.thrown < 2 * this.perTeam) { this.phase = 'aim'; return; }
    const sc = scoreEnd(this.stones);
    this.scores[0].push(sc.team === 0 ? sc.points : 0);
    this.scores[1].push(sc.team === 1 ? sc.points : 0);
    if (sc.team >= 0) this.hammer = 1 - sc.team;   // quem marcou perde o martelo; end em branco mantém
    this.lastEnd = sc;
    this.events.push({ type: 'end', ...sc });
    const played = this.scores[0].length;
    const tied = this.total(0) === this.total(1);
    if (played >= this.ends && (!tied || played >= this.ends + this.extraEnds)) this.phase = 'over';
    else this.phase = 'endover';
  }

  startNextEnd() {
    if (this.phase !== 'endover') return;
    this.end++;
    this.stones = [];
    this.thrown = 0;
    this.phase = 'aim';
  }

  get winner() {
    if (this.phase !== 'over') return null;
    const a = this.total(0), b = this.total(1);
    return a > b ? 0 : b > a ? 1 : -1;
  }
}
