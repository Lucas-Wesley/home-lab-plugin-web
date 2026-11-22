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
const { tamanhoLegivel, duracaoLegivel, resumoDoMapa } = globalThis.Aulas

async function mostrarAula() {
  const aba = await abaDaPagina()
  if (!aba) return
  const r = await chrome.runtime.sendMessage({ tipo: 'aulaDaAba', aba }).catch(() => null)
  if (!r?.aula) {
    // A página do curso não respondeu (aberta antes de instalar ou atualizar a extensão, E18): dizer
    // o que fazer em vez de esconder o bloco. A URL vem da permissão activeTab do clique no ícone.
    const [ativa] = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => [])
    const curso = ativa?.url && globalThis.Destinos.cursoDaPagina(ativa.url)
    if (!curso) return
    // E20: a escola se mapeia sozinha (a aba navega): o bloco aparece mesmo sem a página responder.
    if (curso.escola) {
      mostrarEscola(aba, { plataforma: curso.curso, nomePlataforma: curso.nome, origem: curso.url })
      return
    }
    $('aula').hidden = false
    $('aula-plataforma').textContent = curso.nome
    $('aula-info').textContent = r?.erro || 'Não consegui ler esta página: recarregue a aula e abra o popup de novo.'
    $('aula-info').classList.add('erro')
    $('aula-de-novo').hidden = false
    return
  }
  const { aula } = r
  // E20: na escola, o bloco da escola sempre; o da aula, só na página de uma aula.
  let daEscola = null
  if (aula.escola) {
    mostrarEscola(aba, {
      plataforma: aula.plataforma,
      nomePlataforma: aula.nomePlataforma,
      origem: new URL(aula.pagina).origin,
      ...(aula.ehAula && aula.cursoPadrao ? { cursoDaAula: aula.cursoPadrao, paginaDaAula: aula.pagina } : {}),
    })
    if (!aula.ehAula) return
    // O curso e a ordem da aula vêm do mapa da escola, se ela já foi mapeada.
    const { lote } = await chrome.storage.local.get('lote')
    for (const c of lote?.mapa?.cursos || []) {
      let ordem = 0
      for (const m of c.modulos)
        for (const a of m.aulas) {
          ordem++
          if (a.url === aula.pagina) daEscola = { curso: c.nome, modulo: m.nome, ordem }
        }
    }
  }
  $('aula').hidden = false
  $('aula-plataforma').textContent = aula.nomePlataforma
  const { cursos = {} } = await chrome.storage.local.get('cursos')
  if (!$('aula-curso').value) $('aula-curso').value = daEscola?.curso || cursos[aula.chaveCurso] || aula.curso || aula.cursoPadrao || ''
  if (daEscola && !$('aula-modulo').value) $('aula-modulo').value = daEscola.modulo
  if (!$('aula-modulo').value) $('aula-modulo').value = aula.modulo || ''
  if (!$('aula-titulo').value) $('aula-titulo').value = aula.titulo || ''
  if (!mostrarAula.loteAberto && !aula.escola) {
    mostrarAula.loteAberto = true
    mostrarLote(aba, aula)
  }

  const info = $('aula-info')
  info.classList.remove('erro')
  $('aula-de-novo').hidden = true
  $('aula-baixar').disabled = true
  $('aula-baixar').textContent = 'Baixar esta aula'
  const aviso = aula.erroLeitura ? ` Li só o título da aba (erro ao ler a página: ${aula.erroLeitura}); confira os nomes.` : ''
  // O pedido à Trilha: o vídeo (HLS ou embutido) e, na escola, o texto da página, a ordem e a trilha do curso.
  const pedidoDaAula = (curso, titulo) => ({
    plataforma: aula.plataforma,
    curso,
    modulo: $('aula-modulo').value.trim(),
    titulo,
    pagina: aula.pagina,
    ...(r.video || {}),
    ...(aula.escola ? { texto: aula.texto || '', trilha: true, anexos: aula.anexos || [], ...(daEscola ? { ordem: daEscola.ordem } : {}) } : {}),
  })
  $('aula-baixar').onclick = () => enviarAula(pedidoDaAula, cursos, aula)
  if (r.semVideo) {
    info.textContent = 'Ainda não achei o vídeo: dê play na aula e procure de novo.' + aviso
    $('aula-de-novo').hidden = false
    // E20: aula da escola sem vídeo (texto, PDF): manda só o texto da página.
    if (aula.escola && aula.texto) {
      info.textContent = 'Não achei vídeo nesta aula (dê play e procure de novo, se tiver). Dá para mandar só o texto da página.' + aviso
      $('aula-baixar').textContent = 'Mandar o texto da aula'
      $('aula-baixar').disabled = false
    }
    return
  }
  if (r.erro) {
    info.textContent = r.erro + aviso
    info.classList.add('erro')
    $('aula-de-novo').hidden = false
    return
  }
  const e = r.estimativa
  const partes = [e.qualidade && `${e.qualidade} (a maior)`, duracaoLegivel(e.duracao), e.tamanho_estimado && `cerca de ${tamanhoLegivel(e.tamanho_estimado)}`]
  if (e.livre) partes.push(`${tamanhoLegivel(e.livre)} livres`)
  info.textContent = partes.filter(Boolean).join(' · ') + aviso
  if (e.aula) {
    const ja = e.aula.estado === 'pronta' ? 'Esta aula já foi baixada.' : e.aula.estado === 'erro' ? 'Esta aula deu erro antes: baixar de novo tenta outra vez.' : 'Esta aula já está na fila.'
    info.textContent += ` ${ja}`
  }
  $('aula-baixar').disabled = !!e.aula && e.aula.estado !== 'erro'
}

