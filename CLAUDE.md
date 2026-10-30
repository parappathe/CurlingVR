# CurlingVR

Pedra no Gelo: curling em VR para o Meta Quest 3 no navegador (WebXR), sem instalar nada. Pista
oficial (45,72 m, casa de 1,83 m de raio, linhas de hog, tee e fundo) num lago congelado ao
entardecer, com montanhas, pinheiros, varal de luzinhas, arquibancada com plateia, cabana e placar
de madeira. Você segura a pedra de granito, empurra e solta; a força da mão vira a velocidade da
pedra e o giro do pulso na hora de soltar decide para que lado ela curva no fim. Depois acompanha a
pedra deslizando e varre o gelo na frente dela com o controle (que vira vassoura). Partida de 4 ends
contra o computador (3 adversários) e modo desafio com 10 situações e 3 estrelas. Também joga no PC
com mouse e teclado. Tudo em português.

## Como rodar / jogar

**No Quest:** abrir no navegador do óculos **https://parappathe.github.io/CurlingVR/** (ou a página
inicial https://parappathe.github.io/) e apertar "Entrar em VR". Para atualizar o site: commitar e
rodar `python publicar.py CurlingVR` na pasta `C:\claude code`. (Ainda não publicado.)

**No PC:** `python serve.py` nesta pasta e abrir `http://localhost:8813` (o painel de visualização usa
`.claude/launch.json`). O `serve.py` manda o navegador não guardar cache; `python serve.py --https`
serve para abrir no Quest pela rede de casa (porta 8443).

### Controles

| | VR (Quest) | PC |
|---|---|---|
| Pegar a pedra | Botão lateral (aperto) com a mão a até 60 cm da pedra e abaixo de 1,25 m de altura (o anel no gelo fica verde quando dá). A pedra segue a mão no plano do gelo | |
| Lançar | Empurrar para a frente e soltar o aperto. Velocidade da pedra = velocidade da mão × 2. Soltou devagar: a pedra fica parada e dá para pegar de novo | Arrastar o mouse para trás e soltar: a distância dá a força (a barra mostra guarda, casa e tirada); arrastar para um lado mira para o outro |
| Giro (curl) | Girar o pulso nos últimos 0,3 s antes de soltar: para a direita (horário) a pedra curva para a direita | Rodinha (5 passos: anti-horário, meio, sem giro, meio, horário) ou Q (anti-horário) / E (horário) |
| Varrer | O controle vira vassoura: encostar a cabeça dela no gelo logo na frente da pedra e esfregar rápido | Segurar Espaço ou mexer o mouse rápido |
| Acelerar o tempo (×3) | Segurar o gatilho | Segurar Shift |
| Pausa | B ou Y | Esc ou P |
| Menu | Apontar com o controle e gatilho | Clique |
| Só com as mãos | Pinça perto da pedra pega; soltar a pinça lança | |
| FPS | Menu → FPS | Tecla F |

No VR: na sua vez você fica entre a casa de perto e a linha de hog, com a pedra no gelo à sua frente
e um telão (vista de cima da casa de longe) à direita. Depois de soltar, a câmera desliza junto com a
pedra (você fica ao lado esquerdo dela), com vinheta de conforto (Menu → Vinheta: forte, fraca ou
não). Na vez do computador você assiste de trás da casa de longe. Cada troca de lugar escurece a tela
rapidinho. "Recentralizar" (na pausa) põe você de novo virado para a pista.

### Regras

- 4 ends de 4 pedras para cada lado, alternadas; quem não tem o martelo lança primeiro. Sorteio do
  martelo no primeiro end; quem marca perde o martelo; end em branco mantém. Empatou depois de 4 ends:
  um end extra; empatou de novo: empate.
- Pontuação oficial: conta só pedra encostando na casa (anel de 1,83 m); quem tem a mais perto do
  botão marca 1 por pedra mais perto que a melhor do adversário.
- Regra do hog: soltar a pedra depois da linha de hog de perto anula a pedra; pedra que não passa
  inteira da linha de hog do outro lado sai, a não ser que tenha batido numa pedra em jogo.
- Pedra que encosta na lateral ou passa inteira da linha de fundo sai.
- Adversários (em `js/ai.js`): **Dona Cida** (cautelosa: põe pedra na casa, quase nunca tira, erra
  mais), **Tonhão** (agressivo: tira as suas pedras com força), **Mestre Yuki** (mestre: protege com
  guardas, escolhe jogada que dá certo mesmo errando um pouco, quase não erra e varra bem).
