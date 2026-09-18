# Interação do público com o show (celular + telão)

Ideias para o público participar do set list pelo celular, com o resultado aparecendo no telão, puxando a nostalgia dos Guitar Hero. Primeiro as ideias, depois como encaixar no app e um plano em etapas.

## Como funcionaria

1. O telão mostra um **QR code** ("Entre no show: rockshero.../ao-vivo").
2. O público abre uma **página leve**, sem senha e sem instalar nada, e recebe um apelido de roqueiro gerado na hora ("Axe-Grinder #217").
3. Em momentos definidos pela banda, o celular mostra uma votação ou um minijogo, e o telão mostra o resultado **ao vivo**.
4. Quem controla tudo é um membro da banda (ou um amigo no som), pelo próprio app, num painel **"Ao vivo"**: abrir votação, encerrar e mostrar o resultado.

---

## Ideias de interação

### 1. Escolha o Encore ⭐ (a mais fácil e a de maior impacto)
Antes do bis, o telão mostra 3 ou 4 músicas candidatas como cartões de jogo (emblema do GH, tier, estrelas). O público vota por 30 a 60 segundos com barras subindo em tempo real e a vencedora vira o encore. As candidatas saem **só do que a banda já sabe tocar** (mediana acima de 80%), então nenhum resultado pega a banda desprevenida.

### 2. Modo Carreira do show
O set é dividido em "tiers", como no modo carreira: *Opening Licks → Axe-Grinders → Thrash and Burn → ...*. O telão mostra o nome do tier ao começar cada bloco. No fim de cada tier, o público escolhe a próxima música entre 2 opções, e o encore é o "boss" do show.

### 3. Rock Meter da plateia
Um rock meter gigante no telão (o mesmo desenho do app). O público toca num botão no celular para "fazer barulho" e o ponteiro sobe. No verde, o telão acende **"STAR POWER!"** em azul e a banda responde: solo estendido, luz azul, guitarrista levantando a guitarra (o gesto clássico para ativar o Star Power).

### 4. Guitar Battle com power-ups do público
Inspirado nas batalhas contra os chefes do GH3 (Tom Morello, Slash, Lou). Dois membros duelam num trecho improvisado e o público lança **power-ups** que viram desafios de verdade:
- *Lefty Flip*: toca com a guitarra de canhoto por alguns segundos.
- *Broken String*: para, "troca a corda" na mímica e volta.
- *Amp Overload*: pula e toca de joelhos.
- *Difficulty Up*: dobra o andamento.

No fim, o público vota no vencedor e o telão mostra "**YOU ROCK!**" ou "**SONG FAILED**" (de brincadeira).

### 5. Nota ao fim da música, como no jogo
Depois de cada música, o público dá de 1 a 5 estrelas e o telão mostra a tela de resultado do GH: estrelas, "% de notas acertadas" (a média do público) e a maior sequência de notas. No fim do show sai o **ranking das músicas da noite**.

### 6. Quiz de nostalgia nas trocas de afinação
O app já detecta as **trocas de afinação** do set. Esses minutos em que o guitarrista está afinando viram rodadas de quiz no telão:
- "De qual Guitar Hero é essa música?"
- "Qual era o chefe do GH3?"
- "Qual foi o primeiro jogo com bateria e vocal?" (World Tour)
- "Complete: *Through the Fire and ___*"

Quem acerta mais aparece como **Fã Lendário** do show.

### 7. Telas de carregamento com dicas
Entre as músicas, o telão mostra uma "tela de loading" com dicas no estilo do jogo, só que sobre a banda: *"Dica: o baterista da Rocks Hero nunca errou uma virada. Nunca."* É barato de fazer e o público reconhece na hora.

### 8. Pedidos do catálogo
Uma "loja de músicas" no celular com o que a banda sabe tocar. O público pede, os pedidos viram um ranking no painel da banda, e a banda escolhe quando (e se) atende. O telão pode mostrar "Música mais pedida da noite".

### 9. Meta de público desbloqueia conteúdo
Uma barra no telão com quantos celulares estão conectados. Em 50, 100 e 200, desbloqueia algo: uma música bônus, um visual novo de "venue" no telão, um cover surpresa. É o "Unlocked: New Venue!" do jogo.

### 10. Mural de mensagens (com moderação)
Recados curtos do público no telão ("Toca Free Bird!"). Só entram depois de aprovados no painel da banda: texto livre sem moderação num telão é arriscado.

---

## Como encaixa no app atual

| Peça | O que é |
|------|---------|
| **Página do público** (`ao-vivo.html`) | Página separada, leve, sem senha. Nunca carrega os dados internos da banda. |
| **Tela do telão** (`#/telao`) | Rota do app, aberta no notebook ligado ao telão, em tela cheia. Mostra o QR code, a música atual, as votações e os resultados. |
| **Painel "Ao vivo"** (`#/ao-vivo`) | Para a banda: abrir e fechar votações, escolher candidatas (sugeridas pelo app a partir das prontas), disparar quiz e aprovar mensagens. |
| **Dados** | Um ramo novo no Firebase, `/live`, separado de `/rockshero`. O público lê o estado da votação e grava só o próprio voto. |

### Segurança
- O público entra com **login anônimo do Firebase**, e cada aparelho vira um usuário anônimo.
- Regras do banco: o público **lê** `/live/state` e **grava só** `/live/votes/{pergunta}/{seuUid}`, com um voto por pessoa por pergunta. Tudo em `/rockshero` continua exclusivo da conta da banda.
- Nada de texto livre direto no telão: mensagens só com aprovação.
- A contagem para o telão sai de um contador agregado (ou o telão soma os votos), para que o celular do público não baixe todos os votos de todo mundo.

### Limite importante do plano gratuito
O Realtime Database no plano **Spark (gratuito)** aceita **no máximo 100 conexões simultâneas**. Para um público maior, as opções são:
- ativar o **plano Blaze** (pago por uso; para uma noite de show o custo tende a ser de centavos, mas é bom configurar um alerta de orçamento);
- ou fazer o público **fechar a conexão** quando não há votação aberta (a página só conecta durante a votação), o que ajuda mas não resolve para plateias grandes.

### Nome e marca
O app é um projeto de fã. No telão, num show aberto (e talvez pago), vale **usar só a arte própria da Rocks Hero** (como já é hoje no app) e evitar logos, fontes e telas oficiais da Activision. O clima de Guitar Hero vem das referências (rock meter, estrelas, Star Power, tiers), não dos logos.

---

## Plano sugerido

**Etapa 1: Encore votado (MVP)**
Página do público com QR code, uma votação por vez, telão com barras ao vivo e painel para abrir e fechar. Serve de teste para o fluxo inteiro num show de verdade.

**Etapa 2: Nostalgia**
Rock Meter da plateia com Star Power, nota em estrelas ao fim de cada música e quiz nas trocas de afinação (aproveitando o que o set list já calcula).

**Etapa 3: Espetáculo**
Guitar Battle com power-ups, modo carreira com tiers, metas de público e mural moderado.

### Checklist para o dia do show
- Testar o QR code no telão real, com a luz do palco (contraste alto e tamanho grande).
- Notebook do telão com internet cabeada, ou 4G próprio como plano B.
- Alguém fora do palco operando o painel "Ao vivo".
- Combinar com a banda o que cada resultado muda no show antes de abrir qualquer votação.
