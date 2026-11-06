// O botão nas páginas: num vídeo do YouTube, manda ao Acervo; numa página com frases de exemplo
// com áudio, de qualquer site, manda ao Flashcards. Um círculo pequeno no canto de baixo, que mostra o nome
// ao abrir a página (alguns segundos) e ao passar o mouse, e o resultado depois de enviar. Fica num
// Shadow DOM, longe do CSS do site. O popup do ícone também envia, pedindo a este script (E8).
;(() => {
  const { APPS, destinoDaPagina } = globalThis.Destinos

  const ICONES = {
    acervo: '<path d="M4 5.5A1.5 1.5 0 015.5 4H10v16H5.5A1.5 1.5 0 014 18.5zM10 4h4v16h-4zM14.5 5l4-1 2.5 15-4 1z"/>',
    flashcards: '<rect x="8" y="4" width="12" height="14" rx="1.5"/><path d="M5 7.5v11A1.5 1.5 0 006.5 20H16"/>',
    feito: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    erro: '<path d="M12 7v6M12 16.5h.01"/><circle cx="12" cy="12" r="9"/>',
  }

  const ESTILO = `
    :host { all: initial; position: fixed; right: 20px; bottom: 20px; z-index: 2147483000;
      --fundo: rgba(251, 250, 248, 0.82); --texto: #1b1b1a; --suave: #6d6a65; --linha: rgba(0, 0, 0, 0.08);
      --azul: #33608c; --terracota: #b4553a; font: 500 13px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    :host([data-escuro]) { --fundo: rgba(28, 28, 27, 0.8); --texto: #e7e5e0; --suave: #9d9991; --linha: rgba(255, 255, 255, 0.1);
      --azul: #8eb1d6; --terracota: #e3967c; }
    @media (prefers-color-scheme: dark) { :host(:not([data-claro])) { --fundo: rgba(28, 28, 27, 0.8); --texto: #e7e5e0;
      --suave: #9d9991; --linha: rgba(255, 255, 255, 0.1); --azul: #8eb1d6; --terracota: #e3967c; } }
    .caixa { display: flex; align-items: center; height: 36px; padding: 0; border: 1px solid var(--linha); border-radius: 999px;
      background: var(--fundo); color: var(--texto); box-shadow: 0 4px 18px rgba(0, 0, 0, 0.18);
      backdrop-filter: blur(20px) saturate(1.6); -webkit-backdrop-filter: blur(20px) saturate(1.6); }
    :host([data-escuro]) .caixa { border-color: rgba(255, 255, 255, 0.18); }
    button { all: unset; display: flex; align-items: center; gap: 8px; height: 36px; padding: 0 9px; border-radius: 999px; cursor: pointer; color: inherit; }
    button:focus-visible { outline: 2px solid var(--azul); outline-offset: 2px; }
    svg { flex: none; width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
    .texto { max-width: 0; overflow: hidden; white-space: nowrap; transition: max-width 0.2s ease; }
    .caixa:hover .texto, .caixa:focus-within .texto, .caixa[data-apresentar] .texto,
    .caixa:not([data-estado="parado"]) .texto { max-width: 260px; }
    .caixa[data-apresentar] button { padding-right: 14px; }
    .caixa[data-estado="feito"] svg { stroke: var(--azul); }
    .caixa.caixa[data-estado="erro"] { color: var(--terracota); }
    .caixa[data-estado="enviando"] svg { animation: pulsar 1s ease-in-out infinite; }
    a { margin-right: 12px; color: var(--azul); text-decoration: none; font-weight: 600; }
    a:hover { text-decoration: underline; }
    a[hidden] { display: none; }
    .caixa[data-estado="parado"]:not(:hover):not(:focus-within) a { display: none; }
    @keyframes pulsar { 50% { opacity: 0.35; } }
  `

  let host = null
  let atual = '' // a URL da página com o botão de agora
  let destino = null
  let recolher = 0
  let apresentar = 0

  function montar() {
    host = document.createElement('homelab-envio')
    const raiz = host.attachShadow({ mode: 'open' })
    raiz.innerHTML = `<style>${ESTILO}</style>
      <div class="caixa" data-estado="parado">
        <button type="button"><svg viewBox="0 0 24 24" aria-hidden="true"></svg><span class="texto"></span></button>
        <a target="_blank" rel="noopener" hidden>Abrir</a>
      </div>`
    raiz.querySelector('button').addEventListener('click', enviar)
    document.documentElement.appendChild(host)
  }

  function mostrar(estado, texto, abrir = '') {
    const raiz = host.shadowRoot
    const caixa = raiz.querySelector('.caixa')
    caixa.dataset.estado = estado
    raiz.querySelector('svg').innerHTML = ICONES[estado === 'feito' ? 'feito' : estado === 'erro' ? 'erro' : destino.app]
    raiz.querySelector('.texto').textContent = texto
    raiz.querySelector('button').setAttribute('aria-label', texto)
    raiz.querySelector('button').disabled = estado === 'enviando'
    const link = raiz.querySelector('a')
    link.hidden = !abrir
    link.href = abrir || '#'
    // O resultado fica à vista alguns segundos; depois, só o ícone (o mouse por cima mostra de novo).
    clearTimeout(recolher)
    if (estado === 'feito' || estado === 'erro') {
      recolher = setTimeout(() => {
        caixa.dataset.estado = 'parado'
        raiz.querySelector('button').setAttribute('aria-label', texto)
      }, 6000)
    }
  }

  function tituloDaPagina() {
    if (destino.app === 'flashcards') return document.querySelector('h1')?.textContent.trim() || document.title
    return document.title.replace(/^\(\d+\)\s*/, '').replace(/ - YouTube$/, '')
  }

  async function enviar() {
    if (host) delete host.shadowRoot.querySelector('.caixa').dataset.apresentar
    if (!destino || host.shadowRoot.querySelector('.caixa').dataset.estado === 'enviando') return
    mostrar('enviando', 'Enviando…')
    let r
    try {
      r = await chrome.runtime.sendMessage({ tipo: 'enviar', app: destino.app, url: destino.url, titulo: tituloDaPagina() })
    } catch {
      r = { estado: 'erro', mensagem: 'A extensão foi atualizada: recarregue a página.' }
    }
    mostrar(r.estado === 'erro' ? 'erro' : 'feito', r.mensagem, r.abrir)
  }

  function escuro() {
    // O YouTube tem o próprio tema escuro, que pode ser diferente do sistema.
    const yt = document.documentElement.hasAttribute('dark')
    const ytClaro = location.hostname.endsWith('youtube.com') && !yt
    host.toggleAttribute('data-escuro', yt)
    host.toggleAttribute('data-claro', ytClaro)
  }

  // A página mostra frases de exemplo com áudio do jeito comum: um parágrafo com a frase em negrito,
  // uma quebra de linha e a tradução, e algum áudio na página. Nas outras, o botão fica só no popup.
  function temExemplos() {
    if (!document.querySelector('audio[src], audio source[src]')) return false
    return [...document.querySelectorAll('p')].some((p) => p.querySelector('strong, b') && p.querySelector('br'))
  }

  function atualizar() {
    const novo = destinoDaPagina(location.href, temExemplos())
    if (!novo) {
      host?.remove()
      host = null
      atual = ''
      return
    }
    if (host && novo.url === atual && host.isConnected) return
    destino = novo
    atual = novo.url
    if (!host || !host.isConnected) montar()
    escuro()
    mostrar('parado', APPS[novo.app].acao)
    // O nome fica à vista nos primeiros segundos, para o botão ser notado; depois, só o ícone.
    const caixa = host.shadowRoot.querySelector('.caixa')
    caixa.dataset.apresentar = ''
    clearTimeout(apresentar)
    apresentar = setTimeout(() => delete caixa.dataset.apresentar, 5000)
  }

  // O popup do ícone pergunta o que esta página manda e pede para enviar.
  chrome.runtime.onMessage.addListener((mensagem, _remetente, responder) => {
    // Sem botão na página, qualquer página ainda pode ir ao Flashcards pelo popup.
    const doPopup = () => (host && destino ? destino : destinoDaPagina(location.href, true))
    if (mensagem?.tipo === 'destino') {
      const d = doPopup()
      if (!d) responder(null)
      else {
        const antes = destino
        destino = d
        responder({ app: d.app, acao: APPS[d.app].acao, titulo: tituloDaPagina() })
        destino = antes
      }
      return false
    }
    if (mensagem?.tipo === 'enviarDaqui') {
      // O botão aparece (se ainda não estava) para mostrar o resultado.
      if (!host || !host.isConnected) {
        destino = doPopup()
        atual = destino.url
        montar()
        escuro()
      }
      enviar().then(() => responder(true))
      return true
    }
    return false
  })

  // No tela cheia, o botão some.
  document.addEventListener('fullscreenchange', () => {
    if (host) host.style.display = document.fullscreenElement ? 'none' : ''
  })
  // O YouTube troca de vídeo sem recarregar a página.
  window.addEventListener('yt-navigate-finish', atualizar)
  window.addEventListener('popstate', atualizar)
  let vista = location.href
  setInterval(() => {
    if (location.href === vista && (!host || host.isConnected)) return
    vista = location.href
    atualizar()
  }, 1000)
  atualizar()
})()
