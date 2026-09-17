# Plano de Implementação: Rocks Hero

> App web em HTML, CSS e JavaScript puro para a banda **Rocks Hero** acompanhar quanto cada membro já tirou das músicas de todos os Guitar Hero e montar o set list do show. Plano feito em 16/09/2026.

## 1. Contexto

A banda quer montar o repertório do show a partir das músicas dos jogos Guitar Hero. Para isso precisa ver, música a música, quanto cada integrante já aprendeu, e montar o set list levando em conta afinação e instrumentação. O app vai entregar:

- **Tela Músicas:** uma aba por jogo, com o progresso (%) de cada membro, identificado pelo instrumento.
- **Tela Set List:** as músicas escolhidas com afinação original, mediana da banda, ícones dos instrumentos e ordenação por arrastar e soltar.
- **Visual:** identidade dos Guitar Hero clássicos (GH I a III), com artes originais e o logo da banda.
- **Publicação:** GitHub Pages, com senha única `Hero@123`.

Decisões já tomadas:

| Tema | Decisão |
|---|---|
| Jogos | 13 títulos de console, faixas do disco (com bônus, sem DLC): GH, GH II, Encore: Rocks the 80s, GH III, Aerosmith, World Tour, Metallica, Smash Hits, GH 5, Band Hero, Van Halen, Warriors of Rock e GH Live (sem GHTV) |
| Dados | Sincronização online pelo Firebase, com cópia local para o app abrir rápido e funcionar sem sinal |
| Formação | Vocal, guitarra, baixo e bateria (nomes editáveis no app) |
| Músicas fora dos jogos | Não entram |

## 2. Visão geral

- **Site estático, sem etapa de build no app.** Só `<script>` clássicos (sem ES modules nem `fetch` de JSON local). Assim funciona no GitHub Pages e também abrindo o `index.html` direto. Caminhos relativos e arquivo `.nojekyll`.
- **Firebase Realtime Database + Firebase Auth.**
  - A tela pede só a senha. Por trás, o app entra numa conta única da banda: o e-mail fica fixo no código e a senha `Hero@123` é cadastrada no console do Firebase, fora do código.
  - As regras do banco só liberam leitura e escrita para essa conta. A senha protege os dados de verdade.
- **Local-first.** O estado fica em memória, com cópia no `localStorage` e um diário das edições ainda não enviadas. O app abre na hora, aceita edições sem internet e sincroniza depois.
- **Modo local.** Vale enquanto `js/firebase-config.js` estiver vazio: a senha é conferida por hash SHA-256 e os dados ficam só no navegador. Serve para usar antes de configurar o Firebase; essa trava é só visual e não protege nada.
- **Catálogo.** As listas de músicas vêm da Wikipedia (revisões fixadas). Afinação e instrumentação são preenchidas à mão e podem ser corrigidas no app.

## 3. Estrutura de arquivos

