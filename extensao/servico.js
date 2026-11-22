// O serviço da extensão: recebe o pedido da página, manda o link ao app certo e guarda o histórico.
// Quem chama os apps é ele, não a página: com a permissão do endereço do homelab, o Chrome deixa
// a extensão falar com eles sem CORS.
importScripts('destinos.js', 'coleta.js', 'aulas.js')

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

// Baixar a aula do curso (E15): o player.js conta os manifestos HLS de cada aba (guardados aqui,
// na sessão do navegador: o serviço pode dormir entre a aula tocar e o Lucas abrir o popup); o
// popup pede a estimativa e o download à Trilha (T50 de lá), que baixa no servidor.
const { escolherManifesto, acrescentarAoMapa, aulasDoMapa } = globalThis.Aulas

async function manifestosDaAba(aba) {
  const chave = `manifestos:${aba}`
  return (await chrome.storage.session.get(chave))[chave] || []
}

// Uma gravação por vez: o player pede o mestre e a variante quase juntos (ler, mudar e gravar ao
// mesmo tempo perderia um).
let gravando = Promise.resolve()
function guardarManifesto(aba, { url, referer }) {
  gravando = gravando.then(async () => {
    const chave = `manifestos:${aba}`
    const lista = (await manifestosDaAba(aba)).filter((m) => m.url !== url)
    lista.push({ url, referer, quando: Date.now() })
    await chrome.storage.session.set({ [chave]: lista.slice(-20) })
  }).catch(() => {})
  return gravando
}

// E20: o player embutido do YouTube/Vimeo que o player.js viu na aba (a Trilha baixa pelo yt-dlp).
async function embedsDaAba(aba) {
  const chave = `embeds:${aba}`
  return (await chrome.storage.session.get(chave))[chave] || []
}
function guardarEmbed(aba, { url, referer }) {
  gravando = gravando.then(async () => {
    const chave = `embeds:${aba}`
    const lista = (await embedsDaAba(aba)).filter((m) => m.url !== url)
    lista.push({ url, referer, quando: Date.now() })
    await chrome.storage.session.set({ [chave]: lista.slice(-5) })
  }).catch(() => {})
  return gravando
}

// videoDaAba: o vídeo da aula aberta — o HLS (o melhor) ou o player embutido, ou null.
async function videoDaAba(aba, aula) {
  const m = escolherManifesto(await manifestosDaAba(aba))
  if (m) return { manifesto: m.url, referer: m.referer }
  const e = (await embedsDaAba(aba)).at(-1) || aula?.embeds?.at(-1)
  return e ? { embed: e.url, referer: e.referer } : null
}

// A página recarregou ou fechou: os manifestos da aula anterior não valem mais.
chrome.tabs.onUpdated.addListener((aba, mudou) => {
  if (mudou.status === 'loading') chrome.storage.session.remove([`manifestos:${aba}`, `embeds:${aba}`])
})
chrome.tabs.onRemoved.addListener((aba) => chrome.storage.session.remove([`manifestos:${aba}`, `embeds:${aba}`]))

async function aulaDaAba(aba) {
  const aula = await chrome.tabs.sendMessage(aba, { tipo: 'aulaDoCurso' }).catch(() => null)
  if (!aula) return { erro: 'Recarregue a página da aula e abra o popup de novo.' }
  const video = await videoDaAba(aba, aula)
  if (!video) return { aula, semVideo: true }
  const { enderecos } = await ajustes()
  try {
    const { status, dados } = await chamar(enderecos.trilha, '/api/cursos/estimar', { metodo: 'POST', corpo: { ...video, pagina: aula.pagina } })
    if (status !== 200) return { aula, video, erro: dados?.erro || `A Trilha respondeu ${status}` }
    return { aula, video, estimativa: dados }
  } catch {
    return { aula, video, erro: 'Sem conexão com a Trilha: só funciona na rede de casa.' }
  }
}

