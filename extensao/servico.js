// O serviço da extensão: recebe o pedido da página, manda o link ao app certo e guarda o histórico.
// Quem chama os apps é ele, não a página: com a permissão do endereço do homelab, o Chrome deixa
// a extensão falar com eles sem CORS.
importScripts('destinos.js', 'coleta.js')

const { ENDERECOS_PADRAO, APPS, acoesDaPagina, baralhoPadrao, pedidoPara, resultadoDaResposta, acrescentar } = globalThis.Destinos

async function ajustes() {
  const salvos = await chrome.storage.local.get(['enderecos', 'baralho', 'tipo'])
  return {
    enderecos: { ...ENDERECOS_PADRAO, ...(salvos.enderecos || {}) },
    baralho: salvos.baralho || '',
    tipo: salvos.tipo || 'basico',
  }
}

async function chamar(endereco, caminho, { metodo = 'GET', corpo, formulario } = {}) {
  const resposta = await fetch(endereco.replace(/\/+$/, '') + caminho, {
    method: metodo,
    headers: corpo ? { 'Content-Type': 'application/json' } : {},
    body: formulario || (corpo ? JSON.stringify(corpo) : undefined),
    // Um PDF grande demora a subir.
    signal: AbortSignal.timeout(formulario ? 300000 : 30000),
  })
  const dados = await resposta.json().catch(() => null)
  return { status: resposta.status, dados }
}

// Sem baralho escolhido no popup, os links vão para o "Inglês", se existir.
async function comBaralhoPadrao(a) {
  if (a.baralho) return a
  const { status, dados } = await chamar(a.enderecos.flashcards, '/api/baralhos')
  return { ...a, baralho: status === 200 ? baralhoPadrao(dados) : '' }
}

// O PDF para a Biblioteca vem da página em partes (E12): as mensagens da extensão são JSON, então
// cada parte vem em base64, e a página manda o envio depois da última.
const pdfs = new Map()

function guardarParte({ id, dados }) {
  const binario = atob(dados)
  const bytes = new Uint8Array(binario.length)
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i)
  if (!pdfs.has(id)) pdfs.set(id, [])
  pdfs.get(id).push(bytes)
}

function formularioDoPdf(id, nome, titulo) {
  const partes = pdfs.get(id) || []
  pdfs.delete(id)
  if (!partes.length) return null
  const form = new FormData()
  if (titulo) form.append('title', titulo)
  form.append('file', new Blob(partes, { type: 'application/pdf' }), nome)
  return form
}

async function enviar({ app, url, titulo, pdf, nome }) {
  let a = await ajustes()
  const endereco = a.enderecos[app]
  let resultado
  try {
    if (app === 'flashcards') a = await comBaralhoPadrao(a)
    const pedido = pedidoPara(app, url, a)
    let formulario
    if (app === 'biblioteca') {
      formulario = formularioDoPdf(pdf, nome, titulo)
      if (!formulario) throw new Error('sem PDF')
    }
    const { status, dados } = await chamar(endereco, pedido.caminho, { metodo: 'POST', corpo: pedido.corpo, formulario })
    resultado = resultadoDaResposta(app, endereco, status, dados)
  } catch (e) {
    if (e.message === 'sem PDF') resultado = { estado: 'erro', mensagem: 'O PDF não chegou à extensão: tente de novo.', abrir: '' }
    else resultado = { estado: 'erro', mensagem: `Sem conexão com o ${APPS[app].nome}: só funciona na rede de casa.`, abrir: '' }
  }
  await guardarNoHistorico({ app, url, titulo, resultado })
  return resultado
}

async function guardarNoHistorico({ app, url, titulo, resultado }) {
  const { historico = [] } = await chrome.storage.local.get('historico')
  await chrome.storage.local.set({
    historico: acrescentar(historico, { app, url, titulo: titulo || url, quando: new Date().toISOString(), ...resultado }),
  })
}