```
Rocks Hero/
├── PLANO-DE-IMPLEMENTACAO.md          # este plano
├── index.html                         # página única: login + rotas #/musicas/<jogo>, #/setlist, #/banda
├── manifest.webmanifest, sw.js        # PWA: abre offline (HTML busca a rede primeiro; demais arquivos saem do cache e se atualizam em segundo plano)
├── .nojekyll, .gitignore, README.md   # README em pt-BR: uso local, Firebase, GitHub Pages
├── firebase.json, database.rules.json # regras do banco + config do emulador
├── css/   fonts.css · base.css (tokens) · components.css · views.css · print.css
├── js/
│   ├── version.js            # APP_VERSION (força baixar arquivos novos + service worker)
│   ├── firebase-config.js    # você preenche; vazio = modo local
│   ├── util.js               # sha256 em JS puro, slug/normalização, mediana, posições fracionárias, ids
│   ├── store.js              # estado, cache, diário, cálculos (mediana, partes descobertas, trocas de afinação)
│   ├── sync-local.js · sync-firebase.js   # mesma interface: login + leitura/escrita
│   ├── icons.js              # sprite SVG inline + máscaras CSS dos instrumentos
│   ├── ui.js                 # toasts, painel inferior (bottom sheet), rock meter, estrelas
│   └── login.js · catalog.js · setlist.js · dnd.js · band.js · app.js (rotas e inicialização)
├── data/
│   ├── songs.js              # GERADO: músicas únicas {id: {t, a, y}}
│   ├── games.js              # GERADO: 13 jogos → tiers → entradas {id, flags}
│   └── song-meta.js          # MANUAL: {id: {tun, tc, ins}}
├── vendor/firebase-rh.js     # SDK do Firebase 12.19.0 (auth + database) empacotado num script clássico
├── assets/
│   ├── fonts/                # woff2 + licenças (OFL / Apache-2.0)
│   ├── logo/                 # rocks-hero.svg, monograma RH, PNG 512/1024, favicon.svg, apple-touch-icon.png
│   └── art/                  # highway, chamas, gemas, plateia, amplificador, emblemas dos jogos (SVG originais)
└── tools/                    # só para desenvolvimento; node_modules fica fora do git
    ├── data/                 # sources.json, fetch-wikitext.mjs, parse.mjs, build-data.mjs, validate.mjs, aliases.json
    ├── firebase-bundle/      # entry.js + script do esbuild
    ├── logo/                 # texto → paths (opentype.js + TTF) e exportação de PNG
    └── tests/                # unit (node:test + vm), rules (REST no emulador), e2e (puppeteer-core + Chrome)
```

## 4. Dados das músicas

### 4.1 Fontes

Wikitext da Wikipedia, baixado com `action=raw` e `oldid` fixo. O README credita a Wikipedia (CC BY-SA 4.0).

| Jogo (id) | Página e seção (oldid) | Faixas | Cuidados no parser |
|---|---|---|---|
| Guitar Hero (`gh1`) | List of songs in Guitar Hero: "Main set list" + "Bonus songs" (1303700204) | 47 | Tier vem em `<span display:none>5.4</span>5. Fret-Burners`. A lista principal é toda de covers da WaveGroup. |
| GH II (`gh2`) | List of songs in Guitar Hero II: Main + Bonus (1367961078) | 74 | Usar a coluna de tier do Xbox 360. Marcar as exclusivas do 360 (tier PS2 `999`/`—` ou nota `b`). Ignorar DLC. |
| Encore: Rocks the 80s (`gh80`) | Guitar Hero Encore: Rocks the 80s, seção Soundtrack (1369065593) | 30 | Sufixo `<br/>Encore`. O título errado "Ain't Nothin' But…" deve ser corrigido pelo destino do link. |
| GH III (`gh3`) | List of songs in GH III: Main + Bonus (1374238744) | 71 | Excluir as 2 linhas "Guitar Battle". Para as 6 faixas só de co-op, usar o tier do co-op. As linhas de bônus ocupam 2 linhas do wikitext. |
| Aerosmith (`gha`) | List of songs in GH: Aerosmith: Main + Bonus (1322578163) | 40 | Excluir as batalhas. Tratar `(cover by …)`. As duas "Walk This Way" são músicas distintas. |
| World Tour (`ghwt`) | List of songs in GH World Tour, tabela única (1372473755) | 84 | Excluir as 2 linhas "Guitar Duel". Preferir o local do Band Tour. Tratar `{{sort\|01.2\|…}}`. |
| Metallica (`ghm`) | List of songs in GH: Metallica: Main (1369069879) | 52 | 3 faixas do *Death Magnetic* só estão no disco de PS2/Wii (nota `A`): entram com selo de plataforma. |
| Smash Hits (`ghsh`) | Guitar Hero Smash Hits, seção Soundtrack (1369066632) | 48 | Todas são repetidas. A coluna "Original Game" serve de checagem cruzada obrigatória (48 de 48). |
| GH 5 (`gh5`) | List of songs in GH 5: Main (1369069912) | 85 | Cabeçalho ocupa 2 linhas. Não há bônus. Ignorar importáveis e DLC. |
| Band Hero (`bh`) | Band Hero, seção "Console soundtrack" (1370488450) | 65 | Ordenar pela coluna Order. Ignorar a trilha do DS. |
| Van Halen (`ghvh`) | Guitar Hero: Van Halen, seção Soundtrack (1344093381) | 47 | Há links dentro dos nomes dos locais, o erro de digitação `4 Rome` e aspas curvas. |
| Warriors of Rock (`ghwor`) | List of songs in GH: WoR: Main (1369069887) | 93 | "2112" aparece em 7 partes: manter as 7, como no jogo. Tiers no formato `07.10`. |
| GH Live (`ghl`) | List of songs in GH Live, só a seção "On-disc soundtrack" (1375246171) | 42 | Colunas em outra ordem; o título vem em `! scope="row"`. Agrupar por show/palco. Tudo sob "GHTV" fica de fora. |