async function baixarAula(pedido) {
  const { enderecos } = await ajustes()
  const base = enderecos.trilha.replace(/\/+$/, '')
  let resultado
  try {
    const { status, dados } = await chamar(enderecos.trilha, '/api/cursos/aulas', { metodo: 'POST', corpo: pedido })
    const abrir = `${base}/#/entrada/cursos`
    if (status === 202 && dados?.aula?.estado === 'texto') resultado = { estado: 'enviado', mensagem: 'O texto da aula foi para a Trilha (ela não tem vídeo)', abrir }
    else if (status === 202) resultado = { estado: 'enviado', mensagem: 'Na fila de downloads da Trilha', abrir }
    else if (status === 200 && dados?.repetida) resultado = { estado: 'repetido', mensagem: dados.aula?.estado === 'pronta' ? 'Esta aula já foi baixada' : 'Esta aula já está na fila', abrir }
    else resultado = { estado: 'erro', mensagem: dados?.erro || `A Trilha respondeu ${status}`, abrir: '' }
  } catch {
    resultado = { estado: 'erro', mensagem: 'Sem conexão com a Trilha: só funciona na rede de casa.', abrir: '' }
  }
  await guardarNoHistorico({ app: 'trilha', url: pedido.pagina, titulo: pedido.titulo, resultado })
  return resultado
}

// E19: baixar o curso inteiro. A aba do curso passa por cada aula da lista (uma por vez, com uma
// pausa entre elas), dá play sem som até o player pedir o vídeo, e a aula vai à fila da Trilha com a
// seção da lista como módulo. O estado fica em chrome.storage.local: se o Chrome adormecer o serviço,
// ele continua de onde parou quando acorda.
const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms))
const PAUSA_ENTRE_AULAS = 3000
const ESPERA_DO_VIDEO = 20 // tentativas de 2 s

function abrirNaAba(aba, url) {
  return new Promise((ok) => {
    const ouvir = (id, mudou) => {
      if (id !== aba || mudou.status !== 'complete') return
      clearTimeout(limite)
      chrome.tabs.onUpdated.removeListener(ouvir)
      ok()
    }
    const limite = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(ouvir)
      ok()
    }, 45000)
    chrome.tabs.onUpdated.addListener(ouvir)
    chrome.tabs.update(aba, { url }).catch(() => ok())
  })
}

async function baixarDaLista(lote, aula) {
  // Abrir a aula limpa os manifestos da anterior (o "loading" da aba, acima).
  await abrirNaAba(lote.aba, aula.url)
  let video = null
  let semPlayer = 0
  for (let t = 0; t < ESPERA_DO_VIDEO && !video; t++) {
    const r = await chrome.tabs.sendMessage(lote.aba, { tipo: 'tocarMudo' }).catch(() => null)
    await esperar(2000)
    video = await videoDaAba(lote.aba)
    // E20: a página sem <video> e sem iframe (aula de texto ou PDF) não vai ganhar um: 3 vezes e segue.
    if (!video && r && typeof r === 'object' && !r.videos && !r.quadros && ++semPlayer >= 3) break
  }
  await chrome.tabs.sendMessage(lote.aba, { tipo: 'pausar' }).catch(() => 0)
  const lida = await chrome.tabs.sendMessage(lote.aba, { tipo: 'aulaDoCurso' }).catch(() => null)
  if (!video && lida?.embeds?.length) video = { embed: lida.embeds.at(-1).url, referer: lida.embeds.at(-1).referer }
  const texto = lida?.escola ? lida.texto || '' : ''
  if (!video && !texto) return { estado: 'sem_video', mensagem: 'O vídeo não apareceu (aula sem vídeo?)' }
  const { enderecos } = await ajustes()
  const pedido = {
    plataforma: lote.plataforma,
    curso: aula.curso || lote.curso,
    modulo: aula.modulo,
    titulo: aula.titulo || lida?.titulo || '',
    pagina: aula.url,
    ...(video || {}),
    ...(texto ? { texto } : {}),
    ...(aula.ordem ? { ordem: aula.ordem } : {}),
    ...(lote.trilha ? { trilha: true } : {}),
  }
  try {
    const { status, dados } = await chamar(enderecos.trilha, '/api/cursos/aulas', { metodo: 'POST', corpo: pedido })
    const naTrilha = dados?.trilha_erro ? ` (a trilha não atualizou: ${dados.trilha_erro})` : ''
    if (status === 202 && !video) return { estado: 'enviada', soTexto: true, mensagem: 'Só o texto (a aula não tem vídeo)' + naTrilha }
    if (status === 202) return { estado: 'enviada', mensagem: 'Na fila da Trilha' + naTrilha }
    if (status === 200 && dados?.repetida) return { estado: 'enviada', soTexto: !video, mensagem: (dados.aula?.estado === 'pronta' ? 'Já baixada' : 'Já estava na Trilha') + naTrilha }
    return { estado: 'erro', mensagem: dados?.erro || `A Trilha respondeu ${status}` }
  } catch {
    return { estado: 'erro', mensagem: 'Sem conexão com a Trilha' }
  }
}

