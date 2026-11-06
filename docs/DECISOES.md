# Decisões

Estado em 06/11/2026: primeira versão feita e testada. Instalada pelo Lucas com "Carregar sem
compactação" (não está na Chrome Web Store).

| # | Decisão | Por quê |
|---|---|---|
| E1 | **Extensão do Chrome, Manifest V3, sem build.** Scripts comuns em `extensao/`; os testes usam Node e Playwright | Pedido do Lucas em 06/11/2026. É pequena: um build só atrapalharia o "carregar sem compactação" e a atualização com `git pull`. |
| E2 | **Instalada sem compactação**, a partir da pasta do repositório; atualizar = `git pull` + ↻ em `chrome://extensions` | Publicar na Chrome Web Store pede conta de desenvolvedor, revisão e deixaria o endereço do homelab público. É só para o Chrome do Lucas. |
| E3 | **Um botão por página, só onde serve:** vídeo do YouTube (`/watch`, `/shorts/`, `/live/`) → Acervo; página do Mairo Vergara **com frases de exemplo com áudio** (`figure.wp-block-audio`) → Flashcards. A inicial e as listas do Mairo não têm botão | Discreto: não aparece onde não faz nada. Os vídeos aceitos são os mesmos que o Acervo aceita; o link vai limpo (sem lista, tempo ou rastreio). |
| E4 | **Círculo de 36 px no canto de baixo à direita**, de vidro (design system), em Shadow DOM; o nome aparece ao passar o mouse (e, desde E8, nos 5 primeiros segundos); depois de enviar, o resultado e **Abrir** ficam à vista 6 s. Some em tela cheia; segue o tema escuro do YouTube | Pedido do Lucas: "bem clean e discreto". O Shadow DOM isola o botão do CSS do site, e o site do dele. |
| E5 | **Quem fala com os apps é o service worker**, com a permissão de `https://192.168.1.20/*`; a página só manda uma mensagem. O Mac já confia no certificado do homelab | Com a permissão do host, a extensão não esbarra em CORS nem expõe nada à página do site. |
| E6 | **Guarda só o histórico** (os 50 últimos envios: título, app, quando, resultado e link para abrir) **e os ajustes** (baralho e tipo dos cartões do Mairo, endereços dos apps), em `chrome.storage.local` | Pedido do Lucas: "não precisa salvar muita coisa, talvez o histórico". |
| E7 | **Baralho dos links do Mairo:** escolhido no popup (lista do `GET /api/baralhos` do Flashcards); o padrão é um baralho novo para cada página, com o nome da expressão, como no app | O Flashcards lembra o último baralho no navegador dele, que a extensão não enxerga. |
| E8 | **Mais à vista (06/11/2026):** o círculo fica opaco, com o ícone na cor do texto; ao abrir a página, mostra o nome da ação por 5 s e recolhe. O **popup também envia**: se a aba aberta tem botão, ele mostra "Nesta página" com o título e a ação, e pede à página para enviar (o resultado aparece no botão e no histórico) | No primeiro uso o Lucas não achou o botão (apagado a 72% sobre o YouTube escuro) e procurou no ícone da extensão. O popup pergunta à página por mensagem, então não precisa da permissão "tabs". |

## Próximos passos

Outros sites e outras ações, quando o Lucas pedir (ele avisou que vai acrescentar funcionalidades).