**Total: 778 entradas, cerca de 713 músicas únicas.**

**Regras gerais do parser:**
- Um mapa de colunas por fonte, conferindo o texto do cabeçalho. Se a Wikipedia mudar, o script para com erro claro.
- Separar células apenas fora de `[[…]]` e `{{…}}`.
- Expandir templates aninhados: `sort`, `ref`, `r|group=Note`.
- Remover comentários, `<ref>` e spans ocultos, guardando a chave de ordem `N.M` como dois inteiros.
- Sufixos depois de `<br/>` viram marcações: Encore, Boss Battle, cover.
- O nome de cada tier é o rótulo mais frequente para aquele número.
- Parar com erro se aparecer rowspan ou colspan.

### 4.2 Duplicatas e ids
- **Formato do id:** `artista--titulo` em ASCII (`[a-z0-9-]`). O id nunca muda depois de criado: o validador compara com a versão anterior para nenhum progresso ficar sem música.
- **Como as duplicatas são unidas:** título/artista normalizados, destino do link na Wikipedia e `aliases.json`.
- **Casos decididos:**
  - "Paranoid" (GH III) e "Paranoid (Live)" (WoR) são a mesma música.
  - As duas "Walk This Way" (1975 e a versão com Run-D.M.C.) ficam separadas.
  - "Bad Reputation" do Thin Lizzy e da Joan Jett são músicas diferentes.
- **O que aparece na tela:**
  - O artista mostrado é o original; faixas que no jogo são cover ganham o selo "cover no jogo".
  - O ano da música é o mais antigo; cada entrada guarda também o ano da versão daquele jogo.

### 4.3 Afinação e instrumentação (`data/song-meta.js`, preenchido à mão)
- **`tun`** usa um vocabulário fixo, sempre em relação à gravação original (não ao cover do jogo):

  | Código | Significado |
  |---|---|
  | `E` | Mi padrão |
  | `Eb` | ½ tom abaixo |
  | `D` | Ré padrão |
  | `C#` | Dó# padrão |
  | `C` | Dó padrão |
  | `B` | Si padrão |
  | `dropD`, `dropC#`, `dropC`, `dropB`, `dropA` | Drop tunings |
  | `openG`, `openD`, `openE`, `DADGAD` | Afinações abertas |
  | `7B` | Guitarra de 7 cordas |
  | `other:<texto>` | Qualquer outra |
  | `null` | Desconhecida (aparece "?") |

- **`tc`** é a confiança: 1 = confirmada, 0 = "a confirmar" (aparece com "?").
- **`ins`** = `{g: guitarras, b: baixo, d: bateria, k: teclados, v: vozes, x: ['perc','sopro','cordas','gaita','dj']}`. Conta as partes distintas do arranjo original que precisariam ser tocadas ao vivo.
- **Preenchimento:** em lotes por artista, com base em conhecimento consolidado e busca na web nos casos duvidosos.
  - Parte das faixas bônus de bandas independentes (GH I a III) deve ficar como "?".
  - No fim sai um relatório com as de baixa confiança.
  - Tudo pode ser corrigido no app; a correção é sincronizada entre os aparelhos.

