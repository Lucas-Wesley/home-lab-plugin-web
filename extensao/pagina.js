// O botão nas páginas: nos cursos (Branas.io, LINUXtips), coleta como o vídeo chega (E14); num vídeo do YouTube, manda à Trilha (E13); numa página com frases de exemplo
// com áudio, de qualquer site, manda ao Flashcards; num PDF, manda o arquivo à Biblioteca (E12). Pelo popup, qualquer página vai a um dos dois (E10). Um círculo pequeno no canto de baixo, que mostra o nome
// ao abrir a página (alguns segundos) e ao passar o mouse, e o resultado depois de enviar. Fica num
// Shadow DOM, longe do CSS do site. O popup do ícone também envia, pedindo a este script (E8).
;(() => {
  const { APPS, acoesDaPagina, destinoDaPagina, ehPdf, nomeDoPdf } = globalThis.Destinos

  const ICONES = {
    acervo: '<path d="M4 5.5A1.5 1.5 0 015.5 4H10v16H5.5A1.5 1.5 0 014 18.5zM10 4h4v16h-4zM14.5 5l4-1 2.5 15-4 1z"/>',
    biblioteca: '<path d="M5 4.5A1.5 1.5 0 016.5 3H18v15H6.5A1.5 1.5 0 005 19.5zM5 19.5A1.5 1.5 0 006.5 21H18v-3M9 7h5"/>',
    flashcards: '<path d="M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2zM5 12h14"/><path d="M10.4 7.3a1.7 1.7 0 013.2.5c0 1-1.6 1.2-1.6 2M8.5 15.3h7M8.5 17.3h4"/>',
    trilha: '<path d="M5 19V9M12 19V5M19 19v-7"/>',
    coleta: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5M8.5 11h1.2l1-2.5 1.6 5 1-2.5h1.2"/>',
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
    .caixa[data-estado="coletando"] svg { stroke: var(--terracota); animation: pulsar 1.6s ease-in-out infinite; }
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

  // A página é um PDF aberto no Chrome: pelo tipo do documento ou pelo nome no endereço.
  const pdfAqui = () => ehPdf(location.href, document.contentType)

  function tituloDaPagina() {
    if (pdfAqui()) return (document.title || nomeDoPdf(location.href)).replace(/\.pdf$/i, '').trim()
    if (!location.hostname.endsWith('youtube.com')) return document.querySelector('h1')?.textContent.trim() || document.title
    return document.title.replace(/^\(\d+\)\s*/, '').replace(/ - YouTube$/, '')
  }

  const acaoDe = (d) => (d.app === 'coleta' ? 'Analisar vídeo' : APPS[d.app].acao)

  // A coleta (E14): o primeiro clique começa (o serviço liga o depurador do Chrome na aba), os
  // seguintes salvam. Enquanto coleta, o botão mostra quantos pedidos vieram; a pergunta a cada 2 s
  // também mantém o serviço acordado.
  let contador = 0
  function mostrarColeta(e) {
    clearInterval(contador)
    if (!e?.coletando) return false
    const texto = () =>
      e.encerrada
        ? 'Coleta interrompida: clique para salvar o que veio'
        : `Coletando: ${e.pedidos} pedidos, ${e.video} de vídeo · clique para salvar`
    mostrar('coletando', texto())
    contador = setInterval(async () => {
      try {
        e = await chrome.runtime.sendMessage({ tipo: 'coletaEstado' })
      } catch {
        e = null
      }
      if (!e?.coletando) return clearInterval(contador)
      const rotulo = host?.shadowRoot.querySelector('.texto')
      if (rotulo) rotulo.textContent = texto()
    }, 2000)
    return true
  }

  function salvarArquivo(nome, texto) {
    const url = URL.createObjectURL(new Blob([texto], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = nome
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  }

  async function alternarColeta() {
    const caixa = host.shadowRoot.querySelector('.caixa')
    try {
      if (caixa.dataset.estado !== 'coletando') {
        mostrar('enviando', 'Ligando a coleta e recarregando…')
        const e = await chrome.runtime.sendMessage({ tipo: 'coletaComecar', curso: destino.curso, pagina: location.href, titulo: document.title })
        if (e?.erro) return mostrar('erro', e.erro)
        mostrarColeta(e)
        return
      }
      clearInterval(contador)
      mostrar('enviando', 'Salvando a coleta…')
      const r = await chrome.runtime.sendMessage({ tipo: 'coletaEncerrar' })
      if (r?.erro) return mostrar('erro', r.erro)
      salvarArquivo(r.nome, r.json)
      mostrar('feito', r.mensagem)
    } catch {
      mostrar('erro', 'A extensão foi atualizada: recarregue a página.')
    }
  }

  async function enviar() {
    if (host) delete host.shadowRoot.querySelector('.caixa').dataset.apresentar
    if (!destino || host.shadowRoot.querySelector('.caixa').dataset.estado === 'enviando') return
    if (destino.app === 'coleta') return alternarColeta()
    mostrar('enviando', 'Enviando…')
    let r
    try {
      if (destino.app === 'biblioteca') r = await mandarPdf(location.href, tituloDaPagina())
      else r = await chrome.runtime.sendMessage({ tipo: 'enviar', app: destino.app, url: destino.url, titulo: tituloDaPagina() })
    } catch {
      r = { estado: 'erro', mensagem: 'A extensão foi atualizada: recarregue a página.' }
    }
    mostrar(r.estado === 'erro' ? 'erro' : 'feito', r.mensagem, r.abrir)
    return r
  }

  // O PDF vai inteiro à Biblioteca (E12). Quem baixa é a página, com o acesso dela ao site (um PDF
  // que pede login também vem); o serviço recebe o arquivo em partes, em base64, e o envia.
  const PARTE = 8 << 20
  const emBase64 = (pedaco) =>
    new Promise((ok, falha) => {
      const leitor = new FileReader()
      leitor.onload = () => ok(String(leitor.result).replace(/^data:[^,]*,/, ''))
      leitor.onerror = () => falha(leitor.error)
      leitor.readAsDataURL(pedaco)
    })

  async function mandarPdf(endereco, titulo) {
    const url = acoesDaPagina(endereco, true)[0]?.url || endereco
    const falhar = async (mensagem) => {
      const resultado = { estado: 'erro', mensagem, abrir: '' }
      await chrome.runtime.sendMessage({ tipo: 'erroDoPdf', url, titulo, resultado })
      return resultado
    }
    let arquivo
    try {
      const resposta = await fetch(endereco, { credentials: 'include' })
      if (!resposta.ok) throw new Error(String(resposta.status))
      arquivo = await resposta.blob()
    } catch {
      return falhar('Não deu para baixar o PDF daqui: abra o PDF e envie de lá.')
    }
    const inicio = new TextDecoder().decode(await arquivo.slice(0, 5).arrayBuffer())
    if (inicio !== '%PDF-') return falhar('O endereço não devolveu um PDF (talvez peça login).')
    const id = crypto.randomUUID()
    for (let i = 0; i < arquivo.size; i += PARTE) {
      await chrome.runtime.sendMessage({ tipo: 'pdfParte', id, dados: await emBase64(arquivo.slice(i, i + PARTE)) })
    }
    return chrome.runtime.sendMessage({ tipo: 'enviar', app: 'biblioteca', url, titulo, pdf: id, nome: nomeDoPdf(endereco) })
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
    const novo = destinoDaPagina(location.href, !pdfAqui() && temExemplos(), pdfAqui())
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
    mostrar('parado', acaoDe(novo))
    // O nome fica à vista nos primeiros segundos, para o botão ser notado; depois, só o ícone.
    const caixa = host.shadowRoot.querySelector('.caixa')
    caixa.dataset.apresentar = ''
    clearTimeout(apresentar)
    apresentar = setTimeout(() => delete caixa.dataset.apresentar, 5000)
    // A página recarregou no meio de uma coleta: o botão volta a mostrar que coleta.
    if (novo.app === 'coleta') chrome.runtime.sendMessage({ tipo: 'coletaEstado' }).then(mostrarColeta).catch(() => {})
  }

  // A aula aberta num dos cursos (E15): o nome do curso, o do módulo e o da aula, lidos da página
  // para o Lucas não digitar. Os sites não têm marcação comum, então vale o que se vê:
  // - aula: o texto que aparece duas vezes (no alto da aula e marcado na lista do módulo) ou o item
  //   marcado como atual (escolherTitulo, em aulas.js); sem isso, o primeiro <h1>/<h2>;
  // - módulo: o cabeçalho de seção logo antes do grupo onde a aula está na lista;
  // - curso: o texto logo antes do "0% concluído" (Branas.io); na LINUXtips, o nome do treinamento
  //   na URL. O nome que o Lucas escrever para o curso fica lembrado. O popup deixa corrigir tudo.
  const { GENERICOS, PARECE_MODULO, PROGRESSO, NAO_E_AULA, escolherTitulo, tituloLimpo, chaveDoCurso, cursoPadrao, cursoDaPagina } = { ...globalThis.Aulas, ...globalThis.Destinos }
  const textoDe = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim()
  // Só o texto do próprio elemento, sem o dos filhos ("MODULO 1 - …" sem o "1h 13min 1/10" ao lado).
  const textoProprio = (el) =>
    [...(el?.childNodes || [])]
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
  const visivel = (el) => {
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0
  }
  const ATIVO = /(^|[\s_-])(active|current|selected|atual|ativa|ativo)($|[\s_-])/i
  function marcadoComoAtual(el) {
    for (let a = el, n = 0; a && a !== document.body && n < 5; a = a.parentElement, n++) {
      const corrente = a.getAttribute('aria-current')
      if ((corrente && corrente !== 'false') || a.getAttribute('aria-selected') === 'true' || a.dataset?.state === 'active' || a.dataset?.active === 'true') return true
      if (typeof a.className === 'string' && ATIVO.test(a.className)) return true
    }
    return false
  }

  // Os elementos com texto próprio visíveis (o que se lê na tela), com o texto inteiro deles.
  function textosVisiveis() {
    const lista = []
    for (const el of document.body.querySelectorAll('*')) {
      if (/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|svg)$/i.test(el.tagName) || !textoProprio(el)) continue
      const texto = textoDe(el)
      if (texto.length > 150 || !visivel(el)) continue
      lista.push({ el, texto })
    }
    return lista
  }

  function tituloDaAula(textos) {
    const escolhido = escolherTitulo(textos.map(({ el, texto }) => ({ texto, fonte: parseFloat(getComputedStyle(el).fontSize) || 0, ativo: marcadoComoAtual(el) })))
    if (escolhido) return escolhido
    for (const sel of ['main h1', 'h1', 'main h2', 'h2']) {
      for (const el of document.querySelectorAll(sel)) {
        const t = textoDe(el)
        if (visivel(el) && t.length > 2 && t.length < 200 && !GENERICOS.test(t)) return t
      }
    }
    return tituloLimpo(document.title)
  }

  // O texto de módulo dentro de um cabeçalho: o próprio, ou o do filho que parece módulo.
  function moduloEm(el) {
    const t = textoDe(el)
    if (t.length < 120 && PARECE_MODULO.test(t) && !/\d\s*\/\s*\d+$/.test(t)) return t
    for (const filho of el.querySelectorAll('*')) {
      const p = textoProprio(filho)
      if (p && PARECE_MODULO.test(p)) return textoDe(filho)
    }
    return ''
  }

  function moduloDaAula(titulo, textos) {
    if (!titulo) return ''
    const alvo = titulo.toLowerCase()
    // As vezes em que o nome da aula aparece; o cabeçalho do módulo fica antes do grupo de uma delas.
    for (const { el, texto } of textos) {
      if (texto.toLowerCase() !== alvo) continue
      let atual = el
      for (let nivel = 0; atual && nivel < 8; nivel++, atual = atual.parentElement) {
        for (let irmao = atual.previousElementSibling, n = 0; irmao && n < 3; irmao = irmao.previousElementSibling, n++) {
          const t = moduloEm(irmao)
          if (t && t.toLowerCase() !== alvo) return t
        }
      }
    }
    return ''
  }

  // O nome do curso: o texto logo antes do "0% concluído" (ou do bloco que o contém).
  function cursoDaAula(textos) {
    const progresso = textos.find(({ texto }) => PROGRESSO.test(texto))
    if (!progresso) return ''
    for (let atual = progresso.el, nivel = 0; atual && nivel < 4; nivel++, atual = atual.parentElement) {
      for (let irmao = atual.previousElementSibling; irmao; irmao = irmao.previousElementSibling) {
        const t = textoDe(irmao)
        if (t.length > 3 && t.length < 150 && !GENERICOS.test(t) && !NAO_E_AULA.test(t) && !/^[<‹«]/.test(t)) return t
      }
    }
    return ''
  }

  function aulaDaPagina() {
    const curso = cursoDaPagina(location.href)
    if (!curso) return null
    const textos = textosVisiveis()
    const titulo = tituloDaAula(textos)
    return {
      plataforma: curso.curso,
      nomePlataforma: curso.nome,
      titulo,
      modulo: moduloDaAula(titulo, textos),
      curso: cursoDaAula(textos),
      pagina: location.href,
      chaveCurso: chaveDoCurso(location.href),
      cursoPadrao: cursoPadrao(location.href),
    }
  }

  // O popup do ícone pergunta o que esta página pode fazer (E10: qualquer página vai ao Acervo ou
  // ao Flashcards) e pede para enviar a um dos apps; o resultado aparece no botão.
  chrome.runtime.onMessage.addListener((mensagem, _remetente, responder) => {
    if (mensagem?.tipo === 'destino') {
      const acoes = acoesDaPagina(location.href, pdfAqui())
      if (!acoes.length) responder(null)
      else {
        const antes = destino
        destino = acoes[0]
        responder({ titulo: tituloDaPagina(), acoes: acoes.map((a) => ({ app: a.app, acao: APPS[a.app].acao })) })
        destino = antes
      }
      return false
    }
    if (mensagem?.tipo === 'aulaDoCurso') {
      responder(aulaDaPagina())
      return false
    }
    if (mensagem?.tipo === 'enviarDaqui') {
      const escolhida = acoesDaPagina(location.href, pdfAqui()).find((a) => a.app === mensagem.app)
      if (!escolhida) {
        responder(false)
        return false
      }
      destino = escolhida
      atual = escolhida.url
      // O botão aparece (se ainda não estava) para mostrar o resultado.
      if (!host || !host.isConnected) {
        montar()
        escuro()
      }
      enviar().then(() => responder(true))
      return true
    }
    // Botão direito no PDF aberto (o resultado aparece no botão) ou num link para PDF (E12).
    if (mensagem?.tipo === 'pdfParaBiblioteca') {
      if (mensagem.doLink) {
        mandarPdf(mensagem.url, nomeDoPdf(mensagem.url).replace(/\.pdf$/i, '')).then(responder)
        return true
      }
      destino = acoesDaPagina(location.href, true)[0]
      atual = destino?.url || ''
      if (!destino) {
        responder(null)
        return false
      }
      if (!host || !host.isConnected) {
        montar()
        escuro()
      }
      enviar().then(responder)
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