// Botão direito num link ou na página (E10): manda sem abrir o link. O resultado fica no histórico e,
// por alguns segundos, no ícone da extensão (✓ ou !).
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    for (const app of ['acervo', 'flashcards']) {
      chrome.contextMenus.create({ id: app, title: APPS[app].acao, contexts: ['link', 'page'], documentUrlPatterns: ['https://*/*', 'http://*/*'] })
    }
    // A Trilha só no vídeo do YouTube aberto ou num link para um (E13).
    chrome.contextMenus.create({ id: 'trilha', title: APPS.trilha.acao, contexts: ['page'], documentUrlPatterns: ['https://*.youtube.com/*'] })
    chrome.contextMenus.create({ id: 'trilha-link', title: APPS.trilha.acao, contexts: ['link'], targetUrlPatterns: ['https://*.youtube.com/*'] })
    // A Biblioteca só no PDF aberto ou num link para PDF (E12).
    chrome.contextMenus.create({ id: 'biblioteca-pagina', title: APPS.biblioteca.acao, contexts: ['page'], documentUrlPatterns: ['https://*/*.pdf*', 'http://*/*.pdf*'] })
    chrome.contextMenus.create({ id: 'biblioteca-link', title: APPS.biblioteca.acao, contexts: ['link'], targetUrlPatterns: ['https://*/*.pdf*', 'http://*/*.pdf*'] })
  })
})

let limparSinal = 0
function sinalizar(resultado) {
  const erro = resultado.estado === 'erro'
  chrome.action.setBadgeBackgroundColor({ color: erro ? '#b4553a' : '#33608c' })
  chrome.action.setBadgeText({ text: erro ? '!' : '✓' })
  chrome.action.setTitle({ title: `Homelab: ${resultado.mensagem}` })
  clearTimeout(limparSinal)
  limparSinal = setTimeout(() => {
    chrome.action.setBadgeText({ text: '' })
    chrome.action.setTitle({ title: 'Homelab' })
  }, 5000)
}

chrome.contextMenus.onClicked.addListener(async (info, aba) => {
  // O PDF quem baixa é a página, com o acesso dela ao site (E12).
  if (info.menuItemId === 'biblioteca-pagina' || info.menuItemId === 'biblioteca-link') {
    const pdf = info.menuItemId === 'biblioteca-link' ? info.linkUrl : info.pageUrl
    const r = await chrome.tabs.sendMessage(aba.id, { tipo: 'pdfParaBiblioteca', url: pdf, doLink: !!info.linkUrl }).catch(() => null)
    sinalizar(r || { estado: 'erro', mensagem: 'Recarregue a página e tente de novo.' })
    return
  }
  const link = info.linkUrl || info.pageUrl
  const app = info.menuItemId === 'trilha-link' ? 'trilha' : info.menuItemId
  const acao = acoesDaPagina(link).find((a) => a.app === app)
  if (!acao) {
    const mensagem =
      app === 'flashcards' ? 'Vídeo do YouTube vai à Trilha ou ao Acervo.' : app === 'trilha' ? 'Só vídeo do YouTube vai à Trilha.' : 'Este link não vai a nenhum app.'
    sinalizar({ estado: 'erro', mensagem })
    return
  }
  // Num link, o título é o texto dele (quando o Chrome dá) ou o próprio endereço.
  const titulo = info.linkUrl ? info.selectionText || info.linkUrl : aba?.title
  sinalizar(await enviar({ app: acao.app, url: acao.url, titulo }))
})

// A coleta do vídeo nos cursos (E14): com o depurador do Chrome (a barra "Homelab começou a depurar
// este navegador" fica à vista enquanto coleta), o serviço anota os pedidos de rede da aba, dos iframes
// (o player costuma ser um) e dos workers, e guarda o texto dos manifestos e das legendas. Nada é
// baixado além do que o próprio player pede. No fim, vê os <video> de cada quadro e devolve o relatório
// para a página salvar em Downloads.
const { PEDIDOS_MAXIMO, SONDA_VIDEO, semSegredos, tipoDoPedido, precisaDoCorpo, resumir, nomeDoArquivo, NOMES_VEREDITO } = globalThis.Coleta
const coletas = new Map() // aba → coleta

const alvo = (aba, sessao) => (sessao ? { tabId: aba, sessionId: sessao } : { tabId: aba })
const comando = (aba, sessao, metodo, params = {}) => chrome.debugger.sendCommand(alvo(aba, sessao), metodo, params)