## 5. Autenticação e sincronização

### 5.1 Login
- **Modo Firebase:**
  - Um campo de senha. Há também um `<input autocomplete="username">` oculto com o e-mail fixo, para os gerenciadores de senha funcionarem.
  - O app chama `signInWithEmailAndPassword('rockshero@example.com', senha)`. O domínio `example.com` é reservado, então ninguém consegue tomar a conta pedindo redefinição de senha.
  - A sessão fica salva no IndexedDB: ninguém precisa digitar a senha de novo.
  - Erros com mensagem em português:
    - `auth/invalid-credential` / `wrong-password`: "Senha errada!"
    - `too-many-requests`: avisa que muitas tentativas erradas bloqueiam a conta compartilhada por alguns minutos, para todos.
    - `network-request-failed`: "O primeiro acesso precisa de internet."
    - `user-disabled` e `operation-not-allowed` também são tratados.
  - A config é conferida ao abrir o app, incluindo `databaseURL` explícito. Se estiver errada, aparece um erro em português. Com a config preenchida, o app **nunca** cai para o modo local, senão um aparelho pararia de sincronizar sem ninguém perceber.
- **Modo local:** SHA-256 de sal + senha, comparado com uma constante. A implementação é em JS síncrono e não depende de `crypto.subtle`.
- **SDK:**
  - O bundle `vendor/firebase-rh.js` junta `firebase/app`, `firebase/auth` e `firebase/database` num script clássico, gerado com esbuild; a fonte fica em `tools/firebase-bundle/`.
  - O Auth é iniciado com `initializeAuth` e `indexedDBLocalPersistence`, sem o módulo de popup/redirect. Na versão *compat*, esse módulo espera scripts do Google antes de dizer quem está logado, o que trava o login no celular e no Safari.
  - Plano B, se o teste da etapa 2 falhar: versão *compat* copiada para o projeto, com a tela desenhada imediatamente a partir do cache.
- **Testes:** o parâmetro `?emulator=1` só é aceito em `localhost` ou `127.0.0.1`.

### 5.2 Estrutura no Realtime Database (`/rockshero`)
```
members/{memberId}:            {name, instrument, order, archived?, t}
progress/{songId}/{memberId}:  {v: 0..100 | "na", t, by}
setlists/main/name:            string
setlists/main/items/{songId}:  {pos (número fracionário), t}
overrides/{songId}/{tun|ins}:  {val, t}
```
- **Membros iniciais:**
  - Os ids são fixos: `m-vocal`, `m-guitarra`, `m-baixo`, `m-bateria`.
  - Só são criados quando o **servidor** confirma que ainda não existe nenhum membro.
  - Remover um membro marca `archived:true`: o histórico fica guardado e dá para desfazer.
- **Set list como mapa com posição fracionária.**
  - Ao mover, a música recebe o ponto médio entre as vizinhas; se o espaço ficar menor que 1e-6, as posições são refeitas.
  - Se um aparelho adiciona e outro reordena ao mesmo tempo, nada se perde, e não há como a mesma música entrar duas vezes.
- **`database.rules.json`:**
  - `.read` e `.write` só para `auth.uid === '<UID_DA_BANDA>'`. Enquanto o UID não for trocado, o banco fica fechado para todos.
  - `.validate` em cada campo:
    - tipos corretos e valor entre 0 e 100 ou "na";
    - `t <= now + 10min`, para um celular com relógio adiantado não ganhar sempre;
    - nenhum campo fora do esperado;
    - formato dos ids;
    - lista de instrumentos permitidos.

