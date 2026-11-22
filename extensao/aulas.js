// Baixar a aula do curso (E15): as regras puras, usadas pelo player (player.js), pela página
// (pagina.js), pelo serviço, pelo popup e pelos testes. Script comum: só globalThis.Aulas sai.
;(() => {
  // O player.js roda em todos os quadros (a página e os iframes do player, de qualquer site) e conta os
  // manifestos HLS só quando a aba é de um dos cursos (E17: cada plataforma usa um player diferente).

  const ehManifesto = (url) => /\.m3u8(\?|$)/i.test(url)

  // O manifesto mestre (com as qualidades) é o que vale: o servidor escolhe a maior. Uma variante
  // (…/720p/video.m3u8) só se o mestre não passou.
  const ehVariante = (url) => /\/\d{3,4}p\/[^/]*\.m3u8/i.test(url)

  // escolherManifesto: dos manifestos vistos na aba (os mais novos no fim), o mestre mais recente;
  // sem mestre, o mais recente. Trocar de aula sem recarregar (LINUXtips) traz um mestre novo.
  function escolherManifesto(vistos) {
    const lista = (vistos || []).filter((m) => ehManifesto(m.url))
    for (let i = lista.length - 1; i >= 0; i--) if (!ehVariante(lista[i].url)) return lista[i]
    return lista[lista.length - 1] || null
  }

  // chaveDoCurso: o que identifica o curso na URL, para lembrar o nome que o Lucas deu.
  function chaveDoCurso(endereco) {
    let u
    try {
      u = new URL(endereco)
    } catch {
      return ''
    }
    const produto = u.pathname.match(/\/products\/([^/]+)/)
    if (produto) return `${u.hostname}/products/${produto[1]}`
    const treino = u.pathname.match(/\/treinamentos\/([^/]+)/)
    if (treino) return `${u.hostname}/treinamentos/${treino[1]}`
    // Full Cycle: /courses/<formação>/<n>/catalog/<n>/…; Tech Leads Club: /c/<curso>/…
    const catalogo = u.pathname.match(/^\/courses\/([^/]+\/\d+\/catalog\/\d+)/)
    if (catalogo) return `${u.hostname}/courses/${catalogo[1]}`
    const comunidade = u.pathname.match(/^\/c\/([^/]+)/)
    if (comunidade) return `${u.hostname}/c/${comunidade[1]}`
    return u.hostname
  }

  // cursoPadrao: o nome do curso antes de o Lucas escrever um (o slug do treinamento da LINUXtips).
  function cursoPadrao(endereco) {
    let u
    try {
      u = new URL(endereco)
    } catch {
      return ''
    }
    const treino = u.pathname.match(/\/treinamentos\/([^/]+)/)
    if (!treino) return ''
    return decodeURIComponent(treino[1])
      .split(/[-_]+/)
      .filter(Boolean)
      .map((p) => p[0].toUpperCase() + p.slice(1))
      .join(' ')
  }

  // Títulos que não são o da aula (o nome do site, da sala).
  const GENERICOS = /^(branas\.io|linuxtips|full ?cycle|tech leads club|sala de aula|mesa|aulas?|cursos?|meus cursos|in[ií]cio|home)$/i

  // tituloLimpo: o título da aba sem o nome do site ("Sala de Aula | LINUXtips" → "").
  function tituloLimpo(texto) {
    const t = String(texto || '').replace(/\s+/g, ' ').trim()
    const partes = t.split(/\s+[|·–—-]\s+/).map((p) => p.trim()).filter((p) => p && !GENERICOS.test(p))
    return partes[0] || ''
  }

  // Cabeçalho de seção da barra lateral: "Aula 6 (02/03/2026 às 19:00)", "Módulo 2 - …".
  const PARECE_MODULO = /^(aula|m[óo]dulo|semana|cap[ií]tulo|se[cç][ãa]o|parte|unidade|module|week|lesson|extra)\b/i

  // Textos curtos da barra lateral que não são nome de aula: progresso, duração, estado, navegação.
  const NAO_E_AULA = /^(\d{1,3}\s*%.*|\d+\s*(h|min|s)\b.*|\d+\s*\/\s*\d+|assistida.*|em progresso.*|conclu[ií]d[oa]|anterior|pr[óo]ximo|voltar|recolher|aula atual|report do m[óo]dulo|\d+ de \d+ conclu[ií]d[oa]s?|\d+\s*(aulas?|v[íi]deos?|lessons?|cap[ií]tulos?)|mostrar transcri[cç][ãa]o|concluir aula|continuar|\d{1,2}:\d{2}(:\d{2})?)$/i

  // A contagem ao lado do nome do módulo ("3 aulas", "5 aulas"): o nome do módulo fica junto (Tech Leads Club).
  const CONTAGEM = /^\d+\s*(aulas?|v[íi]deos?|lessons?)$/i

  // O nome do curso na URL (/c/<curso>, Tech Leads Club) e o texto da página que é o mesmo, sem o "[Curso]".
  const lesma = (t) =>
    String(t || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  function cursoDoEndereco(endereco, textos) {
    let u
    try {
      u = new URL(endereco)
    } catch {
      return ''
    }
    const m = u.pathname.match(/^\/c\/([^/]+)/)
    if (!m) return ''
    const alvo = lesma(decodeURIComponent(m[1]))
    if (alvo.length < 6) return ''
    const achado = (textos || []).map((t) => String(t || '').replace(/\s+/g, ' ').trim()).find((t) => t.length < 150 && lesma(t).endsWith(alvo))
    return achado ? achado.replace(/^\[[^\]]*\]\s*/, '') : ''
  }

  // Do caminho de navegação ("Meus Cursos › Curso Full Cycle 4.0 › DevSecOps › DevSecOps na Prática"), o curso:
  // o último item que não é genérico nem a própria aula.
  function cursoDoCaminho(itens, titulo = '') {
    const limpos = (itens || []).map((t) => String(t || '').replace(/\s+/g, ' ').trim()).filter((t) => t.length > 2 && t.length < 150 && !GENERICOS.test(t) && !/^[›>/»|]$/.test(t))
    for (let i = limpos.length - 1; i >= 0; i--) if (limpos[i].toLowerCase() !== String(titulo).toLowerCase()) return limpos[i]
    return ''
  }

  // "0% concluído": o nome do curso fica logo antes (Branas.io).
  const PROGRESSO = /^\d{1,3}\s*%\s*conclu/i

  const caixaAlta = (t) => t === t.toUpperCase() && t !== t.toLowerCase()

  // escolherTitulo: dos textos visíveis da página ({ texto, fonte, ativo }), o nome da aula. Os
  // dois sites o mostram duas vezes (no alto da aula e marcado na lista do módulo): vale o texto
  // que se repete ou o item marcado como atual; letra maior desempata. Sem nenhum, ''.
  function escolherTitulo(textos) {
    const grupos = new Map()
    for (const { texto, fonte = 0, ativo = false } of textos || []) {
      const t = String(texto || '').replace(/\s+/g, ' ').trim()
      if (t.length < 4 || t.length > 150 || GENERICOS.test(t) || NAO_E_AULA.test(t) || !/\p{L}{3}/u.test(t)) continue
      const k = t.toLowerCase()
      const g = grupos.get(k) || { texto: t, vezes: 0, ativo: false, fonte: 0 }
      if (caixaAlta(g.texto) && !caixaAlta(t)) g.texto = t
      g.vezes++
      g.ativo ||= ativo
      g.fonte = Math.max(g.fonte, fonte)
      grupos.set(k, g)
    }
    let melhor = null
    let nota = 0
    for (const g of grupos.values()) {
      if (g.vezes < 2 && !g.ativo) continue
      // Cabeçalho de módulo aberto ("Aula 6 (…)") pode vir marcado como ativo, e rótulos de uma palavra
      // (as abas "Vídeo", "Conteúdo") podem se repetir: os dois contam menos.
      const n = (g.vezes >= 2 ? 10 : 0) + (g.ativo ? 8 : 0) + Math.min(g.fonte, 40) / 4 - (PARECE_MODULO.test(g.texto) ? 6 : 0) - (/\s/.test(g.texto) ? 0 : 10)
      if (n > nota) [melhor, nota] = [g.texto, n]
    }
    return melhor || ''
  }

  // tamanho do arquivo para o popup: "1,2 GB", "340 MB".
  function tamanhoLegivel(bytes) {
    if (!bytes || bytes < 0) return ''
    const gb = bytes / 2 ** 30
    if (gb >= 1) return `${gb.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} GB`
    return `${Math.max(1, Math.round(bytes / 2 ** 20))} MB`
  }

  function duracaoLegivel(segundos) {
    if (!segundos) return ''
    const h = Math.floor(segundos / 3600)
    const m = Math.round((segundos % 3600) / 60)
    return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`
  }

  // ---------- E20: a escola inteira (Chef Enzo Neto, na Cademí) ----------
  // A Cademí não tem player próprio: cada escola hospeda o vídeo onde quer (HLS de um player como o
  // Panda, YouTube não listado, Vimeo). O HLS segue pelo player.js; o YouTube e o Vimeo vão como
  // "embed" e a Trilha baixa pelo yt-dlp (T55 de lá).

  // ehEmbed: o endereço é o player embutido do YouTube ou do Vimeo.
  function ehEmbed(endereco) {
    let u
    try {
      u = new URL(endereco)
    } catch {
      return false
    }
    if (u.protocol !== 'https:') return false
    const host = u.hostname.replace(/^www\./, '')
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') return /^\/embed\/[A-Za-z0-9_-]{11}$/.test(u.pathname)
    if (host === 'player.vimeo.com') return /^\/video\/\d+\/?$/.test(u.pathname)
    return false
  }

  // As páginas da área de membros da Cademí: a vitrine, o módulo (o cartão da vitrine leva a ele) e a aula.
  const LINK_AULA_ESCOLA = /\/area\/conteudo\/aula\/\d+\/?$/
  const LINK_MODULO_ESCOLA = /\/area\/(conteudo\/modulo|produto)\/\d+\/?$/

  // A sigla fica em maiúsculas (CDPS, PDF): sem vogal ou com até 4 letras e nenhuma minúscula no original.
  const SIGLAS = /^(cdps|pdf|diy|bbq|tv)$/i
  // nomeBonito: o nome em CAIXA ALTA da vitrine ("AS PRAÇAS DA COZINHA PRÁTICA") vira "As praças da cozinha
  // prática"; cada parte depois de " - " começa maiúscula. Nome que já tem minúsculas fica como está.
  function nomeBonito(texto) {
    const t = String(texto || '').replace(/\s+/g, ' ').trim()
    if (!t || t !== t.toUpperCase() || t === t.toLowerCase()) return t
    return t
      .split(/(\s+-\s+|\s+–\s+|:\s+)/)
      .map((parte, i) => {
        if (i % 2) return parte
        const palavras = parte.toLowerCase().split(' ')
        return palavras
          .map((p, j) => {
            if (SIGLAS.test(p) || (/^[a-z]{2,5}$/i.test(p) && !/[aeiouáéíóúâêôãõà]/i.test(p))) return p.toUpperCase()
            return j === 0 ? p.charAt(0).toUpperCase() + p.slice(1) : p
          })
          .join(' ')
      })
      .join('')
  }

  // semNumero: "1. Bases pronta" → "Bases pronta". Só o "N." da lista: "1 - 2 pessoas em casa" é o
  // nome da aula (casa de 1 a 2 pessoas), não numeração.
  const semNumero = (t) => String(t || '').replace(/^\s*\d{1,3}[.)]\s+/, '').trim()

  // acrescentarAoMapa: junta ao mapa da escola os módulos lidos numa página (grupos de aulas com o
  // nome do módulo e o "N aulas" esperado), no curso do cartão que levou até ela. A aula já vista
  // (por endereço) não entra de novo; o módulo de mesmo nome no mesmo curso é o mesmo.
  function acrescentarAoMapa(mapa, curso, grupos, moduloPadrao = '') {
    mapa.cursos ||= []
    mapa.vistas ||= {}
    let c = mapa.cursos.find((x) => x.nome === curso)
    if (!c) mapa.cursos.push((c = { nome: curso, modulos: [] }))
    let novas = 0
    const igual = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()
    for (const g of grupos || []) {
      const nome = nomeBonito(g.modulo) || nomeBonito(moduloPadrao) || curso
      // A aula que entrou antes pela caixa "→ <este módulo>" (título = o nome do módulo, noutro módulo) vem para cá.
      for (const a of g.aulas || []) {
        if (!a.url || !mapa.vistas[a.url]) continue
        for (const cc of mapa.cursos)
          for (const m of cc.modulos) {
            const i = m.aulas.findIndex((x) => x.url === a.url)
            if (i >= 0 && m.nome !== nome && igual(m.aulas[i].titulo, nome)) {
              m.aulas.splice(i, 1)
              delete mapa.vistas[a.url]
            }
          }
      }
      const aulas = (g.aulas || []).filter((a) => a.url && !mapa.vistas[a.url])
      if (!aulas.length && c.modulos.some((m) => m.nome === nome)) continue
      let m = c.modulos.find((x) => x.nome === nome)
      if (!m) c.modulos.push((m = { nome, esperado: 0, aulas: [] }))
      if (g.esperado) m.esperado = Math.max(m.esperado, g.esperado)
      for (const a of aulas) {
        mapa.vistas[a.url] = true
        m.aulas.push({ url: a.url, titulo: semNumero(a.titulo) || a.titulo })
        novas++
      }
    }
    return novas
  }

  // resumoDoMapa: por curso, os módulos, as aulas e os módulos com menos aulas do que a página diz.
  function resumoDoMapa(mapa) {
    return (mapa?.cursos || [])
      .map((c) => ({
        nome: c.nome,
        modulos: c.modulos.filter((m) => m.aulas.length).length,
        aulas: c.modulos.reduce((n, m) => n + m.aulas.length, 0),
        faltando: c.modulos.filter((m) => m.esperado > m.aulas.length).map((m) => `${m.nome} (${m.aulas.length} de ${m.esperado})`),
      }))
      .filter((c) => c.aulas > 0)
  }

  // aulasDoMapa: a fila de downloads dos cursos marcados, na ordem da escola; a ordem conta por curso.
  function aulasDoMapa(mapa, marcados) {
    const lista = []
    for (const c of mapa?.cursos || []) {
      if (marcados && !marcados.includes(c.nome)) continue
      let ordem = 0
      for (const m of c.modulos) for (const a of m.aulas) lista.push({ url: a.url, titulo: a.titulo, modulo: m.nome, curso: c.nome, ordem: ++ordem })
    }
    return lista
  }

  globalThis.Aulas = { ehEmbed, LINK_AULA_ESCOLA, LINK_MODULO_ESCOLA, nomeBonito, semNumero, acrescentarAoMapa, resumoDoMapa, aulasDoMapa, NAO_E_AULA, PROGRESSO, CONTAGEM, cursoDoEndereco, cursoDoCaminho, escolherTitulo, ehManifesto, ehVariante, escolherManifesto, chaveDoCurso, cursoPadrao, tituloLimpo, GENERICOS, PARECE_MODULO, tamanhoLegivel, duracaoLegivel }
})()