// E20: mapear a escola inteira. A aba abre a vitrine (as fileiras são os cursos, os cartões levam aos
// módulos) e depois cada módulo, e lê as aulas de cada um ("N aulas" + a lista). Nada é baixado: no fim,
// o popup mostra os cursos, os módulos e as aulas para o Lucas conferir e mandar baixar. Um passo por
// vez, gravado no lote: o serviço que adormece continua de onde parou.
const VITRINE = '/area/vitrine/home'

async function lerDaAba(aba, tipo, tentativas, pronto) {
  let r = null
  for (let i = 0; i < tentativas; i++) {
    r = await chrome.tabs.sendMessage(aba, { tipo }).catch(() => null)
    if (pronto(r)) return r
    await esperar(2000)
  }
  return r
}

async function passoDoMapa(lote) {
  if (!lote.fila) {
    await abrirNaAba(lote.aba, lote.origem + VITRINE)
    await esperar(1500)
    const fileiras = (await lerDaAba(lote.aba, 'vitrineDaEscola', 6, (r) => r?.length)) || []
    if (!fileiras.length) return { ...lote, rodando: false, atual: '', aviso: 'Não achei os cursos na vitrine: abra a página inicial da escola, confira se está logado e mapeie de novo.' }
    const fila = fileiras.flatMap((f) => f.modulos.map((m) => ({ url: m.url, curso: f.curso, nome: m.nome })))
    return { ...lote, fila, i: 0, cursos: fileiras.map((f) => f.curso), atual: '' }
  }
  if (lote.i >= lote.fila.length) return { ...lote, rodando: false, fase: 'mapeado', atual: '', terminou: Date.now() }
  const item = lote.fila[lote.i]
  await abrirNaAba(lote.aba, item.url)
  await esperar(1500)
  let lido = await lerDaAba(lote.aba, 'modulosDaPagina', 4, (r) => r?.grupos?.length)
  // Módulo da lista com a sanfona fechada (o "N aulas" sem nenhuma aula à vista): abre e lê de novo.
  if (await chrome.tabs.sendMessage(lote.aba, { tipo: 'expandirModulos' }).catch(() => 0)) {
    await esperar(1500)
    lido = (await lerDaAba(lote.aba, 'modulosDaPagina', 1, () => true)) || lido
  }
  const mapa = lote.mapa || {}
  acrescentarAoMapa(mapa, item.curso, lido?.grupos || [], item.nome)
  const fila = [...lote.fila]
  // Um módulo que a página aponta (← →) e não estava na vitrine entra no fim, no mesmo curso.
  for (const url of lido?.modulos || []) if (!fila.some((f) => f.url === url)) fila.push({ url, curso: item.curso, nome: '' })
  const problemas = [...(lote.problemas || [])]
  if (!lido?.grupos?.length) problemas.push(`${item.curso}: não li as aulas de ${item.url}`)
  return { ...lote, fila, mapa, i: lote.i + 1, problemas, atual: `${item.curso} (${lote.i + 1} de ${fila.length})` }
}

let loteRodando = false
async function rodarLote() {
  if (loteRodando) return
  loteRodando = true
  try {
    for (;;) {
      const { lote } = await chrome.storage.local.get('lote')
      if (!lote?.rodando) break
      if (lote.fase === 'mapear') {
        const novo = await passoDoMapa(lote)
        const { lote: agora } = await chrome.storage.local.get('lote')
        if (!agora || agora.iniciado !== lote.iniciado) break
        // O Lucas pode ter parado no meio do passo: o passo fica gravado, parado.
        await chrome.storage.local.set({ lote: { ...novo, rodando: novo.rodando && agora.rodando } })
        continue
      }
      const i = lote.aulas.findIndex((a) => !a.estado)
      if (i < 0) {
        await chrome.storage.local.set({ lote: { ...lote, rodando: false, atual: '', terminou: Date.now() } })
        break
      }
      const aba = await chrome.tabs.get(lote.aba).catch(() => null)
      if (!aba) {
        await chrome.storage.local.set({ lote: { ...lote, rodando: false, atual: '', aviso: 'A aba do curso foi fechada: abra uma aula e continue.' } })
        break
      }
      await chrome.storage.local.set({ lote: { ...lote, atual: lote.aulas[i].titulo } })
      const r = await baixarDaLista(lote, lote.aulas[i])
      // O Lucas pode ter parado ou recomeçado enquanto esta aula corria.
      const { lote: agora } = await chrome.storage.local.get('lote')
      if (!agora || agora.iniciado !== lote.iniciado) break
      agora.aulas[i] = { ...agora.aulas[i], ...r }
      await chrome.storage.local.set({ lote: agora })
      await esperar(PAUSA_ENTRE_AULAS)
    }
  } finally {
    loteRodando = false
  }
}
// O serviço acordou (o Chrome o adormece): se havia um download do curso em andamento, continua.
chrome.storage.local.get('lote').then(({ lote }) => lote?.rodando && rodarLote())