### 5.3 Funcionamento local-first
1. **Ao abrir:** se este aparelho já teve sessão, a tela aparece na hora com o cache mais as edições pendentes, sem esperar o login. O status mostra "conectando…".
2. **Ao editar:**
   1. A edição entra no diário (localStorage, com um id por entrada) e a tela é atualizada.
   2. O app chama `update()` com vários caminhos de uma vez, sempre caminhos finais (nunca um caminho e o caminho pai na mesma chamada).
   3. Se der certo, a entrada sai do diário (desde que o id seja o mesmo).
   4. Se vier `PERMISSION_DENIED`, a entrada é descartada e aparece um aviso.
3. **Horário das edições:** `t` = `Date.now()` + `.info/serverTimeOffset`. O desvio fica salvo para uso offline.
4. **Proteção contra edição antiga:** no primeiro retorno do servidor, as entradas do diário de sessões anteriores só são reenviadas se o `t` local for maior que o do servidor. Assim uma edição velha feita offline não apaga uma mais nova.
5. **A cada atualização do servidor:** o app compara música por música e atualiza só as linhas afetadas, sem redesenhar a tela. Não mexe no controle que estiver em uso ou sendo arrastado. O cache é salvo com um pequeno atraso.
6. **Várias abas e iOS:** o diário é relido antes de cada alteração e as abas se avisam pelo evento `storage`. No iOS, `visibilitychange` chama `goOffline` e `goOnline` para reconectar.
7. **Status:** sincronizado / offline (n pendentes) / erro.
8. **Backup:** Exportar/Importar JSON na tela Banda, mesclando pelo `t`. Isso também leva os dados do modo local para o Firebase. O plano gratuito do Firebase não faz backup automático.

## 6. Telas e regras

### Regras de cálculo (`store.js`, funções puras com testes)
- **Quem entra na conta de uma música:** membros não arquivados e não marcados "N/A" que atendam a uma destas condições:
  - a música tem pelo menos uma parte do instrumento dele;
  - ele já registrou um valor;
  - a instrumentação da música é desconhecida.
- **Mediana:**
  - Usa os valores desses membros; quem não registrou nada conta como 0.
  - Com número par de valores, é a média dos dois do meio, arredondada.
- **Cores (rock meter):** abaixo de 40% vermelho, de 40% a 79% amarelo, a partir de 80% verde.
- **Estrelas:** uma a cada 20%; 100% vale 5 estrelas douradas.
- **Partes descobertas:** a instrumentação da música é comparada com a formação (ex.: 2ª guitarra, teclado, sopros). Essas partes aparecem com ícone apagado e a dica "sem membro para essa parte".
- **Troca de afinação:** marcada quando duas músicas seguidas do set list têm afinações diferentes.

### Login
- Tela com a highway animada (gemas caindo em perspectiva), silhueta de plateia, logo e uma placa "Digite a senha".
- Senha errada: o ponteiro do rock meter cai para o vermelho, a tela treme e aparece "Senha errada!".
- Senha certa: flash de "YOU ROCK!".

### Músicas (`#/musicas/<jogo>`)
- **Cabeçalho:**
  - Logo e navegação (Músicas · Set List · Banda).
  - Seletor "Quem é você?": o membro ativo é salvo por aparelho e o app pergunta de novo se ele for arquivado.
  - Status de sincronização e botão sair.
- **Abas:** 14 (**Todas** + 13 jogos), numa faixa com rolagem horizontal. Cada jogo tem emblema original e cor própria. No celular também há um seletor em painel; a aba ativa sempre é centralizada.
- **Banner do jogo:** nome, ano, número de faixas e % já pronto pela banda.
- **Filtros:** busca que ignora acentos, afinação, ordenação (ordem do jogo / título / artista / mediana) e "só no set list".
- **Lista:** agrupada por tier, com cabeçalhos no estilo de carreira do Guitar Hero. Cada linha tem:
  - título, artista, ano;
  - selos (bônus, cover, plataforma);
  - afinação;
  - ícones dos instrumentos;
  - **uma barra só de leitura por membro**, com o ícone do instrumento;
  - medidor da mediana;
  - botão de adicionar ou tirar do set list.
