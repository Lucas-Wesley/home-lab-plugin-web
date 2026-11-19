// O serviço da extensão: recebe o pedido da página, manda o link ao app certo e guarda o histórico.
// Quem chama os apps é ele, não a página: com a permissão do endereço do homelab, o Chrome deixa
// a extensão falar com eles sem CORS.
importScripts('destinos.js')

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
  const acao = acoesDaPagina(link).find((a) => a.app === info.menuItemId)
  if (!acao) {
    const mensagem = info.menuItemId === 'flashcards' ? 'Vídeo do YouTube vai só ao Acervo.' : 'Este link não vai a nenhum app.'
    sinalizar({ estado: 'erro', mensagem })
    return
  }
  // Num link, o título é o texto dele (quando o Chrome dá) ou o próprio endereço.
  const titulo = info.linkUrl ? info.selectionText || info.linkUrl : aba?.title
  sinalizar(await enviar({ app: acao.app, url: acao.url, titulo }))
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
