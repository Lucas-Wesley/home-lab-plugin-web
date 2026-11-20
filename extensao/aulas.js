// Baixar a aula do curso (E15): as regras puras, usadas pelo player (player.js), pela página
// (pagina.js), pelo serviço, pelo popup e pelos testes. Script comum: só globalThis.Aulas sai.
;(() => {
  // Os players dos cursos: o script player.js roda nos iframes deles e conta os manifestos HLS.
  const PLAYERS = ['iframe.mediadelivery.net', 'tv.pandavideo.com.br']

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
  const GENERICOS = /^(branas\.io|linuxtips|sala de aula|mesa|aulas?|curso|in[ií]cio|home)$/i

  // tituloLimpo: o título da aba sem o nome do site ("Sala de Aula | LINUXtips" → "").
  function tituloLimpo(texto) {
    const t = String(texto || '').replace(/\s+/g, ' ').trim()
    const partes = t.split(/\s+[|·–—-]\s+/).map((p) => p.trim()).filter((p) => p && !GENERICOS.test(p))
    return partes[0] || ''
  }

  // Cabeçalho de seção da barra lateral: "Aula 6 (02/03/2026 às 19:00)", "Módulo 2 - …".
  const PARECE_MODULO = /^(aula|m[óo]dulo|semana|cap[ií]tulo|se[cç][ãa]o|parte|unidade|module|week|lesson|extra)\b/i

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

  globalThis.Aulas = { PLAYERS, ehManifesto, ehVariante, escolherManifesto, chaveDoCurso, cursoPadrao, tituloLimpo, GENERICOS, PARECE_MODULO, tamanhoLegivel, duracaoLegivel }
})()
