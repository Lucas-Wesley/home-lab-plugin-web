// Para onde vai cada página: as regras, usadas pela página (pagina.js), pelo
// serviço (servico.js) e pelos testes. Script comum, sem módulos: o Chrome carrega este arquivo
// antes do pagina.js, e o serviço o importa com importScripts. Fica dentro de uma função para os nomes
// daqui não colidirem com os de quem o usa: só globalThis.Destinos sai.
;(() => {
  const ENDERECOS_PADRAO = {
    acervo: 'https://acervo.internal',
    flashcards: 'https://flashcards.internal',
    biblioteca: 'https://biblioteca.internal',
    trilha: 'https://trilha.internal',
    cortes: 'https://cortes.internal',
  }

  const APPS = {
    acervo: { nome: 'Acervo', acao: 'Mandar ao Acervo' },
    flashcards: { nome: 'Flashcards', acao: 'Fazer flashcards' },
    biblioteca: { nome: 'Biblioteca', acao: 'Mandar à Biblioteca' },
    trilha: { nome: 'Trilha', acao: 'Mandar à Trilha' },
    cortes: { nome: 'Cortes', acao: 'Mandar ao Cortes' },
  }

  const HISTORICO_MAXIMO = 50

  // Os cursos de outras plataformas (E14): nas páginas deles, o botão vira "Analisar vídeo", que coleta
  // como o vídeo chega (só a coleta, nada é baixado). Os donos da Branas.io e da LINUXtips autorizaram o Lucas; na Full Cycle, na
  // Tech Leads Club e no Chef Enzo Neto ele é aluno.
  const CURSOS = {
    branas: { nome: 'Branas.io', hosts: ['branas.io'] },
    linuxtips: { nome: 'LINUXtips', hosts: ['linuxtips.io'] },
    fullcycle: { nome: 'Full Cycle', hosts: ['fullcycle.com.br'] },
    techleads: { nome: 'Tech Leads Club', hosts: ['techleads.club'] },
    // E20: a área de membros (Cademí) do Chef Enzo Neto, com quatro cursos na vitrine: a extensão passa pela
    // escola inteira (escola: true) e manda cada aula, com o texto da página, para a trilha do curso.
    enzoneto: { nome: 'Chef Enzo Neto', hosts: ['aluno.enzoneto.com'], escola: true },
  }

  // cursoDaPagina: o curso da página (o id em CURSOS) e o endereço base dele, ou null.
  function cursoDaPagina(endereco) {
    let u
    try {
      u = new URL(endereco)
    } catch {
      return null
    }
    if (u.protocol !== 'https:') return null
    for (const [id, curso] of Object.entries(CURSOS)) {
      if (curso.hosts.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`))) return { curso: id, nome: curso.nome, url: u.origin, ...(curso.escola ? { escola: true } : {}) }
    }
    return null
  }

  // O vídeo do YouTube na URL: /watch?v=, /shorts/<id> ou /live/<id> (os mesmos que o Acervo aceita).
  function videoDoYouTube(endereco) {
    let u
    try {
      u = new URL(endereco)
    } catch {
      return ''
    }
    const host = u.hostname.replace(/^(www|m)\./, '')
    if (host !== 'youtube.com' && host !== 'music.youtube.com') return ''
    let id = ''
    if (u.pathname === '/watch') id = u.searchParams.get('v') || ''
    else {
      const partes = u.pathname.split('/').filter(Boolean)
      if (partes.length === 2 && (partes[0] === 'shorts' || partes[0] === 'live')) id = partes[1]
    }
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : ''
  }

  // linkLimpo tira da URL o que só serve para rastrear (#…, utm_…, fbclid, gclid).
  function linkLimpo(u) {
    const limpo = new URL(u.href)
    limpo.hash = ''
    for (const k of [...limpo.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/.test(k)) limpo.searchParams.delete(k)
    return limpo.href
  }

  // ehPdf: a página (ou o link) é um PDF, pelo tipo do documento (document.contentType) ou pelo nome (E12).
  function ehPdf(endereco, tipo = '') {
    if (tipo === 'application/pdf') return true
    try {
      const u = new URL(endereco)
      return (u.protocol === 'https:' || u.protocol === 'http:') && /\.pdf$/i.test(u.pathname)
    } catch {
      return false
    }
  }

  // destinoDaPagina diz se a página tem botão e para qual app: o vídeo do YouTube vai à Trilha (E13);
  // um PDF vai à Biblioteca (E12); qualquer outra página com frases de exemplo (temExemplos) vai ao Flashcards.
  // Na página de um dos cursos (E14), o botão é o da coleta, com o endereço base do curso: trocar de aula
  // sem recarregar não reinicia o botão.
  function destinoDaPagina(endereco, temExemplos, pdf = false) {
    const curso = cursoDaPagina(endereco)
    if (curso) return { app: 'coleta', ...curso }
    const video = videoDoYouTube(endereco)
    if (video) return { app: 'trilha', url: `https://www.youtube.com/watch?v=${video}` }
    let u
    try {
      u = new URL(endereco)
    } catch {
      return null
    }
    if (pdf && (u.protocol === 'https:' || u.protocol === 'http:')) return { app: 'biblioteca', url: linkLimpo(u) }
    if (!temExemplos || (u.protocol !== 'https:' && u.protocol !== 'http:') || /(^|\.)youtube\.com$/.test(u.hostname)) return null
    return { app: 'flashcards', url: linkLimpo(u) }
  }

  // acoesDaPagina: para onde a página (ou um link) pode ir, pelo popup ou pelo menu do botão direito
  // (E10). O vídeo do YouTube vai à Trilha (a Entrada, E13), ao Cortes (E26: o app do canal de cortes) ou ao Acervo; qualquer outra página vai ao Acervo, como artigo, ou ao
  // Flashcards. Um PDF vai só à Biblioteca, como livro (E12). O YouTube fora de um vídeo e o que não é
  // http(s) não vão a lugar nenhum.
  function acoesDaPagina(endereco, pdf = false) {
    const video = videoDoYouTube(endereco)
    if (video) {
      const url = `https://www.youtube.com/watch?v=${video}`
      return [{ app: 'trilha', url }, { app: 'cortes', url }, { app: 'acervo', url }]
    }
    let u
    try {
      u = new URL(endereco)
    } catch {
      return []
    }
    if ((u.protocol !== 'https:' && u.protocol !== 'http:') || /(^|\.)youtube\.com$/.test(u.hostname)) return []
    const url = linkLimpo(u)
    if (pdf) return [{ app: 'biblioteca', url }]
    return [
      { app: 'acervo', url },
      { app: 'flashcards', url },
    ]
  }

  // O baralho padrão dos links: o "Inglês", se existir.
  const semAcento = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
  function baralhoPadrao(baralhos) {
    return baralhos.find((b) => semAcento(b.nome) === 'ingles')?.id ?? ''
  }

  // O pedido que cada app recebe e onde abrir o resultado. ajustes.baralho: o id do baralho, ou
  // "novo" (um baralho novo para cada página).
  function pedidoPara(app, url, ajustes) {
    if (app === 'acervo') return { caminho: '/api/referencias', corpo: { url } }
    // A Trilha divide o vídeo e já sugere as trilhas sozinha (T46 de lá).
    if (app === 'trilha') return { caminho: '/api/entrada', corpo: { url, automatico: true } }
    // O Cortes guarda o link e o operário do Mac mini puxa a legenda e o mapa de assuntos sozinho (K1/K2 de lá).
    if (app === 'cortes') return { caminho: '/api/videos', corpo: { url } }
    if (app === 'biblioteca') return { caminho: '/api/books' } // o corpo é o próprio PDF, num formulário (servico.js)
    const baralho = ajustes.baralho === 'novo' ? '' : ajustes.baralho || ''
    return { caminho: '/api/links', corpo: { url, baralho_id: baralho, tipo: ajustes.tipo || 'basico' } }
  }

  // resultadoDaResposta traduz a resposta do app no que a página e o histórico mostram.
  function resultadoDaResposta(app, endereco, status, dados) {
    const base = endereco.replace(/\/+$/, '')
    if (app === 'acervo') {
      if (status === 201) return { estado: 'enviado', mensagem: 'Na fila do Acervo', abrir: `${base}/#/referencia/${dados.id}` }
      if (status === 409 && dados?.id) return { estado: 'repetido', mensagem: 'Já está no Acervo', abrir: `${base}/#/referencia/${dados.id}` }
    } else if (app === 'trilha') {
      // A Entrada responde 202 com a lista de fontes; o vídeo que já estava volta como está.
      const f = Array.isArray(dados) ? dados[0] : null
      if (status === 202 && f) {
        const abrir = `${base}/#/entrada/${f.id}`
        if (f.estado !== 'na_fila') return { estado: 'repetido', mensagem: 'Já está na Entrada da Trilha', abrir }
        return { estado: 'enviado', mensagem: 'Na Entrada: a IA divide e sugere as trilhas', abrir }
      }
    } else if (app === 'cortes') {
      if (status === 201) return { estado: 'enviado', mensagem: 'No Cortes: legenda e mapa de assuntos a caminho', abrir: `${base}/#/video/${dados.id}` }
      if (status === 409 && dados?.id) return { estado: 'repetido', mensagem: 'Já está no Cortes', abrir: `${base}/#/video/${dados.id}` }
    } else if (app === 'biblioteca') {
      if (status === 201) return { estado: 'enviado', mensagem: 'Na Biblioteca', abrir: `${base}/#/livro/${encodeURIComponent(dados.id)}` }
      if (status === 409) return { estado: 'repetido', mensagem: 'Já está na Biblioteca', abrir: '' }
    } else if (status === 201) {
      const pronta = dados.estado === 'em_revisao'
      return {
        estado: 'enviado',
        mensagem: pronta ? 'Cartões prontos para revisar' : 'A IA está montando os exemplos',
        abrir: `${base}/#/geracao/${dados.id}`,
      }
    } else if (status === 409) {
      return { estado: 'repetido', mensagem: dados?.erro || 'Já está no baralho', abrir: '' }
    }
    // A Biblioteca responde os erros em "error"; o Acervo e o Flashcards, em "erro".
    return { estado: 'erro', mensagem: dados?.erro || dados?.error || `O ${APPS[app].nome} respondeu ${status}`, abrir: '' }
  }

  // nomeDoPdf: o nome do arquivo para a Biblioteca, tirado do endereço.
  function nomeDoPdf(endereco) {
    let nome = ''
    try {
      nome = decodeURIComponent(new URL(endereco).pathname.split('/').pop() || '')
    } catch {}
    nome = nome.replace(/[\\/:*?"<>|]/g, '').trim() || 'documento'
    return /\.pdf$/i.test(nome) ? nome : `${nome}.pdf`
  }

  // acrescentar põe o envio no topo do histórico, sem passar do máximo.
  function acrescentar(historico, envio) {
    return [envio, ...historico].slice(0, HISTORICO_MAXIMO)
  }

  globalThis.Destinos = { ENDERECOS_PADRAO, APPS, CURSOS, HISTORICO_MAXIMO, cursoDaPagina, videoDoYouTube, ehPdf, nomeDoPdf, destinoDaPagina, acoesDaPagina, baralhoPadrao, pedidoPara, resultadoDaResposta, acrescentar }
})()
