# Homelab no Chrome

Extensão do Chrome (Manifest V3) do **ecossistema de apps pessoais do Lucas**: um botão discreto
nas páginas que manda o link ao app certo (vídeo do YouTube → Trilha, E13; página com frases de exemplo → Flashcards);
pelo popup e pelo botão direito, qualquer página ou link vai ao Acervo ou ao Flashcards (E10), e um PDF vai à
Biblioteca (E12); nas aulas da Branas.io, LINUXtips, Full Cycle e Tech Leads Club, coleta como o vídeo chega (E14) e, pelo popup, manda baixar a aula na Trilha (E15) ou, na Tech Leads Club, o curso inteiro (E19); no Chef Enzo Neto (Cademí), mapeia a escola inteira e manda cada aula, com o texto da página, para a trilha do curso (E20). É um
**cliente** dos apps, sem banco nem servidor próprio.

**Comece lendo:** [`docs/DECISOES.md`](docs/DECISOES.md).

## Contexto do ecossistema
Visão geral, roadmap e contrato comum no repo **Hub**: `github.com/Lucas-Wesley/hub-home-lab-web`
(pasta `docs/`). A extensão usa as APIs que os apps já têm (`POST /api/entrada` da Trilha, `POST /api/referencias` do Acervo,
`POST /api/links` e `GET /api/baralhos` do Flashcards, `POST /api/books` da Biblioteca, `POST /api/cursos/estimar` e `POST /api/cursos/aulas` da Trilha, que aceitam `embed`, `texto`, `ordem` e `trilha` desde E20/T55): mudar uma delas é mudar
os dois lados.

## Regras e convenções (IMPORTANTE)
- **Sem build e sem dependências em tempo de execução.** O que está em `extensao/` é o que o Chrome
  carrega; `node_modules` é só para os testes.
- **Nada específico de um site** fora o YouTube (E9) e os cursos (E14, E17, E20, `CURSOS` em `destinos.js`): as regras ficam em `extensao/destinos.js`, com teste em
  `testes/destinos.test.js`; o script da página roda em todos os sites, então ele precisa ser leve.
- **Quem chama os apps é o serviço** (`servico.js`), nunca a página: as permissões de
  `https://192.168.1.20/*` e `https://*.internal/*` valem só para a extensão, sem CORS.
- **Discreta, mas à vista:** um círculo de 36 px no canto, que mostra o texto nos 5 primeiros
  segundos, ao passar o mouse e depois de enviar (E8). Nada de painéis abertos sozinhos.
- **O PDF quem baixa é a página** (E12), e ele vai ao serviço em partes; não pedir permissão de host para todos os sites.
- **A coleta (E14) não baixa nada** e o arquivo dela não leva cookie nem `Authorization`; ele tem tokens nas URLs, então nunca vai ao repositório.
- Guardar só o histórico (50 últimos) e os ajustes, em `chrome.storage.local`.
- Rodar `npm test` antes de publicar.
- **Commits:** autoria do Lucas; **sem linha `Co-Authored-By`**.
