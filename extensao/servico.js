// O serviço da extensão: recebe o pedido da página, manda o link ao app certo e guarda o histórico.
// Quem chama os apps é ele, não a página: com a permissão do endereço do homelab, o Chrome deixa
// a extensão falar com eles sem CORS.
importScripts('destinos.js')

const { ENDERECOS_PADRAO, APPS, pedidoPara, resultadoDaResposta, acrescentar } = globalThis.Destinos

async function ajustes() {
  const salvos = await chrome.storage.local.get(['enderecos', 'baralho', 'tipo'])
  return {
    enderecos: { ...ENDERECOS_PADRAO, ...(salvos.enderecos || {}) },
    baralho: salvos.baralho || '',
    tipo: salvos.tipo || 'basico',
  }
}

async function chamar(endereco, caminho, { metodo = 'GET', corpo } = {}) {
  const resposta = await fetch(endereco.replace(/\/+$/, '') + caminho, {
    method: metodo,
    headers: corpo ? { 'Content-Type': 'application/json' } : {},
    body: corpo ? JSON.stringify(corpo) : undefined,
    signal: AbortSignal.timeout(30000),
  })
  const dados = await resposta.json().catch(() => null)
  return { status: resposta.status, dados }
}

async function enviar({ app, url, titulo }) {
  const a = await ajustes()
  const endereco = a.enderecos[app]
  const pedido = pedidoPara(app, url, a)
  let resultado
  try {
    const { status, dados } = await chamar(endereco, pedido.caminho, { metodo: 'POST', corpo: pedido.corpo })
    resultado = resultadoDaResposta(app, endereco, status, dados)
  } catch {
    resultado = { estado: 'erro', mensagem: `Sem conexão com o ${APPS[app].nome}: só funciona na rede de casa.`, abrir: '' }
  }
  const { historico = [] } = await chrome.storage.local.get('historico')
  await chrome.storage.local.set({
    historico: acrescentar(historico, { app, url, titulo: titulo || url, quando: new Date().toISOString(), ...resultado }),
  })
  return resultado
}

chrome.runtime.onMessage.addListener((mensagem, _remetente, responder) => {
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
