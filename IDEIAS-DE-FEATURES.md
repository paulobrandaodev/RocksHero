# Ideias de novas features para o app

Sugestões para avaliar com a banda, pensadas a partir do que o app já tem: catálogo por jogo, progresso de cada membro, set list, afinação e instrumentação, observações por músico e links para ouvir.

Legenda: **Esforço** P (pequeno, até 1 dia), M (alguns dias), G (1 semana ou mais). **Valor** é o quanto ajuda no ensaio ou no show.

## Resumo

| # | Ideia | Esforço | Valor |
|---|-------|:-------:|:-----:|
| 1 | Modo Palco (tela do show) | M | Alto |
| 2 | Reordenar o set list para trocar menos de afinação | P | Alto |
| 3 | Duração das músicas e tempo total do set | M | Alto |
| 4 | Vários set lists (show, ensaio, acústico) e histórico de shows | M | Alto |
| 5 | Imprimir o set list com as observações de cada músico | P | Médio |
| 6 | "Quero tocar": votação interna da banda | P | Médio |
| 7 | Diário de ensaio e evolução do progresso | M | Médio |
| 8 | Links de cifra e tablatura | P | Médio |
| 9 | BPM, tom e metrônomo | M | Médio |
| 10 | Membro com mais de um instrumento | M | Médio |
| 11 | Feed de atividade da banda | M | Baixo/Médio |
| 12 | Metas com prazo | P | Médio |
| 13 | Conquistas no estilo Guitar Hero | M | Diversão |
| 14 | Busca nas observações e marcador na lista | P | Médio |

---

### 1. Modo Palco
Uma tela cheia para o celular ou tablet no pedestal durante o show: música atual em letra grande, a próxima, afinação com aviso de troca, as observações de quem está usando o aparelho e um cronômetro do show. Avança com toque, com um pedal Bluetooth (que funciona como teclado) ou com as setas. Mantém a tela acesa (Wake Lock API) e funciona offline, porque os dados já ficam no aparelho.

### 2. Reordenar para trocar menos de afinação
O set list já conta as trocas de afinação. Um botão **"Otimizar ordem"** agruparia as músicas pela afinação, sem mexer na primeira e na última (abertura e encerramento costumam ser escolhidos a dedo). Mostra antes e depois ("de 7 trocas para 2") e só aplica se a banda confirmar.

### 3. Duração das músicas e tempo total
Guardar a duração de cada faixa (uma vez, no script de dados, ou editável como a afinação) e mostrar no set list o tempo total, com aviso quando passar do tempo combinado com a casa ("show de 60 min: sobram 4 min"). Dá para somar um tempo fixo por troca de afinação.

### 4. Vários set lists e histórico
Hoje existe um set list (`setlists/main`). A estrutura do banco já comporta vários: um por show, um de ensaio, um acústico. Com isso vem o histórico: "o que tocamos no show de estreia", "quantas vezes tocamos Iron Man".

### 5. Imprimir com observações
Na impressão, escolher de quem são as observações ("folha do baterista", "folha do baixista"). Cada músico leva a sua folha para o palco, com as notas embaixo de cada música.

### 6. "Quero tocar"
Cada membro marca as músicas que gostaria de tocar. Um filtro e uma ordenação novos cruzam interesse com prontidão: "todos querem e já está 60% pronta" vira prioridade de ensaio.

### 7. Diário de ensaio
Registrar o ensaio (data, músicas passadas, observação geral). O progresso de cada um passa a ter histórico, o que permite um gráfico de evolução por música e por membro e mostra o que ficou parado há semanas.

### 8. Cifra e tablatura
Ao lado do YouTube e do Spotify, botões de busca no Cifra Club e no Songsterr (os mesmos links de pesquisa, abrindo em nova guia).

### 9. BPM, tom e metrônomo
Campo de BPM e tom por música (editável pela banda, como a afinação) e um metrônomo simples no painel da música para ensaiar o andamento. O BPM também ajudaria a variar a energia do set.

### 10. Membro com mais de um instrumento
Hoje cada membro tem um instrumento. Se alguém também faz teclado ou backing vocal, a conta de "partes sem membro" e a mediana ficariam mais fiéis com instrumentos secundários.

### 11. Feed de atividade
Uma linha do tempo com o que mudou: "Caio tirou Iron Man 100%", "Paulo corrigiu a afinação de Cochise", "Vini deixou uma observação em Everlong". Os dados já têm `t` e `by`, então dá para montar sem mudar o banco.

### 12. Metas com prazo
"Até 30/10, 12 músicas do set acima de 80%". Um medidor no topo do set list mostra se a banda está no ritmo.

### 13. Conquistas no estilo Guitar Hero
Medalhas por marcos: *Full Combo* (todos 100% numa música), *Tier limpo* (todas as músicas de um tier prontas), *Boss derrotado* (a música boss de um jogo pronta), *Maratona* (10 músicas num ensaio). Mais para diversão e motivação.

### 14. Busca nas observações e marcador na lista
Mostrar um marcador nas linhas do catálogo com observações e permitir buscar pelo texto delas ("capo", "chorus"). É útil quando as observações começarem a acumular.

---

## Observações técnicas
- As ideias 2, 5, 8, 11 e 14 não mudam o banco: dá para fazer só no app.
- As ideias 3, 4, 6, 7, 9, 10 e 12 precisam de campos novos no banco. Cada uma exige atualizar `database.rules.json` e publicar as regras no console do Firebase (como foi feito para as observações).
- O plano gratuito do Firebase aguenta todas com folga para uma banda.