- **Edição (painel inferior):** tocar numa linha abre o painel com:
  - escolha do membro (começa no membro ativo);
  - slider de 0 a 100 em passos de 5, botões 0/25/50/75/100, ±5 e N/A;
  - correção de afinação e instrumentação;
  - "última edição por X".
- **Sem sliders nas linhas:** rolar a lista no celular não altera valores sem querer, e a página fica leve.

### Set List (`#/setlist`)
- **Resumo:**
  - quantidade de músicas;
  - **rock meter** grande com a mediana do set (mediana das medianas);
  - música mais fraca;
  - número de trocas de afinação;
  - partes descobertas.
- **Linhas numeradas em fonte manuscrita** (estilo set list escrito à mão), com:
  - alça de arrastar (gemas);
  - título e artista;
  - jogo(s);
  - afinação ("?" quando a confirmar);
  - mediana com barra e estrelas;
  - ícones dos instrumentos (2 guitarras = 2 ícones);
  - botões ↑, ↓ e remover.
- **Entre linhas:** o aviso "🔧 Troca de afinação: E → Drop D".
- **Arrastar e soltar (`dnd.js`, com Pointer Events):**
  - **Toque:**
    - alça de pelo menos 44px, com `touch-action:none`;
    - `setPointerCapture`;
    - durante o arrasto, `touchmove` não passivo, para a página não rolar;
    - o clique que vem logo depois de soltar é ignorado.
  - **Durante o arrasto:**
    - um espaço reservado mostra onde a música vai cair;
    - posições medidas no início e corrigidas pela rolagem;
    - rolagem automática nas bordas, com rAF e `visualViewport`.
  - **Cancelamento:** se o sistema cancelar o toque (`pointercancel`), a ordem volta ao que era.
  - **Acessibilidade:** a mudança é anunciada com `aria-live`.
  - **Sincronização:**
    - Só a posição da música movida é gravada.
    - Mudanças vindas de outro aparelho esperam o arrasto terminar.
- **Imprimir:** `print.css` preto no branco, letras grandes, ícones em SVG inline.
- **Set list vazio:** arte de amplificador com guitarra e um atalho para a tela Músicas.

### Banda (`#/banda`)
- Membros: nome e instrumento (vocal, guitarra, baixo, bateria, teclado, percussão ou outro). Dá para adicionar, reordenar, arquivar e restaurar.
- Exportar e importar JSON.
- Modo atual (local ou Firebase) e versão do app.
- Botão sair.
- Créditos: Wikipedia (CC BY-SA), licenças das fontes e aviso de projeto de fãs, sem vínculo com a Activision.

## 7. Identidade visual e artes
- **Tokens (`base.css`):**
  - fundo de palco escuro com luzes radiais;
  - gemas verde, vermelha, amarela, azul e laranja;
  - gradiente de chamas;
  - títulos cromados (`background-clip:text`, com cor sólida de reserva);
  - azul "star power";
  - rock meter vermelho/amarelo/verde;
  - painéis de metal escovado e tela de amplificador com rebites.
- **Fontes** hospedadas no próprio projeto, em woff2, com as licenças:
  - Metal Mania (OFL) nos títulos e no logo;
  - Oswald (OFL) na interface e nos números;
  - Permanent Marker (Apache-2.0) no set list manuscrito.
- **Logo Rocks Hero** (SVG original):
  - "ROCKS" em arco sobre um "HERO" maior;
  - letras cromadas com contorno preto e brilho, chamas atrás, uma guitarra estilizada cruzando e as 5 gemas embaixo;
  - o texto é convertido em paths (opentype.js, a partir dos TTF do repositório google/fonts), então o logo aparece igual em qualquer lugar;
  - variações: monograma "RH" (favicon e ícone do app) e PNGs transparentes de 512 e 1024 px gerados com o Chrome headless, para redes sociais e WhatsApp.
