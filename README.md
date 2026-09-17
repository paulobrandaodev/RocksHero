# Rocks Hero 🎸🔥

App da banda **Rocks Hero** para acompanhar quanto cada membro já tirou das músicas dos Guitar Hero e montar o set list do show. Feito em HTML, CSS e JavaScript puro: não tem etapa de build.

- **Músicas**: uma aba por jogo, com as 719 músicas dos 13 Guitar Hero de console. Mostra a afinação original, os instrumentos e quanto cada membro já tirou, além da mediana da banda.
- **Set List**: arraste pelas gemas para ordenar. O resumo traz o rock meter da banda, avisa trocas de afinação entre músicas e as partes sem membro (ex.: teclado). Tem botão de imprimir.
- **Banda**: formação, "quem é você" em cada aparelho e backup.

Senha da banda: `Hero@123`.

---

## 1. Testar no computador (modo local)

Abra o `index.html` com dois cliques. Enquanto `js/firebase-config.js` estiver vazio, o app roda em **modo local**: a senha é conferida no navegador e os dados ficam só nele.

> O modo local serve para experimentar. A senha ali é só uma trava visual, porque o código do site é público. Para a banda inteira compartilhar o progresso com segurança, configure o Firebase (passo 2).

Depois que o Firebase estiver configurado, dá para voltar ao modo local abrindo com `?local=1` no fim do endereço (só funciona na sua própria máquina, abrindo o arquivo ou em `localhost`).

## 2. Configurar o Firebase (sincronização da banda)

O plano gratuito (Spark) sobra para uma banda.

1. Acesse <https://console.firebase.google.com>, clique em **Criar projeto** (ex.: `rocks-hero`). O Google Analytics pode ficar desligado.
2. **Registrar o app Web**: em *Configurações do projeto › Seus apps*, clique no ícone `</>`, dê um nome e copie o objeto `firebaseConfig`.
3. **Realtime Database**: menu *Criação › Realtime Database › Criar banco de dados*. Escolha a região (`us-central1` serve) e comece no **modo bloqueado**. Copie a URL do banco (ex.: `https://rocks-hero-default-rtdb.firebaseio.com`).
4. Cole tudo em `js/firebase-config.js`:
   ```js
   config: {
     apiKey: 'AIza...',
     authDomain: 'rocks-hero.firebaseapp.com',
     databaseURL: 'https://rocks-hero-default-rtdb.firebaseio.com',
     projectId: 'rocks-hero',
     appId: '1:...:web:...',
   },
   ```
5. **Authentication**: menu *Criação › Authentication › Vamos começar*.
   - Em *Método de login*, ative **E-mail/senha**.
   - Em *Usuários › Adicionar usuário*, use o e-mail `rockshero@example.com` (é o `bandEmail` do arquivo de config) e a senha **`Hero@123`**.
   - Copie o **UID** do usuário criado.
   - Em *Configurações › Ações do usuário* (em inglês, *User actions*), **desmarque a opção de permitir criação de contas** (*Enable create (sign-up)*). Assim ninguém cria outra conta com a sua apiKey.
6. **Regras do banco**: abra `database.rules.json`, troque `UID_DA_BANDA` (aparece 2 vezes) pelo UID copiado. Cole o conteúdo em *Realtime Database › Regras* e clique em **Publicar**.

Pronto: abra o app, digite `Hero@123` e o status no topo deve mostrar **Sincronizado**.

Observações:
- **A `apiKey` não é segredo.** O Firebase foi feito para ela ficar no site. Quem protege os dados são as regras (só a conta da banda lê e escreve) e a senha. O GitHub pode mandar um alerta de "secret" sobre essa chave: pode dispensar.
- **Trocar a senha**: no console, em *Authentication › Usuários*, use o menu do usuário para redefinir a senha. Os aparelhos logados precisarão entrar de novo.
- **Primeiro acesso de cada aparelho precisa de internet.** Depois disso, dá para editar sem sinal: as mudanças ficam guardadas e são enviadas quando a conexão volta.