async function enviarAula(pedidoDaAula, cursos, aula) {
  const info = $('aula-info')
  const curso = $('aula-curso').value.trim()
  const titulo = $('aula-titulo').value.trim()
  if (!curso || !titulo) {
    info.textContent = 'Escreva o nome do curso e o da aula.'
    info.classList.add('erro')
    return
  }
  const rotulo = $('aula-baixar').textContent
  $('aula-baixar').disabled = true
  $('aula-baixar').textContent = 'Enviando…'
  await chrome.storage.local.set({ cursos: { ...cursos, [aula.chaveCurso]: curso } })
  const res = await chrome.runtime.sendMessage({ tipo: 'baixarAula', pedido: pedidoDaAula(curso, titulo), aba: await abaDaPagina() })
  $('aula-baixar').textContent = rotulo
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

// E19: o curso inteiro. Antes de começar, o popup diz quantas aulas e seções achou na lista (para o
// Lucas conferir); durante, mostra o progresso, que o serviço guarda em chrome.storage.local.
let listaDoCurso = []
function desenharLote(lote) {
  if (lote?.tipo === 'escola') lote = null // a escola tem o bloco dela (E20)
  const info = $('lote-info')
  const lista = $('lote-problemas')
  lista.replaceChildren()
  for (const id of ['lote-baixar', 'lote-parar', 'lote-continuar', 'lote-esquecer']) $(id).hidden = true
  if (!lote) {
    if (listaDoCurso.length < 2) {
      $('lote').hidden = true
      return
    }
    $('lote').hidden = false
    const secoes = new Set(listaDoCurso.map((a) => a.modulo)).size
    info.textContent = `Achei ${listaDoCurso.length} aulas em ${secoes} seções, de "${listaDoCurso[0].titulo}" a "${listaDoCurso.at(-1).titulo}". Esta aba vai passar por cada uma (uns 15 s por aula): deixe-a aberta e à vista.`
    $('lote-baixar').hidden = false
    return
  }
  $('lote').hidden = false
  const conta = (e) => lote.aulas.filter((a) => a.estado === e).length
  const feitas = lote.aulas.filter((a) => a.estado).length
  const partes = [`${feitas} de ${lote.aulas.length}`, `${conta('enviada')} na Trilha`]
  if (conta('sem_video')) partes.push(`${conta('sem_video')} sem vídeo`)
  if (conta('erro')) partes.push(`${conta('erro')} com erro`)
  info.textContent = partes.join(' · ') + (lote.rodando ? (lote.atual ? ` · agora: ${lote.atual}` : '') : lote.aviso ? ` · ${lote.aviso}` : feitas === lote.aulas.length ? ' · terminou' : ' · parado')
  for (const a of lote.aulas.filter((a) => a.estado === 'erro' || a.estado === 'sem_video')) {
    const li = document.createElement('li')
    li.textContent = `${a.titulo}: ${a.mensagem}`
    lista.append(li)
  }
  $('lote-parar').hidden = !lote.rodando
  $('lote-continuar').hidden = lote.rodando || lote.aulas.every((a) => a.estado === 'enviada')
  $('lote-esquecer').hidden = lote.rodando
}

async function mostrarLote(aba, aula) {
  listaDoCurso = (await chrome.tabs.sendMessage(aba, { tipo: 'aulasDaLista' }).catch(() => null)) || []
  const { lote } = await chrome.storage.local.get('lote')
  desenharLote(lote)
  chrome.storage.onChanged.addListener((mudou, area) => {
    if (area === 'local' && 'lote' in mudou) desenharLote(mudou.lote.newValue)
  })
  $('lote-baixar').onclick = () => {
    const curso = $('aula-curso').value.trim()
    if (!curso) {
      $('lote-info').textContent = 'Escreva o nome do curso acima.'
      return
    }
    chrome.runtime.sendMessage({ tipo: 'iniciarLote', aba, curso, plataforma: aula.plataforma, aulas: listaDoCurso })
  }
  $('lote-parar').onclick = () => chrome.runtime.sendMessage({ tipo: 'pararLote' })
  $('lote-continuar').onclick = () => chrome.runtime.sendMessage({ tipo: 'continuarLote', aba })
  $('lote-esquecer').onclick = () => chrome.runtime.sendMessage({ tipo: 'esquecerLote' })
}

// E20: a escola inteira. 1) "Mapear a escola": a aba passa pela vitrine e por cada módulo e lista as
// aulas (nada é baixado); 2) o Lucas confere os cursos e marca os que quer; 3) "Baixar as aulas
// marcadas": a aba passa por cada aula, como no curso inteiro (E19), e cada aula vai à Trilha com o
// texto da página e "trilha: true" (cada curso vira uma trilha no grupo da escola).
const desmarcados = new Set()
let nomeDaEscola = ''
let cursoDestaAula = ''
function desenharEscola(lote) {
  const e = lote?.tipo === 'escola' ? lote : null
  const info = $('escola-info')
  const cursos = $('escola-cursos')
  const problemas = $('escola-problemas')
  cursos.replaceChildren()
  problemas.replaceChildren()
  info.classList.remove('erro')
  for (const id of ['escola-mapear', 'escola-baixar', 'escola-parar', 'escola-continuar', 'escola-refazer', 'escola-esquecer']) $(id).hidden = true
  $('escola-abrir').hidden = true
  $('escola-mapear').textContent = 'Mapear a escola'
  // E24: numa aula, o curso dela entra no mapa pela lista do lado (o cartão de alguns cursos na vitrine
  // não leva a um módulo e o "Mapear a escola" não o vê).
  $('escola-este').hidden = !cursoDestaAula || !!lote?.rodando
  $('escola-este').textContent = `Mapear este curso (${cursoDestaAula})`
  const listar = (itens) => {
    for (const t of itens) {
      const li = document.createElement('li')
      li.textContent = t
      problemas.append(li)
    }
  }
  if (!e) {
    info.textContent = `Passo 1: esta aba passa pela vitrine e por cada módulo para listar os cursos e as aulas (nada é baixado). Passo 2: você confere e manda baixar; cada curso vira uma trilha no grupo ${nomeDaEscola}, uma etapa por aula, com o vídeo e o texto da página.`
    if (lote?.rodando) info.textContent += ' Há um curso inteiro baixando: mapear a escola para ele.'
    $('escola-mapear').hidden = false
    return
  }
  const resumo = resumoDoMapa(e.mapa)
  const achadas = resumo.reduce((n, c) => n + c.aulas, 0)
  if (e.fase === 'mapear') {
    const n = e.fila?.length || 0
    if (e.rodando) info.textContent = `Mapeando: ${e.fila ? `módulo ${Math.min(e.i + 1, n)} de ${n}` : 'abrindo a vitrine'} · ${achadas} aulas achadas. Deixe esta aba aberta e à vista.`
    else {
      info.textContent = e.aviso || `Mapeamento parado em ${e.i || 0} de ${n} módulos.`
      if (e.aviso) info.classList.add('erro')
    }
    $('escola-parar').hidden = !e.rodando
    $('escola-continuar').hidden = e.rodando || !e.fila
    $('escola-mapear').hidden = e.rodando
    $('escola-mapear').textContent = 'Mapear de novo'
    $('escola-esquecer').hidden = e.rodando
    listar(e.problemas || [])
    return
  }
  if (e.fase === 'mapeado') {
    info.textContent = resumo.length
      ? `Achei ${resumo.length} ${resumo.length === 1 ? 'curso' : 'cursos'} e ${achadas} aulas. Marque os que quer baixar: cada curso vira uma trilha no grupo ${nomeDaEscola}.`
      : 'Não achei aulas nos módulos: abra uma aula, confira se a lista do lado aparece e mapeie de novo.'
    for (const c of resumo) {
      const li = document.createElement('li')
      const rotulo = document.createElement('label')
      const caixa = document.createElement('input')
      caixa.type = 'checkbox'
      caixa.checked = !desmarcados.has(c.nome)
      caixa.addEventListener('change', () => (caixa.checked ? desmarcados.delete(c.nome) : desmarcados.add(c.nome)))
      rotulo.append(caixa, `${c.nome} · ${c.modulos} ${c.modulos === 1 ? "módulo" : "módulos"} · ${c.aulas} ${c.aulas === 1 ? "aula" : "aulas"}`)
      li.append(rotulo)
      if (c.faltando.length) {
        const f = document.createElement('span')
        f.className = 'faltando'
        f.textContent = `Faltam aulas em: ${c.faltando.join('; ')}`
        li.append(f)
      }
      cursos.append(li)
    }
    $('escola-baixar').hidden = !resumo.length
    $('escola-mapear').hidden = false
    $('escola-mapear').textContent = 'Mapear de novo'
    $('escola-esquecer').hidden = false
    listar(e.problemas || [])
    return
  }
  // fase "baixar": o progresso, como no curso inteiro.
  const conta = (f) => e.aulas.filter(f).length
  const feitas = conta((a) => a.estado)
  const partes = [`${feitas} de ${e.aulas.length}`, `${conta((a) => a.estado === 'enviada' && !a.soTexto)} vídeos na Trilha`]
  if (conta((a) => a.soTexto)) partes.push(`${conta((a) => a.soTexto)} só texto`)
  const pdfs = e.aulas.reduce((n, a) => n + (a.pdfs || 0), 0)
  if (pdfs) partes.push(`${pdfs} PDF${pdfs === 1 ? '' : 's'}`)
  if (conta((a) => a.estado === 'sem_video')) partes.push(`${conta((a) => a.estado === 'sem_video')} sem vídeo`)
  if (conta((a) => a.estado === 'erro')) partes.push(`${conta((a) => a.estado === 'erro')} com erro`)
  info.textContent = partes.join(' · ') + (e.rodando ? (e.atual ? ` · agora: ${e.atual}` : '') : e.aviso ? ` · ${e.aviso}` : feitas === e.aulas.length ? ' · terminou' : ' · parado')
  listar([
    ...e.aulas.filter((a) => a.estado === 'erro' || a.estado === 'sem_video').map((a) => `${a.curso} › ${a.titulo}: ${a.mensagem}`),
    ...e.aulas.filter((a) => a.pdfsFalhos?.length).map((a) => `${a.curso} › ${a.titulo}: PDF não veio (${a.pdfsFalhos.join('; ')})`),
  ])
  $('escola-parar').hidden = !e.rodando
  $('escola-continuar').hidden = e.rodando || e.aulas.every((a) => a.estado === 'enviada' && !a.pdfsFalhos?.length)
  $('escola-esquecer').hidden = e.rodando
  // E24: depois do download, mapear de novo (para cursos novos) sem precisar limpar.
  $('escola-mapear').hidden = e.rodando
  $('escola-mapear').textContent = 'Mapear de novo'
  // E23: passar de novo por todas as aulas (com o mapa salvo); a Trilha não duplica e refaz o vídeo que veio sem som.
  $('escola-refazer').hidden = e.rodando
  $('escola-abrir').hidden = !conta((a) => a.estado === 'enviada')
}

async function mostrarEscola(aba, info) {
  if (mostrarEscola.aberta) return
  mostrarEscola.aberta = true
  nomeDaEscola = info.nomePlataforma
  cursoDestaAula = info.cursoDaAula || ''
  $('escola').hidden = false
  $('escola-nome').textContent = info.nomePlataforma
  const { lote, enderecos } = await chrome.storage.local.get(['lote', 'enderecos'])
  const trilha = { ...ENDERECOS_PADRAO, ...(enderecos || {}) }.trilha.replace(/\/+$/, '')
  $('escola-link').href = `${trilha}/#/trilhas/grupo/${encodeURIComponent(info.nomePlataforma)}`
  desenharEscola(lote)
  chrome.storage.onChanged.addListener((mudou, area) => {
    if (area === 'local' && 'lote' in mudou) desenharEscola(mudou.lote.newValue)
  })
  $('escola-mapear').onclick = () => {
    desmarcados.clear()
    chrome.runtime.sendMessage({ tipo: 'mapearEscola', aba, plataforma: info.plataforma, origem: info.origem })
  }
  $('escola-este').onclick = () => {
    desmarcados.clear()
    chrome.runtime.sendMessage({ tipo: 'mapearCursoEscola', aba, plataforma: info.plataforma, origem: info.origem, url: info.paginaDaAula, curso: cursoDestaAula })
  }
  $('escola-baixar').onclick = async () => {
    const { lote: atual } = await chrome.storage.local.get('lote')
    const marcados = resumoDoMapa(atual?.mapa).map((c) => c.nome).filter((n) => !desmarcados.has(n))
    if (!marcados.length) {
      $('escola-info').textContent = 'Marque pelo menos um curso.'
      return
    }
    chrome.runtime.sendMessage({ tipo: 'baixarEscola', aba, marcados })
  }
  $('escola-parar').onclick = () => chrome.runtime.sendMessage({ tipo: 'pararLote' })
  $('escola-continuar').onclick = () => chrome.runtime.sendMessage({ tipo: 'continuarLote', aba })
  $('escola-esquecer').onclick = () => chrome.runtime.sendMessage({ tipo: 'esquecerLote' })
  $('escola-refazer').onclick = async () => {
    const { lote: atual } = await chrome.storage.local.get('lote')
    const marcados = [...new Set((atual?.aulas || []).map((a) => a.curso))]
    if (marcados.length) chrome.runtime.sendMessage({ tipo: 'baixarEscola', aba, marcados })
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
