// O botão nas páginas: nos cursos (Branas.io, LINUXtips, Full Cycle, Tech Leads Club), coleta como o vídeo chega (E14); num vídeo do YouTube, manda à Trilha (E13); numa página com frases de exemplo
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
  // - módulo: o cabeçalho de seção logo antes do grupo onde a aula está na lista ("Módulo 1 …", o
  //   nome ao lado de "3 aulas", ou o botão/título que abre a sanfona);
  // - curso: o texto logo antes do "0% concluído" (Branas.io); o caminho de navegação "Meus Cursos ›
  //   … › curso" (Full Cycle); o texto igual ao curso da URL /c/<curso> (Tech Leads Club); na LINUXtips,
  //   o nome do treinamento na URL. O nome que o Lucas escrever para o curso fica lembrado. O popup
  //   deixa corrigir tudo.
  const { GENERICOS, PARECE_MODULO, PROGRESSO, NAO_E_AULA, CONTAGEM, cursoDoEndereco, cursoDoCaminho, escolherTitulo, tituloLimpo, chaveDoCurso, cursoPadrao, cursoDaPagina, ehEmbed, LINK_AULA_ESCOLA, LINK_MODULO_ESCOLA, nomeBonito, semNumero } = { ...globalThis.Aulas, ...globalThis.Destinos }
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
    // A aula escolhida num <select> ("Conceitos Básicos" no alto da Full Cycle): a opção não tem caixa própria.
    for (const sel of document.querySelectorAll('select')) {
      const opcao = sel.selectedOptions?.[0]
      if (opcao && visivel(sel) && textoDe(opcao)) lista.push({ el: sel, texto: textoDe(opcao) })
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

  // O texto de módulo dentro de um cabeçalho: o próprio, ou o do filho que parece módulo; o nome
  // ao lado da contagem ("Patterns de Desenvolvimento Enterprise · 3 aulas"); ou o título/botão de
  // uma sanfona ("Conceitos Básicos de Pipelines").
  const nomeEm = (el) => {
    for (const filho of [el, ...el.querySelectorAll('*')]) {
      const p = textoProprio(filho)
      if (p && p.length > 2 && !NAO_E_AULA.test(p) && !CONTAGEM.test(p) && /\p{L}{3}/u.test(p)) return p
    }
    return ''
  }
  const CABECALHO = 'h2, h3, h4, h5, h6, summary, button, [role="button"], [aria-expanded]'
  function moduloEm(el) {
    const t = textoDe(el)
    if (t.length < 120 && PARECE_MODULO.test(t) && !/\d\s*\/\s*\d+$/.test(t)) return t
    for (const filho of el.querySelectorAll('*')) {
      const p = textoProprio(filho)
      // Só "Aula" (o rótulo do item da Tech Leads Club) não é módulo.
      if (p && PARECE_MODULO.test(p) && !GENERICOS.test(p)) return textoDe(filho)
    }
    if ([el, ...el.querySelectorAll('*')].some((f) => CONTAGEM.test(textoProprio(f)))) return nomeEm(el)
    if (t.length < 150 && (el.matches(CABECALHO) || el.querySelector(CABECALHO))) return nomeEm(el)
    return ''
  }

  const primeiraClasse = (el) => (typeof el.className === 'string' ? el.className.trim().split(/\s+/)[0] : '')

  function moduloDaAula(titulo, textos) {
    if (!titulo) return ''
    const alvo = titulo.toLowerCase()
    // As vezes em que o nome da aula aparece; o cabeçalho do módulo fica antes do grupo de uma delas.
    // Primeiro a vez da lista lateral (o cabeçalho do módulo fica lá); o título no alto e o <select> por último.
    const LISTA = 'li, ul, ol, aside, nav, [role="list"], [role="listitem"], [role="tree"], [role="treeitem"]'
    const ordem = ({ el }) => (el.tagName === 'SELECT' ? 2 : el.closest(LISTA) || marcadoComoAtual(el) ? 0 : 1)
    const vezes = textos.filter(({ texto }) => texto.toLowerCase() === alvo).sort((a, b) => ordem(a) - ordem(b))
    for (const { el } of vezes) {
      let atual = el
      for (let nivel = 0; atual && nivel < 8; nivel++, atual = atual.parentElement) {
        for (let irmao = atual.previousElementSibling, n = 0; irmao && n < 3; irmao = irmao.previousElementSibling, n++) {
          // Um irmão do mesmo tipo é outra aula da lista, não o cabeçalho.
          if (irmao.tagName === atual.tagName && primeiraClasse(irmao) === primeiraClasse(atual)) continue
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

  // O caminho de navegação ("Meus Cursos › … › curso"): o marcado como breadcrumb ou o bloco onde
  // está o "Meus Cursos".
  function cursoDoCaminhoDaPagina(titulo) {
    let caminho = document.querySelector('nav[aria-label*="breadcrumb" i], [class*="breadcrumb" i], [aria-label*="breadcrumb" i]')
    if (!caminho) {
      // O "Meus Cursos" do caminho é o último (o primeiro costuma ser o do menu do site).
      const inicio = [...document.querySelectorAll("a, span, li, div")].findLast((el) => /^meus cursos$/i.test(textoProprio(el)) && visivel(el))
      for (let a = inicio?.parentElement, n = 0; a && n < 4; a = a.parentElement, n++) {
        if (a.querySelectorAll('a').length >= 2 || a.children.length >= 3) {
          caminho = a
          break
        }
      }
    }
    if (!caminho) return ''
    const itens = [...caminho.querySelectorAll('*')].filter((el) => textoProprio(el) && visivel(el)).map(textoProprio)
    return cursoDoCaminho(itens, titulo)
  }

  function aulaDaPagina() {
    const curso = cursoDaPagina(location.href)
    if (!curso) return null
    const textos = textosVisiveis()
    const titulo = tituloDaAula(textos)
    // E20: na escola (Cademí), a aula leva também o texto da página e o player embutido (YouTube/Vimeo).
    if (curso.escola) {
      const grupo = gruposDeAulas().find((g) => g.aulas.some((a) => a.url === location.origin + location.pathname.replace(/\/+$/, '')))
      return {
        plataforma: curso.curso,
        nomePlataforma: curso.nome,
        escola: true,
        ehAula: LINK_AULA_ESCOLA.test(location.pathname),
        titulo,
        modulo: nomeBonito(grupo?.modulo || moduloDaAula(titulo, textos)),
        curso: '',
        pagina: location.origin + location.pathname,
        chaveCurso: chaveDoCurso(location.href),
        cursoPadrao: nomeBonito(caminhoDaEscola()),
        texto: textoDaAula(titulo),
        anexos: anexosDaPagina(),
        embeds: embedsDaPagina(),
      }
    }
    return {
      plataforma: curso.curso,
      nomePlataforma: curso.nome,
      titulo,
      modulo: moduloDaAula(titulo, textos),
      curso: cursoDaAula(textos) || cursoDoCaminhoDaPagina(titulo) || cursoDoEndereco(location.href, textos.map((t) => t.texto)),
      pagina: location.href,
      chaveCurso: chaveDoCurso(location.href),
      cursoPadrao: cursoPadrao(location.href),
    }
  }


  // ---------- E20: a escola inteira (Chef Enzo Neto, área de membros da Cademí) ----------
  // Prints de 22/11: a vitrine tem fileiras com um nome ("AS PRAÇAS DA COZINHA PRÁTICA") e cartões (imagens)
  // que levam ao módulo (/area/conteudo/modulo/<n>); a aula (/area/conteudo/aula/<n>) tem o vídeo, o
  // caminho "Início › Praças - CDPS", o título, o texto (transcrição, notas) e, ao lado, o módulo com
  // "N aulas" e a lista numerada ("1. Bases pronta = economia de tempo"). Os nomes vêm do que se lê;
  // nada aqui depende de classe CSS.
  const enderecoDe = (a) => {
    try {
      const u = new URL(a.getAttribute('href'), location.href)
      return u.origin === location.origin ? u.origin + u.pathname.replace(/\/+$/, '') : ''
    } catch {
      return ''
    }
  }

  // O nome da fileira da vitrine: o texto curto logo antes do bloco dos cartões (subindo até achar),
  // sem as setas do carrossel.
  function nomeDaFileira(cartao) {
    for (let atual = cartao, n = 0; atual && atual !== document.body && n < 10; atual = atual.parentElement, n++) {
      for (let irmao = atual.previousElementSibling, k = 0; irmao && k < 3; irmao = irmao.previousElementSibling, k++) {
        // Um cartão (link para o conteúdo ou link com imagem) é a fileira de cima; o ícone (●) do título não.
        if (irmao.matches('a[href]') || irmao.querySelector('a[href*="/area/conteudo/"], a[href] img')) break
        const t = textoDe(irmao).replace(/[‹›<>«»←→]/g, '').trim()
        if (t.length > 2 && t.length < 100 && /\p{L}{3}/u.test(t)) return t
      }
    }
    return ''
  }

  // O nome do cartão (a imagem tem o texto): alt, title ou aria-label; sem eles, o texto do link.
  const nomeDoCartao = (a) =>
    (a.getAttribute('aria-label') || a.getAttribute('title') || a.querySelector('img[alt]')?.getAttribute('alt') || textoDe(a) || '').trim()

  // vitrineDaEscola: as fileiras da vitrine com os cartões de módulo, na ordem da página (os clones do
  // carrossel não repetem). Fileira sem cartão de módulo (a do WhatsApp) não entra.
  function vitrineDaEscola() {
    const fileiras = []
    const vistos = new Set()
    for (const a of document.querySelectorAll('a[href]')) {
      const url = enderecoDe(a)
      if (!url || vistos.has(url) || !LINK_MODULO_ESCOLA.test(new URL(url).pathname)) continue
      vistos.add(url)
      // Fileira sem nome lido não se junta à outra sem nome: cada bloco de cartões é um curso.
      const nome = nomeDaFileira(a) || `Curso ${fileiras.length + 1}`
      let f = fileiras.find((x) => x.nome === nome)
      if (!f) fileiras.push((f = { nome, modulos: [] }))
      f.modulos.push({ url, nome: nomeDoCartao(a) })
    }
    return fileiras.map((f) => ({ ...f, curso: nomeBonito(f.nome) }))
  }

  // O nome de um link de aula da lista (o texto do link, sem "concluída", duração…).
  const tituloDoLink = (a) =>
    [a, ...a.querySelectorAll('*')].map(textoProprio).find((t) => t.length > 1 && !NAO_E_AULA.test(t) && !GENERICOS.test(t)) || textoDe(a)

  // O bloco do módulo de um link de aula: o ancestral mais próximo que tem o "N aulas" (fora de link).
  function moduloDoLink(link) {
    for (let atual = link.parentElement, n = 0; atual && atual !== document.body && n < 10; atual = atual.parentElement, n++) {
      const contagem = [...atual.querySelectorAll('*')].find((el) => CONTAGEM.test(textoProprio(el)) && !el.closest('a[href]'))
      if (!contagem) continue
      let nome = ''
      for (let el = contagem, k = 0; el && el !== atual && k < 4 && !nome; el = el.parentElement, k++) {
        for (let irmao = el.previousElementSibling; irmao; irmao = irmao.previousElementSibling) {
          const t = textoDe(irmao)
          if (t && t.length < 150 && !CONTAGEM.test(t) && !NAO_E_AULA.test(t) && /\p{L}{3}/u.test(t)) {
            nome = t
            break
          }
        }
      }
      const filho = [...atual.children].find((c) => c.contains(link))
      const navegacao = [...atual.children].some(
        (c) => c !== filho && c.querySelector('a[href*="/area/conteudo/aula/"]') && [...c.querySelectorAll('*')].some((el) => CONTAGEM.test(textoProprio(el)) && !el.closest('a[href]')),
      )
      if (PROGRESSO_ESCOLA.test(nome)) nome = ''
      return { bloco: atual, modulo: nome || nomeEm(atual), esperado: parseInt(textoProprio(contagem), 10) || 0, navegacao }
    }
    return { bloco: null, modulo: '', esperado: 0, navegacao: false }
  }
  // "Meu progresso - 41.2% · 7 de 17 aula": a caixa do progresso, não um módulo.
  const PROGRESSO_ESCOLA = /^meu progresso\b/i

  // gruposDeAulas: os links de aula da página (visíveis ou na sanfona fechada), agrupados pelo módulo.
  function gruposDeAulas() {
    const grupos = []
    const vistos = new Set()
    for (const a of document.querySelectorAll('a[href]')) {
      const url = enderecoDe(a)
      if (!url || vistos.has(url) || !LINK_AULA_ESCOLA.test(new URL(url).pathname)) continue
      const titulo = semNumero(tituloDoLink(a))
      if (!titulo || titulo.length > 200) continue
      const { bloco, modulo, esperado, navegacao } = moduloDoLink(a)
      if (navegacao) continue // a caixa "← / →" que leva a outro módulo
      vistos.add(url)
      let g = grupos.find((x) => x.bloco === bloco && x.modulo === modulo)
      if (!g) grupos.push((g = { bloco, modulo, esperado, aulas: [] }))
      g.aulas.push({ url, titulo })
    }
    return grupos.map(({ modulo, esperado, aulas }) => ({ modulo, esperado, aulas }))
  }

  // modulosDaPagina: os módulos (com as aulas) e os outros módulos para onde a página leva (← e →).
  function modulosDaPagina() {
    const outros = []
    for (const a of document.querySelectorAll('a[href]')) {
      const url = enderecoDe(a)
      if (url && LINK_MODULO_ESCOLA.test(new URL(url).pathname) && !outros.includes(url)) outros.push(url)
    }
    return { grupos: gruposDeAulas(), modulos: outros, titulo: document.title }
  }

  // Abre as sanfonas fechadas da lista: o módulo com "N aulas" cujo bloco não mostra nenhuma aula. O
  // clique é no cabeçalho dele (botão ou o que abre a sanfona), nunca num link (levaria a aba para
  // outra página no meio da leitura).
  function expandirModulos() {
    let n = 0
    for (const contagem of document.querySelectorAll('body *')) {
      if (!CONTAGEM.test(textoProprio(contagem)) || contagem.closest('a[href]')) continue
      // O bloco do módulo: sobe enquanto o pai só tem esta contagem.
      let bloco = contagem
      while (bloco.parentElement && bloco.parentElement !== document.body && [...bloco.parentElement.querySelectorAll('*')].filter((el) => CONTAGEM.test(textoProprio(el))).length === 1) bloco = bloco.parentElement
      if (bloco.querySelector('a[href*="/area/conteudo/aula/"]')) continue
      const alvo = contagem.closest('button, [role="button"], [aria-expanded], summary') || contagem.parentElement
      if (!alvo || alvo.closest('a[href]') || alvo.getAttribute('aria-expanded') === 'true') continue
      alvo.click()
      n++
    }
    return n
  }

  // E25: o bloco do caminho "Início › …" (o texto da aula vem depois dele).
  function blocoDoCaminho() {
    const inicio = [...document.querySelectorAll('a, span, li, div')].find((el) => /^in[ií]cio$/i.test(textoProprio(el)) && visivel(el))
    for (let a = inicio?.parentElement, n = 0; a && n < 4; a = a.parentElement, n++)
      if ([...a.querySelectorAll('*')].some((x) => textoProprio(x) && !/^in[ií]cio$/i.test(textoProprio(x)) && !/^[›>/»|]$/.test(textoProprio(x)))) return a
    return inicio || null
  }
  const COMENTARIOS = /^coment[áa]rios\b/i
  const MENU_ESCOLA = /^(sem notifica[çc][õo]es|p[áa]gina inicial|suporte)$/i

  // O curso pelo caminho "Início › Praças - CDPS" (o nome do produto na Cademí).
  function caminhoDaEscola() {
    const inicio = [...document.querySelectorAll('a, span, li, div')].find((el) => /^in[ií]cio$/i.test(textoProprio(el)) && visivel(el))
    for (let a = inicio?.parentElement, n = 0; a && n < 4; a = a.parentElement, n++) {
      const itens = [...a.querySelectorAll('*')].map(textoProprio).filter((t) => t && !/^in[ií]cio$/i.test(t) && !/^[›>/»|]$/.test(t))
      if (itens.length) return itens[itens.length - 1]
    }
    return ''
  }

  // Os players embutidos do YouTube e do Vimeo na página (o do iframe dentro de iframe, o player.js conta).
  const embedsDaPagina = () =>
    [...document.querySelectorAll('iframe[src]')].map((f) => f.src).filter(ehEmbed).map((url) => ({ url, referer: `${location.origin}/` }))

  // Textos que se repetem em toda aula e não são dela: as listas de afiliados.
  const PROPAGANDA = /(mercadolivre\.com|amazon\.com|a\.co\/|lista de afiliados|listas de recomenda|p[áa]gina da amazon|produtos recomendados|^link utens[ií]lios|^mercado livre$|^amazon$)/i
  const BLOCOS = 'h1, h2, h3, h4, h5, h6, p, li, blockquote, pre, td'

  // textoDaAula: o texto da página da aula em Markdown simples (títulos, parágrafos, listas), do título
  // para baixo, fora da lista de aulas e das propagandas; e os anexos (PDF, download) como links.
  function textoDaAula(titulo) {
    const alvo = String(titulo || '').toLowerCase()
    const eTitulo = [...document.querySelectorAll('h1, h2, h3, h4, div, span, p')].find(
      (el) => textoDe(el).toLowerCase() === alvo && !el.closest('a[href]') && visivel(el) && !el.querySelector('a[href]'),
    )
    // A coluna das aulas: o menor bloco com todos os links de aula e de módulo, se o título não está nele.
    const LINKS = 'a[href*="/area/conteudo/aula/"], a[href*="/area/conteudo/modulo/"]'
    const links = [...document.querySelectorAll(LINKS)]
    let lateral = links[0]?.parentElement
    while (lateral && !links.every((l) => lateral.contains(l))) lateral = lateral.parentElement
    if (!lateral || lateral === document.body || (eTitulo && lateral.contains(eTitulo))) lateral = null
    const naLista = (el) => (lateral && lateral.contains(el)) || !!el.closest(LINKS) || !!el.closest('ul, ol, nav, aside')?.querySelector(LINKS)
    // E25: sem o título (o da página difere do da lista), o texto começa depois do caminho "Início › …".
    const marco = eTitulo || blocoDoCaminho()
    const depois = (el) => !marco || (!marco.contains(el) && !!(marco.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING))
    // E25: os comentários dos alunos (e o que vem depois deles) não são a aula.
    const comentarios = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6, a, button, div, span, p, li')].find(
      (el) => COMENTARIOS.test(textoProprio(el)) && visivel(el),
    )
    const antes = (el) => !comentarios || !!(el.compareDocumentPosition(comentarios) & Node.DOCUMENT_POSITION_FOLLOWING)
    const linhas = []
    for (const el of document.querySelectorAll(BLOCOS)) {
      if (el.closest('header, footer, script, style, noscript, homelab-envio') || el === eTitulo || !depois(el) || !antes(el) || naLista(el)) continue
      // E25: o menu do topo e as notificações, que a escola põe no fim da página.
      if (el.closest('nav, [role="menu"], [role="navigation"], .dropdown-menu, .offcanvas, [class*="notific" i], [id*="notific" i]') || MENU_ESCOLA.test(textoDe(el))) continue
      // O bloco que tem outro bloco dentro (um <li> com <p>) vai pelos de dentro.
      if (el.querySelector(BLOCOS)) continue
      const t = textoDe(el)
      if (!t || CONTAGEM.test(t) || PROPAGANDA.test(t) || PROPAGANDA.test(el.querySelector('a[href]')?.href || '')) continue
      if (/^H[1-6]$/.test(el.tagName)) linhas.push('', `## ${t}`, '')
      else if (el.tagName === 'LI') linhas.push(`- ${t}`)
      else linhas.push(t, '')
    }
    // Os PDFs vão inteiros para a Trilha (E22); no texto, só o nome (o link da escola expira).
    const anexos = anexosDaPagina()
    if (anexos.length) linhas.push('', '## Anexos', '', ...anexos.map((x) => `- ${x.nome}`))
    return linhas.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  }

  // anexosDaPagina (E22): os PDFs da aula. Na Cademí, o anexo é um link da própria escola
  // (<a class="article-attach" href="/area/arquivo/anexo?…&n=<nome>.pdf&signature=…">, o texto é o nome e o
  // tamanho, "Tabela…-print.pdf 6.2 MB"), que redireciona para um endereço assinado de upload.cademi.cloud.
  // Também vale o link ou o quadro que termina em .pdf.
  function anexosDaPagina() {
    const anexos = []
    const ehPdf = (u) => /\.pdf$/i.test(u.pathname) || /\.pdf$/i.test(u.searchParams.get('n') || '')
    const juntar = (url, nome) => {
      if (!anexos.some((x) => x.url === url)) anexos.push({ url, nome })
    }
    for (const a of document.querySelectorAll('a[href]')) {
      let u
      try {
        u = new URL(a.getAttribute('href'), location.href)
      } catch {
        continue
      }
      const daEscola = u.origin === location.origin && u.pathname.startsWith('/area/arquivo/anexo')
      if (!daEscola && !a.classList.contains('article-attach') && !ehPdf(u)) continue
      const nome = (u.searchParams.get('n') || textoDe(a).replace(/\s+[\d.,]+\s*[KMG]?B$/i, '') || decodeURIComponent(u.pathname.split('/').pop() || '') || 'anexo.pdf').trim()
      juntar(u.href, /\.pdf$/i.test(nome) ? nome : `${nome}.pdf`)
    }
    for (const f of document.querySelectorAll('iframe[src], embed[src], object[data]')) {
      const url = f.src || f.data
      try {
        if (ehPdf(new URL(url, location.href))) juntar(new URL(url, location.href).href, decodeURIComponent(new URL(url, location.href).pathname.split('/').pop()))
      } catch {}
    }
    return anexos
  }

  // baixarAnexo (E22): a página baixa o PDF com o login dela (o pedido à escola vai com o cookie; o
  // endereço assinado para onde ela manda aceita qualquer origem) e manda ao serviço em partes.
  async function baixarAnexo(url, id) {
    let arquivo
    try {
      const resposta = await fetch(url)
      if (!resposta.ok) return { erro: `a escola respondeu ${resposta.status}` }
      arquivo = await resposta.blob()
    } catch (e) {
      return { erro: `não deu para baixar (${e.message})` }
    }
    const inicio = new TextDecoder().decode(await arquivo.slice(0, 5).arrayBuffer())
    if (inicio !== '%PDF-') return { erro: 'o link não devolveu um PDF (o login caiu?)' }
    for (let i = 0; i < arquivo.size; i += PARTE) {
      await chrome.runtime.sendMessage({ tipo: 'pdfParte', id, dados: await emBase64(arquivo.slice(i, i + PARTE)) })
    }
    return { tamanho: arquivo.size }
  }

  // E19: a lista de aulas da barra lateral (Tech Leads Club, uma comunidade Circle): o link de cada
  // aula do curso (/c/<curso>/…/lessons/<n>), o nome dela e a seção. O texto do link é o nome inteiro,
  // mesmo quando a tela o corta com "…".
  const LINK_DE_AULA = /\/lessons\/\d+\/?$/
  function secaoDaAula(link) {
    for (let atual = link.parentElement, n = 0; atual && atual !== document.body && n < 10; atual = atual.parentElement, n++) {
      const contagem = [...atual.querySelectorAll('*')].find((el) => CONTAGEM.test(textoProprio(el)) && !el.closest('a[href]'))
      if (!contagem) continue
      // O nome da seção vem antes do "N aulas" ("Patterns de Desenvolvimento Enterprise" · "3 aulas").
      for (let el = contagem, k = 0; el && el !== atual && k < 4; el = el.parentElement, k++) {
        for (let irmao = el.previousElementSibling; irmao; irmao = irmao.previousElementSibling) {
          const t = textoDe(irmao)
          if (t && t.length < 150 && !CONTAGEM.test(t) && !NAO_E_AULA.test(t)) return t
        }
      }
      return nomeEm(atual)
    }
    return ''
  }
  function aulasDaLista() {
    const base = location.pathname.match(/^\/c\/[^/]+\//)?.[0]
    if (!base) return []
    const vistas = new Set()
    const lista = []
    for (const a of document.querySelectorAll('a[href]')) {
      let u
      try {
        u = new URL(a.href)
      } catch {
        continue
      }
      const url = u.origin + u.pathname
      if (u.origin !== location.origin || !u.pathname.startsWith(base) || !LINK_DE_AULA.test(u.pathname) || vistas.has(url)) continue
      const titulo = [a, ...a.querySelectorAll('*')].map(textoProprio).find((t) => t.length > 1 && !NAO_E_AULA.test(t) && !GENERICOS.test(t))
      if (!titulo) continue
      vistas.add(url)
      lista.push({ url, titulo, modulo: secaoDaAula(a) })
    }
    return lista
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
    // E20: a escola inteira (o serviço passa a aba pela vitrine e por cada módulo).
    if (mensagem?.tipo === 'vitrineDaEscola') {
      responder(cursoDaPagina(location.href)?.escola ? vitrineDaEscola() : [])
      return false
    }
    if (mensagem?.tipo === 'modulosDaPagina') {
      responder(cursoDaPagina(location.href)?.escola ? modulosDaPagina() : null)
      return false
    }
    if (mensagem?.tipo === 'baixarAnexo') {
      baixarAnexo(mensagem.url, mensagem.id).then(responder)
      return true
    }
    if (mensagem?.tipo === 'expandirModulos') {
      responder(expandirModulos())
      return false
    }
    if (mensagem?.tipo === 'aulasDaLista') {
      responder(cursoDaPagina(location.href) ? aulasDaLista() : [])
      return false
    }
    // E19: o download do curso inteiro dá play sem som (o player só pede o vídeo ao tocar) e pausa
    // quando o vídeo já foi visto.
    if (mensagem?.tipo === 'tocarMudo' || mensagem?.tipo === 'pausar') {
      const videos = [...document.querySelectorAll('video')]
      for (const v of videos) {
        if (mensagem.tipo === 'pausar') v.pause()
        else {
          v.muted = true
          v.play().catch(() => {})
        }
      }
      // E20: a página sem <video> e sem iframe é aula sem vídeo (texto, PDF): o serviço não espera à toa.
      responder({ videos: videos.length, quadros: document.querySelectorAll('iframe').length })
      return false
    }
    if (mensagem?.tipo === 'aulaDoCurso') {
      // Se a leitura da página quebrar (DOM de uma plataforma nova), o popup ainda abre a aula com o
      // título da aba e mostra o erro, em vez de esconder o "Baixar esta aula" sem dizer nada (E18).
      try {
        responder(aulaDaPagina())
      } catch (e) {
        const curso = cursoDaPagina(location.href)
        responder(
          curso && {
            plataforma: curso.curso,
            nomePlataforma: curso.nome,
            titulo: tituloLimpo(document.title),
            modulo: '',
            curso: '',
            pagina: location.href,
            chaveCurso: chaveDoCurso(location.href),
            cursoPadrao: cursoPadrao(location.href),
            erroLeitura: String(e?.message || e),
          },
        )
      }
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