- **Artes SVG originais:**
  - highway, borda de chamas, gemas, estrelas, rock meter;
  - plateia e amplificador;
  - ícones de instrumentos: guitarra, baixo, bateria, teclado, microfone, percussão, sopro, cordas, gaita, DJ;
  - 13 emblemas de jogos.
- **Sem material oficial:** nenhum logo ou arte da franquia; os nomes dos jogos aparecem só como texto.
- **Ícones:** nas linhas do catálogo, máscara CSS (mais leve); no set list e na impressão, SVG inline.

## 8. Celular, iOS e desempenho
- **Layout no celular:**
  - Campos com fonte de pelo menos 16px (evita o zoom automático do iOS).
  - Altura com `dvh` e margens seguras com `env(safe-area-inset-*)` + `viewport-fit=cover`.
  - Efeitos de hover só com `@media (hover:hover)`.
- **Lista de músicas:**
  - Linhas com `content-visibility:auto`; a primeira carga é feita em blocos, por causa de Safari antigo.
  - Um único listener de eventos para a lista toda.
  - Um `Map<songId, linha>` para atualizar só as linhas que mudaram.
  - Um único `Intl.Collator('pt-BR')` para ordenar.
- **Efeitos visuais:** nada de `filter`, `backdrop-filter` ou sombras grandes nas linhas. A arte de fundo fica numa camada `position:fixed` separada.
- **Compatibilidade:**
  - Sem `crypto.randomUUID` nem `structuredClone` sem alternativa.
  - `pagehide` no lugar de `beforeunload`.
- **Atualizações:**
  - `?v=APP_VERSION` em todos os scripts e estilos, para cada deploy baixar os arquivos novos.
  - Service worker só em http(s).

## 9. Etapas de implementação

| # | Etapa | Entregáveis principais |
|---|---|---|
| 0 | Salvar este plano no repositório | `PLANO-DE-IMPLEMENTACAO.md` |
| 1 | Pipeline de dados: Wikipedia fixada → parser → remoção de duplicatas → validação (778 entradas, Smash Hits 48/48, ids únicos) | `tools/data/*`, `data/songs.js`, `data/games.js` |
| 2 | Teste do Firebase no emulador: bundle do SDK, login por senha, regras (bloqueia e libera), offline/online, em http e file:// | `vendor/firebase-rh.js`, `tools/firebase-bundle/`, `firebase.json`, `database.rules.json`, `js/firebase-config.js` |
| 3 | Lógica sem interface: estado, diário, proteção contra edição antiga, mediana, partes descobertas, posições fracionárias, sync local e Firebase, com testes unitários | `js/util.js`, `js/store.js`, `js/sync-*.js`, `tools/tests/unit/*` |
| 4 | Base e identidade visual: rotas, login, fontes, tokens, ícones, logo, artes, status de sincronização | `index.html`, `css/*`, `js/app.js`, `js/login.js`, `js/icons.js`, `assets/*`, `tools/logo/*` |
| 5 | Tela Músicas: abas, filtros, tiers, barras, painel de edição, correções, adicionar ao set list | `js/catalog.js`, `js/ui.js`, `css/views.css` |
| 6 | Tela Set List: arrastar e soltar, ↑/↓, trocas de afinação, resumo com rock meter, impressão | `js/setlist.js`, `js/dnd.js`, `css/print.css` |
| 7 | Tela Banda: membros, exportar/importar, sair | `js/band.js` |
| 8 | Afinação e instrumentação das ~713 músicas (pode andar junto desde a etapa 1) + relatório de baixa confiança | `data/song-meta.js` |
| 9 | PWA + README (Firebase, GitHub Pages, backup, troca de senha, alerta do GitHub sobre a apiKey) | `sw.js`, `manifest.webmanifest`, `README.md`, `.nojekyll` |
| 10 | Verificação completa (seção 10) e correções | `tools/tests/*` |