- Desafios (em `js/challenges.js`): 1 Na mosca, 2 Guarda central, 3 Tira e fica, 4 Dois de uma vez,
  5 Contorne a guarda, 6 Promoção, 7 Encostar, 8 Limpar a casa (2 pedras), 9 Último arremesso,
  10 Atrás da guarda. Cada um diz a meta das 3 estrelas. Passar um (1 estrela) libera o próximo.
- Progresso salvo no navegador (localStorage, chave `curlingvr.v1`): vitórias e partidas por
  adversário, estrelas por desafio, som, FPS e vinheta.

## Como testar

- `node tests/run.js` (ou `npm test`): física (pedra para sozinha, tempo realista, curl muda de lado
  com o giro e é simétrico, giro fraco curva menos, varrer leva mais longe e, parando no mesmo ponto,
  curva menos, caminho lançado de lado é o mesmo girado), batidas (momento conservado de frente e de
  lado, perde um pouco de energia, não atravessa a 8 m/s, não ficam uma dentro da outra), fora de
  jogo (fundo, lateral), regra do hog (curta sai, curta que bateu fica, soltou depois da hog é anulada),
  pontuação (vários casos), partida (ordem alternada, martelo, 4 ends, end extra, modo desafio), robô
  põe pedra na casa vazia, IA agressiva bate na pedra do botão, tempo de pensar da mestre, robô
  resolve os 10 desafios (mostra as estrelas e a jogada), e Mestre Yuki contra Dona Cida em 7 partidas
  (tem que ganhar a maioria; mostra os placares). Tem que terminar com "Tudo certo" (sai com código 1
  se algo falhar). Não toca som. Leva uns 15 s.
- No navegador (console): `dev.autoplay = true` faz o robô jogar por você (e as partidas seguem
  sozinhas entre os ends), `dev.advance(20)` avança 20 s na hora, `dev.state()` mostra tela, fase,
  end, placar e pedras, `dev.loadLevel(3)` abre o desafio 3 (1 a 10), `dev.startMatch(2)` começa
  partida contra o adversário 2 (1 a 3), `dev.resetSave()` apaga o progresso. `window.curling` tem
  `match`, `save`, `camera`, `scene`, `renderer`.
- **Só dá para testar no óculos:** pegar e empurrar a pedra, a força da mão (multiplicador 2),
  o giro do pulso, varrer com o controle, o deslize da câmera e a vinheta, a altura da pedra para
  pegar, vibração, rastreamento de mãos, telão e FPS.

## Estrutura

| Arquivo | O que tem |
|---|---|
| `index.html`, `css/style.css` | Página, botão "Entrar em VR", placar, dica e barra de força do PC |
| `js/physics.js` | Medidas oficiais da pista (`SHEET`), pedra (`STONE_R`), passo fixo (`DT` = 1/100 s), atrito, curl, varrida, batida pedra contra pedra, saída pela lateral e pelo fundo, `simulate`. Sem navegador |
| `js/match.js` | `Match`: ordem das pedras, martelo, regra do hog, pontuação (`scoreEnd`), ends, end extra, modo desafio (`solo`). Sem navegador |
| `js/ai.js` | Adversários (`OPPONENTS`) e robô (`ROBOT`), caminho livre (tabela de paradas por velocidade), jogadas candidatas (casa, guarda, encostar, contornar, batidas leves/fortes com desvios), avaliação por estilo, escolha em passos (`chooseShotGen`), erro de mão, varrida da IA. Sem navegador |
| `js/challenges.js` | Os 10 desafios (pedras iniciais, meta e nota) e o robô que resolve (`solveChallenge`, `bestChallengeShotGen`). Sem navegador |
| `js/main.js` | Liga tudo: render, VR (pegar/empurrar/soltar, giro do pulso, vassouras, câmera que acompanha a pedra, vinheta, escurecer), mouse/teclado, turnos, menus, HUD, telão, sons, `dev` |
| `js/scene.js` | Lago, céu, montanhas e pinheiros, pista (gelo transparente com reflexo das pedras e das luzinhas), casas e linhas, tabelas, neve, varal de luzinhas, arquibancada com plateia, cabana, pedras por instâncias, placar de madeira, vassoura |
| `js/ui.js` | Painel de menu 3D em canvas e placas de texto |
| `js/audio.js` | Sons sintetizados: ronco da pedra, batida de granito, tabela, vassoura, plateia (murmúrio, aplauso, "ohhh"), buzina de fim de end |
| `js/save.js` | Progresso e opções salvos |
| `tests/run.js` | Testes |
| `serve.py` | Servidor local sem cache (porta 8813, `--https` para o Quest) |
| `vendor/three/three.module.js` | Three.js r170 (cópia local) |