async function comandoDoLote(mensagem) {
  const { lote } = await chrome.storage.local.get('lote')
  if (mensagem.tipo === 'mapearEscola') {
    const { aba, plataforma, origem } = mensagem
    await chrome.storage.local.set({ lote: { tipo: 'escola', fase: 'mapear', aba, plataforma, origem, mapa: {}, problemas: [], rodando: true, iniciado: Date.now(), atual: '' } })
  } else if (lote?.tipo === 'escola' && mensagem.tipo === 'baixarEscola') {
    const aulas = aulasDoMapa(lote.mapa, mensagem.marcados)
    await chrome.storage.local.set({ lote: { ...lote, fase: 'baixar', aba: mensagem.aba || lote.aba, aulas, trilha: true, rodando: aulas.length > 0, iniciado: Date.now(), atual: '', aviso: '' } })
  } else if (mensagem.tipo === 'iniciarLote') {
    const { aba, curso, plataforma, aulas } = mensagem
    await chrome.storage.local.set({ lote: { tipo: 'curso', aba, curso, plataforma, aulas: aulas.map((a) => ({ url: a.url, titulo: a.titulo, modulo: a.modulo })), rodando: true, iniciado: Date.now(), atual: '' } })
  } else if (lote && mensagem.tipo === 'pararLote') {
    await chrome.storage.local.set({ lote: { ...lote, rodando: false, atual: '' } })
  } else if (lote?.fase === 'mapear' && mensagem.tipo === 'continuarLote') {
    await chrome.storage.local.set({ lote: { ...lote, aba: mensagem.aba || lote.aba, rodando: true, aviso: '' } })
  } else if (lote && mensagem.tipo === 'continuarLote') {
    // Continuar refaz as que deram erro ou ficaram sem vídeo, na aba de onde o Lucas pediu.
    const aulas = lote.aulas.map((a) => (a.estado === 'enviada' ? a : { url: a.url, titulo: a.titulo, modulo: a.modulo, curso: a.curso, ordem: a.ordem }))
    await chrome.storage.local.set({ lote: { ...lote, aba: mensagem.aba || lote.aba, aulas, rodando: true, aviso: '' } })
  } else if (mensagem.tipo === 'esquecerLote') {
    await chrome.storage.local.remove('lote')
  }
  rodarLote()
  return true
}

chrome.runtime.onMessage.addListener((mensagem, remetente, responder) => {
  if (['iniciarLote', 'pararLote', 'continuarLote', 'esquecerLote', 'mapearEscola', 'baixarEscola'].includes(mensagem?.tipo)) {
    comandoDoLote(mensagem).then(responder)
    return true
  }
  if (mensagem?.tipo === 'embedVisto' && remetente.tab?.id) {
    guardarEmbed(remetente.tab.id, mensagem).then(() => responder(true))
    return true
  }
  if (mensagem?.tipo === 'manifestoVisto' && remetente.tab?.id) {
    guardarManifesto(remetente.tab.id, mensagem).then(() => responder(true))
    return true
  }
  if (mensagem?.tipo === 'aulaDaAba') {
    aulaDaAba(mensagem.aba).then(responder)
    return true
  }
  if (mensagem?.tipo === 'baixarAula') {
    baixarAula(mensagem.pedido).then(responder)
    return true
  }
  return false
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
  // Sem cache: o manifesto e a chave do vídeo passam pela rede de novo, onde a coleta vê.
  await comando(aba, sessao, 'Network.setCacheDisabled', { cacheDisabled: true }).catch(() => {})
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
  // A página recarrega já com a coleta ligada: o player pede tudo desde o começo (manifesto, chave).
  // Sem isso, um vídeo que já tocava só mostra os pedaços (as primeiras coletas, 20/11).
  await comando(aba, null, 'Page.reload', { ignoreCache: true }).catch(() => {})
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
