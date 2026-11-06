// O popup do ícone: o histórico do que foi enviado e os ajustes (baralho, tipo, endereços).
const { ENDERECOS_PADRAO, APPS } = globalThis.Destinos

const $ = (id) => document.getElementById(id)

const NOMES_ESTADO = { enviado: 'enviado', repetido: 'já estava', erro: 'erro' }

function quando(iso) {
  const d = new Date(iso)
  const hoje = new Date().toDateString() === d.toDateString()
  return hoje
    ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

function mostrarHistorico(historico) {
  const lista = $('historico')
  lista.replaceChildren()
  $('vazio').hidden = historico.length > 0
  for (const envio of historico) {
    const li = document.createElement('li')
    const titulo = document.createElement('a')
    titulo.className = 'titulo'
    titulo.textContent = envio.titulo
    titulo.href = envio.abrir || envio.url
    titulo.target = '_blank'
    titulo.title = envio.mensagem
    const meta = document.createElement('span')
    meta.className = 'meta'
    const estado = document.createElement('span')
    estado.className = `estado ${envio.estado}`
    estado.textContent = NOMES_ESTADO[envio.estado] || envio.estado
    meta.append(`${APPS[envio.app]?.nome ?? envio.app} · ${quando(envio.quando)} · `, estado)
    li.append(titulo, meta)
    if (envio.estado === 'erro') {
      const msg = document.createElement('span')
      msg.className = 'mensagem'
      msg.textContent = envio.mensagem
      li.append(msg)
    }
    lista.append(li)
  }
}

async function carregarBaralhos(escolhido) {
  const r = await chrome.runtime.sendMessage({ tipo: 'baralhos' })
  if (r?.erro) {
    $('erro-baralhos').textContent = r.erro
    $('erro-baralhos').hidden = false
    return
  }
  for (const b of r.baralhos) $('baralho').append(new Option(b.nome, b.id, false, b.id === escolhido))
}

// A aba da página: a ativa ou, nos testes, a de ?aba=.
async function abaDaPagina() {
  const pedida = Number(new URLSearchParams(location.search).get('aba'))
  if (pedida) return pedida
  const [aba] = await chrome.tabs.query({ active: true, currentWindow: true })
  return aba?.id
}

// Se a página aberta tem botão, o popup também envia (pela página, que mostra o resultado).
async function mostrarAqui() {
  const aba = await abaDaPagina()
  if (!aba) return
  const destino = await chrome.tabs.sendMessage(aba, { tipo: 'destino' }).catch(() => null)
  if (!destino) return
  $('aqui-titulo').textContent = destino.titulo
  $('enviar').textContent = destino.acao
  $('aqui').hidden = false
  $('enviar').addEventListener('click', async () => {
    $('enviar').disabled = true
    $('enviar').textContent = 'Enviando…'
    await chrome.tabs.sendMessage(aba, { tipo: 'enviarDaqui' }).catch(() => null)
    $('aqui').hidden = true
  })
}

async function iniciar() {
  mostrarAqui()
  const s = await chrome.storage.local.get(['historico', 'baralho', 'tipo', 'enderecos'])
  mostrarHistorico(s.historico || [])
  $('tipo').value = s.tipo || 'basico'
  const enderecos = { ...ENDERECOS_PADRAO, ...(s.enderecos || {}) }
  $('acervo').value = enderecos.acervo
  $('flashcards').value = enderecos.flashcards
  carregarBaralhos(s.baralho || '')

  $('baralho').addEventListener('change', () => chrome.storage.local.set({ baralho: $('baralho').value }))
  $('tipo').addEventListener('change', () => chrome.storage.local.set({ tipo: $('tipo').value }))
  for (const app of ['acervo', 'flashcards']) {
    $(app).addEventListener('change', async () => {
      const atuais = (await chrome.storage.local.get('enderecos')).enderecos || {}
      const valor = $(app).value.trim().replace(/\/+$/, '')
      await chrome.storage.local.set({ enderecos: { ...atuais, [app]: valor || ENDERECOS_PADRAO[app] } })
      if (app === 'flashcards') location.reload()
    })
  }
  $('limpar').addEventListener('click', async () => {
    await chrome.storage.local.set({ historico: [] })
    mostrarHistorico([])
  })
  chrome.storage.onChanged.addListener((mudou) => {
    if (mudou.historico) mostrarHistorico(mudou.historico.newValue || [])
  })
}

iniciar()