Coordenadas: a física usa a pista em metros, x = lado (0 = linha do meio, + = direita de quem lança)
e y = ao longo da pista (0 = tee da casa de perto, tee da casa de longe em 34,75). No mundo do
Three.js isso vira (x, 0, -y): o gelo fica em y = 0 e a pista vai para -z. Ponto de soltura da IA,
do PC e dos desafios: (0; 2,0).

## Regras e convenções do projeto

- `physics.js`, `match.js`, `ai.js` e `challenges.js` não podem usar navegador nem Three.js: os
  testes rodam no Node.
- Mexeu em física, regras, IA ou desafios: rodar `node tests/run.js`. Desafio novo ou mudado: o robô
  tem que resolver (o teste mostra as estrelas).
- A IA no navegador pensa em pedaços de até 6 ms por quadro (`chooseShotGen` é um gerador): nada de
  cálculo pesado de uma vez só, que trava a imagem no óculos.
- Testes nunca tocam som.

## Decisões

- Física própria (sem biblioteca): pedras como discos, passo fixo de 1/100 s, desaceleração de
  0,2 m/s² (um pouco maior quando a pedra está quase parando), pedra de casa sai a ~3,7 m/s e leva
  ~17 s. Curl perpendicular à velocidade e maior com a pedra lenta (~1,3 m de curva numa pedra de
  casa); por isso o caminho lançado torto é só o caminho reto girado, o que a IA usa para mirar
  rápido. Giro morre junto com a velocidade.
- Varrer tira até 30% do atrito e 55% da curva, só na zona logo na frente da pedra (até 1,7 m,
  meia largura de 0,5 m), proporcional à velocidade da vassoura.
- Batida quase elástica (coeficiente 0,88), mesma massa: momento conservado. A pedra atingida sai
  sem curl; a que bateu perde a maior parte.
- No VR a velocidade da pedra é a da mão × 2: no curling de verdade o corpo inteiro desliza com a
  pedra a partir do apoio; só com o braço uma pedra de casa (3,7 m/s) seria impossível. O jogador
  fica entre a casa de perto e a hog (como se já tivesse deslizado do apoio).
- Direção do lançamento no VR limitada a ±8,6° e giro a ±2 rad/s, para o tremido da mão não estragar.
- Sem regra da zona de guarda livre (com só 4 pedras por lado ela quase não muda nada).
- IA: gera ~100 a 250 jogadas candidatas, simula cada uma na física de verdade e avalia pelo estilo;
  a mestre reavalia as 10 melhores com o erro de mão dela (prefere jogada segura). Erro de mão por
  nível (velocidade/ângulo): Dona Cida 0,06 m/s e 0,0065 rad; Tonhão 0,035 e 0,004; Mestre Yuki 0,016
  e 0,0022. A IA varre quando prevê que a pedra vai ficar curta ou curvar demais.
- Câmera que acompanha a pedra no VR é só translação (sem girar), suave, com vinheta conforme a
  velocidade; trocas de lugar com escurecer rápido.
- Reflexo do gelo sem renderizar a cena duas vezes: o gelo é semitransparente e embaixo dele ficam
  cópias espelhadas das pedras e das lâmpadas. Pedras e lâmpadas por instâncias, cenário mesclado,
  2 luzes sem sombra (sombras de contato pintadas), pixelRatio 1 e foveação no Quest. O telão é
  uma câmera de cima da casa numa textura pequena (288×540), atualizada a cada 3 quadros no Quest.
- PC: barra de força com curva (mais precisão nas velocidades de casa), de 2,8 a 6,4 m/s.
- Porta do servidor local 8813.

## Pendências / problemas conhecidos

- Nada testado no Quest ainda: pegar/empurrar a pedra, multiplicador da mão, leitura do giro do
  pulso (sentido e força), vassoura no gelo (comprimento 1,3 m, ângulo), conforto do deslize e da
  vinheta, altura para pegar a pedra, telão, vibração, rastreamento de mãos, FPS.
- Os valores de sensibilidade do VR (multiplicador 2, giro = 0,45 × velocidade do pulso, limite de
  ângulo) foram escolhidos no papel e podem precisar de ajuste depois de jogar.
- A dificuldade dos adversários foi calibrada só com IA contra IA; contra gente pode estar fácil ou
  difícil demais.
- Ainda não publicado no site nem listado na tabela de projetos da pasta raiz (`C:\claude code\CLAUDE.md`)
  nem no `SiteJogos`.