## 10. Verificação
1. **Dados (`validate.mjs`):**
   - contagem por jogo e total de 778;
   - Smash Hits 48 de 48 batendo com o jogo original;
   - ids únicos, no formato certo e iguais aos da versão anterior;
   - toda música aparece em algum jogo e tem afinação/instrumentação;
   - códigos de afinação válidos.
2. **Testes unitários** (`node --test`, com os scripts clássicos carregados via `vm`):
   - mediana com quantidade par e ímpar, N/A, membros arquivados e instrumentação desconhecida;
   - diário e proteção contra edição antiga;
   - posições refeitas no set list;
   - rejeição de caminho pai + filho na mesma escrita;
   - partes descobertas e trocas de afinação;
   - mescla do import pelo `t`;
   - SHA-256 contra um valor conhecido.
3. **Regras** (chamadas REST ao emulador, no mesmo banco que o app usa):
   - sem login: bloqueado;
   - outro usuário: bloqueado;
   - `v:150`, falta de `t` ou campo desconhecido: bloqueado;
   - escrita válida e remoção: permitidas.
4. **Testes de ponta a ponta:**
   - **Como:** puppeteer-core com o Chrome instalado, app servido em `http://127.0.0.1:<porta>/rocks-hero/` com os emuladores, e dois navegadores independentes.
   - **Login:** senha errada é recusada; `Hero@123` entra e a sessão continua depois de recarregar.
   - **Sincronização:**
     - progresso editado no aparelho A aparece no B;
     - offline (`goOffline`) → editar → recarregar → voltar online → a edição chega ao servidor;
     - edição antiga: A edita offline no momento t1, B edita online em t2, A reconecta → o valor de B continua;
     - A adiciona ao set list enquanto B reordena → as duas mudanças ficam;
     - dois aparelhos novos criando os membros ao mesmo tempo → exatamente 4 membros.
   - **Interação:**
     - arrastar e soltar com mouse e com toque (`page.touchscreen`), incluindo a rolagem automática; a ordem continua depois de recarregar;
     - rolar a lista com o dedo não altera nenhum valor.
   - **Impressão:** `emulateMediaType('print')` + PDF legível.
   - **Desempenho:** aba Todas em 390×844 com a CPU 4× mais lenta, medindo tempo de renderização, atraso ao digitar no filtro e número de elementos.
   - **Visual:** capturas de todas as telas em desktop e celular, revisadas uma a uma.
5. **file:// em modo local:**
   - o login por hash funciona;
   - fontes e logo carregam;
   - não há erros no console;
   - os dados continuam depois de recarregar.
6. **Depois do deploy** (checklist no README, feito com você):
   - login em https no GitHub Pages;
   - sincronização entre dois celulares;
   - app abrindo offline pelo PWA.

## 11. O que você precisa fazer (passo a passo no README)
1. Criar um projeto no Firebase (plano Spark, gratuito), registrar um app Web e colar a config em `js/firebase-config.js`.
2. Em Authentication:
   - ativar E-mail/senha;
   - adicionar o usuário `rockshero@example.com` com a senha `Hero@123`;
   - copiar o UID;
   - em Settings › User actions, desmarcar "Enable create (sign-up)".
3. Em Realtime Database:
   - criar o banco;
   - copiar a URL para `databaseURL`;
   - colar as regras de `database.rules.json` com o UID.
4. Subir o projeto para o GitHub e ativar o Pages (branch `main`, pasta raiz). O GitHub vai apontar a apiKey do Firebase como "segredo exposto": é esperado, porque essa chave é pública por natureza. A proteção vem das regras e da senha.

Enquanto o Firebase não estiver configurado, o app funciona em modo local.
