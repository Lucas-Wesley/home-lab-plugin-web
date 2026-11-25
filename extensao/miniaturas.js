// O botão "Cortes" nas miniaturas do YouTube (E27): na lista do lado do vídeo, no canal, na busca e no
// início, passar o mouse numa miniatura mostra um botão pequeno no canto de cima, à esquerda, que manda
// o vídeo ao Cortes sem abri-lo. Só no YouTube. Quem envia é o serviço, como no botão da página.
;(() => {
  if (!/(^|\.)youtube\.com$/.test(location.hostname) || location.hostname === 'music.youtube.com') return
  const { videoDoYouTube } = globalThis.Destinos

  const TESOURA = '<circle cx="6" cy="7" r="2.6"/><circle cx="6" cy="17" r="2.6"/><path d="M8.2 8.6L20 17.2M8.2 15.4L20 6.8"/>'
  const FEITO = '<path d="M5 12.5l4.5 4.5L19 7.5"/>'
  const ERRO = '<path d="M12 7v6M12 16.5h.01"/>'

  // Fora do Shadow DOM, só a posição e o "aparecer ao passar o mouse" (precisa ver o pai).
  const estiloDaPagina = document.createElement('style')
  estiloDaPagina.textContent = `
    homelab-miniatura { position: absolute; top: 6px; left: 6px; z-index: 900; opacity: 0; transition: opacity .15s; pointer-events: auto; }
    :hover > homelab-miniatura, homelab-miniatura:focus-within, homelab-miniatura[data-estado]:not([data-estado="parado"]) { opacity: 1; }`
  document.documentElement.appendChild(estiloDaPagina)

  const ESTILO = `
    :host { all: initial; font: 600 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    button { all: unset; display: flex; align-items: center; gap: 5px; height: 26px; padding: 0 9px 0 7px; border-radius: 999px;
      background: rgba(15, 15, 15, .82); color: #fff; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,.35); white-space: nowrap; }
    button:hover { background: #d7141a; }
    button:focus-visible { outline: 2px solid #8eb1d6; outline-offset: 2px; }
    svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
    :host([data-estado="enviando"]) svg { animation: pulsar 1s ease-in-out infinite; }
    :host([data-estado="feito"]) button { background: #1f6f43; }
    :host([data-estado="repetido"]) button { background: #33608c; }
    :host([data-estado="erro"]) button { background: #b4553a; }
    @keyframes pulsar { 50% { opacity: .35; } }`

  function tituloDe(link) {
    const bloco = link.closest('ytd-rich-item-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, ytd-video-renderer, ytd-playlist-video-renderer, yt-lockup-view-model')
    const el = bloco?.querySelector('#video-title, .yt-lockup-metadata-view-model__title, h3')
    return (el?.getAttribute('title') || el?.textContent || link.getAttribute('aria-label') || link.title || '').replace(/\s+/g, ' ').trim()
  }

  function botaoPara(link) {
    const host = document.createElement('homelab-miniatura')
    host.dataset.estado = 'parado'
    const raiz = host.attachShadow({ mode: 'open' })
    raiz.innerHTML = `<style>${ESTILO}</style><button type="button" title="Mandar ao Cortes" aria-label="Mandar ao Cortes"><svg viewBox="0 0 24 24" aria-hidden="true">${TESOURA}</svg><span>Cortes</span></button>`
    const botao = raiz.querySelector('button')
    const mostrar = (estado, texto, icone, dica) => {
      host.dataset.estado = estado
      raiz.querySelector('span').textContent = texto
      raiz.querySelector('svg').innerHTML = icone
      botao.title = dica
    }
    // O clique não pode chegar ao link (abriria o vídeo) nem ao YouTube (prévia, menu).
    for (const tipo of ['pointerdown', 'mousedown', 'mouseup', 'touchstart']) host.addEventListener(tipo, (e) => e.stopPropagation())
    host.addEventListener('click', async (e) => {
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()
      if (host.dataset.estado === 'enviando') return
      const video = videoDoYouTube(link.href)
      if (!video) return
      mostrar('enviando', 'Enviando…', TESOURA, 'Enviando ao Cortes')
      let r
      try {
        r = await chrome.runtime.sendMessage({ tipo: 'enviar', app: 'cortes', url: `https://www.youtube.com/watch?v=${video}`, titulo: tituloDe(link) })
      } catch {
        r = { estado: 'erro', mensagem: 'A extensão foi atualizada: recarregue a página.' }
      }
      if (r.estado === 'erro') mostrar('erro', 'Erro', ERRO, r.mensagem)
      else mostrar(r.estado === 'repetido' ? 'repetido' : 'feito', r.estado === 'repetido' ? 'Já está' : 'No Cortes', FEITO, r.mensagem)
    })
    host.reiniciar = () => mostrar('parado', 'Cortes', TESOURA, 'Mandar ao Cortes')
    return host
  }

  // As miniaturas: link para um vídeo (/watch?v=) com imagem dentro. Fora o player (tela final) e os Shorts.
  function procurar() {
    for (const link of document.querySelectorAll('a[href*="/watch?v="]')) {
      if (link.closest('#movie_player, ytd-player, ytd-reel-item-renderer, ytm-shorts-lockup-view-model')) continue
      if (!link.querySelector('img, yt-image, yt-thumbnail-view-model')) continue
      const pai = link.parentElement
      if (!pai) continue
      let host = pai.querySelector(':scope > homelab-miniatura')
      if (!host) {
        if (getComputedStyle(pai).position === 'static') pai.style.position = 'relative'
        host = botaoPara(link)
        pai.appendChild(host)
      }
      // O YouTube reaproveita os blocos ao rolar: outro vídeo no mesmo lugar volta o botão ao começo.
      if (host.dataset.video !== link.href) {
        if (host.dataset.video) host.reiniciar()
        host.dataset.video = link.href
      }
    }
  }

  let espera = 0
  new MutationObserver(() => {
    clearTimeout(espera)
    espera = setTimeout(procurar, 400)
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] })
  procurar()
})()