async function ligarSessao(aba, sessao) {
  // Buffers maiores para o texto dos manifestos ainda estar lá quando o pedido termina.
  await comando(aba, sessao, 'Network.enable', { maxTotalBufferSize: 100e6, maxResourceBufferSize: 10e6 }).catch(() => {})
  await comando(aba, sessao, 'Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }).catch(() => {})
}

async function comecarColeta(aba, { curso, pagina, titulo }) {
  if (coletas.has(aba)) return estadoDaColeta(aba)
  const c = { curso, inicio: new Date().toISOString(), paginas: [{ url: pagina, titulo, quando: new Date().toISOString() }], quadros: [], pedidos: new Map(), corpos: [], descartados: 0, encerrada: '' }
  coletas.set(aba, c)
  try {
    await chrome.debugger.attach({ tabId: aba }, '1.3')
  } catch (e) {
    coletas.delete(aba)
    return { erro: `O Chrome não deixou coletar: ${e.message}. Feche o DevTools desta aba e tente de novo.` }
  }
  await comando(aba, null, 'Page.enable').catch(() => {})
  await ligarSessao(aba, null)
  return estadoDaColeta(aba)
}

function estadoDaColeta(aba) {
  const c = coletas.get(aba)
  if (!c) return { coletando: false }
  const lista = [...c.pedidos.values()]
  return {
    coletando: true,
    curso: c.curso,
    pedidos: lista.length,
    video: lista.filter((p) => ['manifesto-hls', 'manifesto-dash', 'pedaco', 'midia'].includes(p.tipo)).length,
    encerrada: c.encerrada,
  }
}

chrome.debugger.onEvent.addListener(async (fonte, metodo, params) => {
  const aba = fonte.tabId
  const c = coletas.get(aba)
  if (!c) return
  const sessao = fonte.sessionId || null
  const chave = `${sessao || 'aba'}:${params.requestId}`
  if (metodo === 'Target.attachedToTarget') {
    const t = params.targetInfo
    c.quadros.push({ tipo: t.type, url: t.url, sessao: params.sessionId })
    await ligarSessao(aba, params.sessionId)
    await comando(aba, params.sessionId, 'Runtime.runIfWaitingForDebugger').catch(() => {})
  } else if (metodo === 'Page.frameNavigated' && !params.frame.parentId) {
    c.paginas.push({ url: params.frame.url, quando: new Date().toISOString() })
  } else if (metodo === 'Network.requestWillBeSent') {
    if (c.pedidos.size >= PEDIDOS_MAXIMO && !c.pedidos.has(chave)) {
      c.descartados++
      return
    }
    const r = params.request
    c.pedidos.set(chave, {
      quadro: sessao ? c.quadros.find((q) => q.sessao === sessao)?.url || sessao : 'página',
      quando: new Date().toISOString(),
      metodo: r.method,
      url: r.url,
      host: (() => { try { return new URL(r.url).hostname } catch { return '' } })(),
      recurso: params.type || '',
      iniciador: params.initiator?.type || '',
      cabecalhosPedido: semSegredos(r.headers),
      tipo: tipoDoPedido(r.url),
      ...(params.redirectResponse ? { redirecionado: params.redirectResponse.status } : {}),
    })
  } else if (metodo === 'Network.responseReceived') {
    const p = c.pedidos.get(chave)
    if (!p) return
    const resp = params.response
    Object.assign(p, {
      status: resp.status,
      mime: resp.mimeType,
      protocolo: resp.protocol,
      doServiceWorker: !!resp.fromServiceWorker,
      cabecalhosResposta: semSegredos(resp.headers),
      tipo: tipoDoPedido(p.url, resp.mimeType),
    })
  } else if (metodo === 'Network.loadingFinished') {
    const p = c.pedidos.get(chave)
    if (!p) return
    p.tamanho = params.encodedDataLength
    const maximo = precisaDoCorpo(p.url, p.mime)
    if (!maximo) return
    const pedido = comando(aba, sessao, 'Network.getResponseBody', { requestId: params.requestId })
      .then(({ body, base64Encoded }) => {
        const texto = base64Encoded ? atob(body) : body
        p.corpo = texto.length > maximo ? texto.slice(0, maximo) : texto
        if (texto.length > maximo) p.corpoCortado = texto.length
      })
      .catch((e) => {
        p.semCorpo = e.message
      })
    c.corpos.push(pedido)
  } else if (metodo === 'Network.loadingFailed') {
    const p = c.pedidos.get(chave)
    if (p) Object.assign(p, { falhou: params.errorText, bloqueio: params.blockedReason || '' })
  }
})

// O Lucas cancelou pela barra do Chrome (ou a aba fechou): o que já veio continua lá para salvar.
chrome.debugger.onDetach.addListener((fonte, motivo) => {
  const c = coletas.get(fonte.tabId)
  if (c && !c.encerrada) c.encerrada = motivo
})
chrome.tabs.onRemoved.addListener((aba) => coletas.delete(aba))

async function encerrarColeta(aba) {
  const c = coletas.get(aba)
  if (!c) return { erro: 'Nenhuma coleta nesta aba.' }
  const videos = []
  if (!c.encerrada) {
    for (const sessao of [null, ...c.quadros.filter((q) => q.tipo === 'iframe' || q.tipo === 'page').map((q) => q.sessao)]) {
      const r = await comando(aba, sessao, 'Runtime.evaluate', { expression: SONDA_VIDEO, returnByValue: true }).catch(() => null)
      if (Array.isArray(r?.result?.value)) videos.push(...r.result.value)
    }
  }
  await Promise.allSettled(c.corpos)
  if (!c.encerrada) await chrome.debugger.detach({ tabId: aba }).catch(() => {})
  coletas.delete(aba)
  const pedidos = [...c.pedidos.values()]
  const fim = new Date()
  const resumo = resumir(pedidos, videos)
  const relatorio = {
    versao: 1,
    curso: c.curso,
    inicio: c.inicio,
    fim: fim.toISOString(),
    segundos: Math.round((fim - new Date(c.inicio)) / 1000),
    navegador: navigator.userAgent,
    ...(c.encerrada ? { interrompida: c.encerrada } : {}),
    ...(c.descartados ? { pedidosDescartados: c.descartados } : {}),
    resumo,
    paginas: c.paginas,
    quadros: c.quadros.map(({ tipo, url }) => ({ tipo, url })),
    videos,
    pedidos,
  }
  return {
    nome: nomeDoArquivo(c.curso, fim),
    json: JSON.stringify(relatorio, null, 2),
    mensagem: `Coleta salva em Downloads: ${NOMES_VEREDITO[resumo.veredito]}`,
  }
}

chrome.runtime.onMessage.addListener((mensagem, remetente, responder) => {
  const aba = remetente.tab?.id
  if (mensagem?.tipo === 'coletaComecar') {
    comecarColeta(aba, mensagem).then(responder)
    return true
  }
  if (mensagem?.tipo === 'coletaEstado') {
    responder(estadoDaColeta(aba))
    return false
  }
  if (mensagem?.tipo === 'coletaEncerrar') {
    encerrarColeta(aba).then(responder)
    return true
  }
  return false
})

chrome.runtime.onMessage.addListener((mensagem, _remetente, responder) => {
  if (mensagem?.tipo === 'pdfParte') {
    guardarParte(mensagem)
    responder(true)
    return false
  }
  if (mensagem?.tipo === 'erroDoPdf') {
    guardarNoHistorico({ app: 'biblioteca', url: mensagem.url, titulo: mensagem.titulo, resultado: mensagem.resultado }).then(() => responder(true))
    return true
  }
  if (mensagem?.tipo === 'enviar') {
    enviar(mensagem).then(responder)
    return true
  }
  if (mensagem?.tipo === 'baralhos') {
    ajustes()
      .then((a) => chamar(a.enderecos.flashcards, '/api/baralhos'))
      .then(({ status, dados }) => responder(status === 200 ? { baralhos: dados } : { erro: `O Flashcards respondeu ${status}` }))
      .catch(() => responder({ erro: 'Sem conexão com o Flashcards: só funciona na rede de casa.' }))
    return true
  }
  return false
})
