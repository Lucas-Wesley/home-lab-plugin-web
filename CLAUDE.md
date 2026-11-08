# Homelab no Chrome

Extensão do Chrome (Manifest V3) do **ecossistema de apps pessoais do Lucas**: um botão discreto
nas páginas que manda o link ao app certo (vídeo do YouTube → Acervo, página com frases de exemplo → Flashcards);
pelo popup e pelo botão direito, qualquer página ou link vai ao Acervo ou ao Flashcards (E10). É um
**cliente** dos apps, sem banco nem servidor próprio.

**Comece lendo:** [`docs/DECISOES.md`](docs/DECISOES.md).

## Contexto do ecossistema
Visão geral, roadmap e contrato comum no repo **Hub**: `github.com/Lucas-Wesley/hub-home-lab-web`
(pasta `docs/`). A extensão usa as APIs que os apps já têm (`POST /api/referencias` do Acervo,
`POST /api/links` e `GET /api/baralhos` do Flashcards): mudar uma delas é mudar os dois lados.

## Regras e convenções (IMPORTANTE)
- **Sem build e sem dependências em tempo de execução.** O que está em `extensao/` é o que o Chrome
  carrega; `node_modules` é só para os testes.
- **Nada específico de um site** fora o YouTube (E9): as regras ficam em `extensao/destinos.js`, com teste em
  `testes/destinos.test.js`; o script da página roda em todos os sites, então ele precisa ser leve.
- **Quem chama os apps é o serviço** (`servico.js`), nunca a página: a permissão de
  `https://192.168.1.20/*` vale só para a extensão, sem CORS.
- **Discreta, mas à vista:** um círculo de 36 px no canto, que mostra o texto nos 5 primeiros
  segundos, ao passar o mouse e depois de enviar (E8). Nada de painéis abertos sozinhos.
- Guardar só o histórico (50 últimos) e os ajustes, em `chrome.storage.local`.
- Rodar `npm test` antes de publicar.
- **Commits:** autoria do Lucas; **sem linha `Co-Authored-By`**.