## 3. Publicar no GitHub Pages

1. Crie um repositório no GitHub e envie esta pasta inteira (a `.gitignore` já exclui o que não precisa subir).
2. No repositório: *Settings › Pages › Build and deployment*. Escolha *Deploy from a branch*, branch `main` e pasta `/ (root)`.
3. Em alguns minutos o app estará em `https://SEU-USUARIO.github.io/NOME-DO-REPO/`.

No celular, use **Adicionar à tela inicial**. O app abre como aplicativo e funciona mesmo sem sinal.

**Ao publicar uma nova versão**, rode `node tools/bump-version.mjs 1.0.1` (troque o número) antes do push. Isso força os aparelhos a baixarem os arquivos novos.

## 4. Backup

Na tela **Banda › Backup**, *Exportar* baixa um `.json` com todo o progresso, o set list e as correções. *Importar* mescla o arquivo com o que já existe, sempre mantendo a edição mais recente de cada item. O plano gratuito do Firebase não faz backup sozinho, então vale exportar de vez em quando. Esse caminho também leva para o Firebase os dados preenchidos no modo local.

## 5. Sobre os dados das músicas

- **Listas de músicas**: tiradas da Wikipedia (revisões fixadas em `tools/data/sources.json`, licença CC BY-SA 4.0). São 778 faixas de disco (com bônus, sem DLC), que viram 719 músicas únicas.
- **Afinação e instrumentação**: preenchidas à mão, a partir da gravação original.
  - Das 719, **183 estão confirmadas**, **490 aparecem com "?" (a confirmar)** e 46 são desconhecidas (bônus de bandas independentes).
  - Na banda, quem souber pode corrigir direto no app (painel da música › *Editar afinação/instrumentação*); a correção vale para todos.
  - A lista do que falta confirmar está em `tools/data/out/meta-a-confirmar.txt` (gerada pelo script).
- **Instrumentação**: conta as partes do arranjo original (ex.: 2 guitarras). Partes que a formação atual não cobre aparecem apagadas.
- **Mediana da banda**: calculada com os membros que tocam na música. Fica de fora quem marcou N/A e quem toca um instrumento que a música não tem (ex.: o vocal numa instrumental). Quem ainda não registrou nada conta como 0%.

## 6. Para quem for mexer no código

Estrutura principal:

```
index.html            página única (rotas #/musicas/<jogo>, #/setlist, #/banda)
css/                  identidade visual (tokens em base.css)
js/                   app: store.js (estado e sincronização), sync-*.js, telas
data/                 songs.js e games.js (gerados) + song-meta.js (gerado de tools/data/meta)
vendor/firebase-rh.js SDK do Firebase 12 empacotado (auth + database)
assets/               logo, artes, fontes (com licenças)
tools/                scripts e testes (não são usados pelo app)
```

Ferramentas (precisam de Node 20+; Java 11+ só para os emuladores). Dentro de `tools/`:

```bash
npm install
npm run data:fetch        # baixa as listas da Wikipedia (revisões fixadas)
npm run data:build        # recria data/ a partir delas + tools/data/meta/*.txt
npm run test:unit         # lógica (mediana, diário offline, set list, importação…)
npm run emulators         # emuladores do Firebase (deixe rodando em outro terminal)
npm run test:rules        # regras do banco
npm run test:e2e          # app completo no Chrome: login, sincronização, offline, arrastar, impressão
node logo/build-logo.mjs  # regenera o logo e os ícones
```

Para testar o app contra o emulador, sirva a pasta (`node tools/tests/e2e/server.mjs 8080`) e abra `http://127.0.0.1:8080/rocks-hero/?emulator=1`.

## Créditos

- Listas de músicas: Wikipedia (CC BY-SA 4.0).
- Fontes: Metal Mania e Oswald (SIL Open Font License), Permanent Marker (Apache 2.0).
- Firebase JS SDK (Apache 2.0).
- Logo, ícones e artes: originais, feitos para a Rocks Hero.

Projeto de fãs, sem vínculo com a Activision ou com a franquia Guitar Hero.
