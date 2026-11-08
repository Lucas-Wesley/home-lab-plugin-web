# Homelab no Chrome

Extensão do Chrome do **ecossistema de apps pessoais do Lucas**. Ela vê em que página você está e
põe um botão pequeno no canto de baixo para mandar o link ao app certo:

- **Vídeo do YouTube** → **Acervo**: o vídeo vira uma Referência e entra na fila (extrair →
  organizar), como se o link fosse colado lá.
- **Página com frases de exemplo**, de qualquer site → **Flashcards**: as 3 frases mais didáticas,
  com tradução e áudio, viram uma proposta de cartões para revisar.
- **Qualquer página ou link** (artigo, blog, site) → **Acervo** ou **Flashcards**, pelo ícone da
  extensão ou pelo botão direito: no Acervo, a página vira uma Referência (o texto é lido e
  organizado na fila, e dali dá para gerar flashcards do conteúdo).

A extensão não guarda nada além do histórico do que foi enviado (os últimos 50) e dos ajustes.
Não tem servidor próprio: fala direto com o Acervo e o Flashcards, na rede de casa.

## Instalar (uma vez)

1. No Chrome, abra `chrome://extensions`.
2. Ligue o **Modo do desenvolvedor** (canto superior direito).
3. **Carregar sem compactação** → escolha a pasta `extensao/` deste repositório
   (`~/Desenvolvimento/lucas/homelab/home-lab-plugin-web/extensao`).
4. Fixe o ícone (o quebra-cabeça da barra → alfinete em **Homelab**), se quiser ver o histórico
   com um clique.

Precisa do certificado do homelab instalado no Mac (o mesmo que abre a Biblioteca sem aviso).

**Atualizar:** depois de um `git pull`, em `chrome://extensions`, o botão ↻ do cartão **Homelab**.
As abas abertas antes disso precisam ser recarregadas.

## Usar

- Num vídeo do YouTube, o círculo do canto de baixo à direita mostra **Mandar ao Acervo** nos
  primeiros segundos (depois, passe o mouse nele). O ícone da extensão também tem esse botão, em
  **Nesta página**. Depois de enviar, ele mostra o resultado ("Na fila do Acervo", "Já está no Acervo") e
  o link **Abrir**.
- Numa página com frases de exemplo e áudio: **Fazer flashcards**. **Abrir** leva à proposta no
  Flashcards, onde dá para trocar o baralho antes de aprovar.
- Em qualquer outra página, o ícone da extensão mostra, em **Nesta página**, **Mandar ao Acervo** e
  **Fazer flashcards**.
- **Botão direito** num link (ou na página): **Mandar ao Acervo** ou **Fazer flashcards**, sem abrir
  o link. O ícone da extensão mostra ✓ (ou ! se deu erro) por alguns segundos, e o envio fica no
  histórico. Na primeira vez depois de atualizar, o Chrome pode pedir para aceitar a permissão nova.
- O **ícone** da extensão mostra o histórico e os ajustes: o baralho dos flashcards (padrão: o
  **Inglês**), o tipo dos cartões e os endereços dos apps.

## Desenvolver

Sem build: o que está em `extensao/` é o que o Chrome carrega.

| Comando | O que faz |
|---|---|
| `npm install` | Instala o Playwright (só para os testes) |
| `npm test` | Testes de unidade (`node --test`) e de navegador: um Chromium com a extensão, páginas do YouTube e de outros sites simuladas e um Acervo/Flashcards falso |

Documentação: [`docs/DECISOES.md`](docs/DECISOES.md). Visual: o design system comum,
[`docs/DESIGN-SYSTEM.md`](docs/DESIGN-SYSTEM.md).
