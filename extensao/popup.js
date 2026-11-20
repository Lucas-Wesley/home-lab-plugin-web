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
  // Sem escolha, o padrão: o "Inglês", se existir.
  const marcado = escolhido || globalThis.Destinos.baralhoPadrao(r.baralhos) || 'novo'
  for (const b of r.baralhos) $('baralho').append(new Option(b.nome, b.id))
  $('baralho').value = marcado
}

// A aba da página: a ativa ou, nos testes, a de ?aba=.
async function abaDaPagina() {
  const pedida = Number(new URLSearchParams(location.search).get('aba'))
  if (pedida) return pedida
  const [aba] = await chrome.tabs.query({ active: true, currentWindow: true })
  return aba?.id
}

// O que a página aberta pode fazer: um botão por app (E10). Quem envia é a página, que mostra o resultado.
async function mostrarAqui() {
  const aba = await abaDaPagina()
  if (!aba) return
  const destino = await chrome.tabs.sendMessage(aba, { tipo: 'destino' }).catch(() => null)
  if (!destino) return
  $('aqui-titulo').textContent = destino.titulo
  $('acoes').replaceChildren()
  destino.acoes.forEach(({ app, acao }, i) => {
    const botao = document.createElement('button')
    botao.type = 'button'
    botao.textContent = acao
    if (i === 0) botao.className = 'principal'
    botao.addEventListener('click', async () => {
      for (const b of $('acoes').querySelectorAll('button')) b.disabled = true
      botao.textContent = 'Enviando…'
      await chrome.tabs.sendMessage(aba, { tipo: 'enviarDaqui', app }).catch(() => null)
      $('aqui').hidden = true
    })
    $('acoes').append(botao)
  })
  $('aqui').hidden = false
}

// A aula aberta num dos cursos (E15): nome do curso (lembrado por curso), módulo e aula, com a
// estimativa da Trilha (qualidade máxima, duração, tamanho) e "Baixar esta aula".
const { tamanhoLegivel, duracaoLegivel } = globalThis.Aulas

async function mostrarAula() {
  const aba = await abaDaPagina()
  if (!aba) return
  const r = await chrome.runtime.sendMessage({ tipo: 'aulaDaAba', aba }).catch(() => null)
  if (!r?.aula) return
  const { aula } = r
  $('aula').hidden = false
  $('aula-plataforma').textContent = aula.nomePlataforma
  const { cursos = {} } = await chrome.storage.local.get('cursos')
  if (!$('aula-curso').value) $('aula-curso').value = cursos[aula.chaveCurso] || aula.curso || aula.cursoPadrao || ''
  if (!$('aula-modulo').value) $('aula-modulo').value = aula.modulo || ''
  if (!$('aula-titulo').value) $('aula-titulo').value = aula.titulo || ''

  const info = $('aula-info')
  info.classList.remove('erro')
  $('aula-de-novo').hidden = true
  $('aula-baixar').disabled = true
  if (r.semVideo) {
    info.textContent = 'Ainda não achei o vídeo: dê play na aula e procure de novo.'
    $('aula-de-novo').hidden = false
    return
  }
  if (r.erro) {
    info.textContent = r.erro
    info.classList.add('erro')
    $('aula-de-novo').hidden = false
    return
  }
  const e = r.estimativa
  const partes = [e.qualidade && `${e.qualidade} (a maior)`, duracaoLegivel(e.duracao), e.tamanho_estimado && `cerca de ${tamanhoLegivel(e.tamanho_estimado)}`]
  if (e.livre) partes.push(`${tamanhoLegivel(e.livre)} livres`)
  info.textContent = partes.filter(Boolean).join(' · ')
  if (e.aula) {
    const ja = e.aula.estado === 'pronta' ? 'Esta aula já foi baixada.' : e.aula.estado === 'erro' ? 'Esta aula deu erro antes: baixar de novo tenta outra vez.' : 'Esta aula já está na fila.'
    info.textContent += ` ${ja}`
  }
  $('aula-baixar').disabled = !!e.aula && e.aula.estado !== 'erro'
  $('aula-baixar').onclick = async () => {
    const curso = $('aula-curso').value.trim()
    const titulo = $('aula-titulo').value.trim()
    if (!curso || !titulo) {
      info.textContent = 'Escreva o nome do curso e o da aula.'
      info.classList.add('erro')
      return
    }
    $('aula-baixar').disabled = true
    $('aula-baixar').textContent = 'Enviando…'
    await chrome.storage.local.set({ cursos: { ...cursos, [aula.chaveCurso]: curso } })
    const res = await chrome.runtime.sendMessage({
      tipo: 'baixarAula',
      pedido: { plataforma: aula.plataforma, curso, modulo: $('aula-modulo').value.trim(), titulo, pagina: aula.pagina, manifesto: r.manifesto.url, referer: r.manifesto.referer },
    })
    $('aula-baixar').textContent = 'Baixar esta aula'
    const p = $('aula-resultado')
    p.hidden = false
    p.className = `aula-resultado ${res.estado === 'erro' ? 'erro' : ''}`
    p.textContent = `${res.mensagem}. `
    if (res.abrir) {
      const a = document.createElement('a')
      a.href = res.abrir
      a.target = '_blank'
      a.textContent = 'Abrir Cursos na Trilha'
      p.append(a)
    }
    if (res.estado === 'erro') $('aula-baixar').disabled = false
  }
}

async function iniciar() {
  mostrarAula()
  $('aula-de-novo').addEventListener('click', mostrarAula)
  mostrarAqui()
  const s = await chrome.storage.local.get(['historico', 'baralho', 'tipo', 'enderecos'])
  mostrarHistorico(s.historico || [])
  $('tipo').value = s.tipo || 'basico'
  const enderecos = { ...ENDERECOS_PADRAO, ...(s.enderecos || {}) }
  $('acervo').value = enderecos.acervo
  $('flashcards').value = enderecos.flashcards
  $('biblioteca').value = enderecos.biblioteca
  $('trilha').value = enderecos.trilha
  carregarBaralhos(s.baralho || '')

  $('baralho').addEventListener('change', () => chrome.storage.local.set({ baralho: $('baralho').value }))
  $('tipo').addEventListener('change', () => chrome.storage.local.set({ tipo: $('tipo').value }))
  for (const app of ['acervo', 'flashcards', 'biblioteca', 'trilha']) {
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
