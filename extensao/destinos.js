// Para onde vai cada página: as regras, usadas pela página (pagina.js), pelo
// serviço (servico.js) e pelos testes. Script comum, sem módulos: o Chrome carrega este arquivo
// antes do pagina.js, e o serviço o importa com importScripts. Fica dentro de uma função para os nomes
// daqui não colidirem com os de quem o usa: só globalThis.Destinos sai.
;(() => {
  const ENDERECOS_PADRAO = {
    acervo: 'https://192.168.1.20:8444',
    flashcards: 'https://192.168.1.20:8445',
  }

  const APPS = {
    acervo: { nome: 'Acervo', acao: 'Mandar ao Acervo' },
    flashcards: { nome: 'Flashcards', acao: 'Fazer flashcards' },
  }

  const HISTORICO_MAXIMO = 50

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

  // destinoDaPagina diz se a página tem botão e para qual app: o vídeo do YouTube vai ao Acervo;
  // qualquer outra página com frases de exemplo (temExemplos) vai ao Flashcards.
  function destinoDaPagina(endereco, temExemplos) {
    const video = videoDoYouTube(endereco)
    if (video) return { app: 'acervo', url: `https://www.youtube.com/watch?v=${video}` }
    let u
    try {
      u = new URL(endereco)
    } catch {
      return null
    }
    if (!temExemplos || (u.protocol !== 'https:' && u.protocol !== 'http:') || /(^|\.)youtube\.com$/.test(u.hostname)) return null
    return { app: 'flashcards', url: linkLimpo(u) }
  }

  // acoesDaPagina: para onde a página (ou um link) pode ir, pelo popup ou pelo menu do botão direito
  // (E10). O vídeo do YouTube vai ao Acervo; qualquer outra página vai ao Acervo, como artigo, ou ao
  // Flashcards. O YouTube fora de um vídeo e o que não é http(s) não vão a lugar nenhum.
  function acoesDaPagina(endereco) {
    const video = videoDoYouTube(endereco)
    if (video) return [{ app: 'acervo', url: `https://www.youtube.com/watch?v=${video}` }]
    let u
    try {
      u = new URL(endereco)
    } catch {
      return []
    }
    if ((u.protocol !== 'https:' && u.protocol !== 'http:') || /(^|\.)youtube\.com$/.test(u.hostname)) return []
    const url = linkLimpo(u)
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
    const baralho = ajustes.baralho === 'novo' ? '' : ajustes.baralho || ''
    return { caminho: '/api/links', corpo: { url, baralho_id: baralho, tipo: ajustes.tipo || 'basico' } }
  }

  // resultadoDaResposta traduz a resposta do app no que a página e o histórico mostram.
  function resultadoDaResposta(app, endereco, status, dados) {
    const base = endereco.replace(/\/+$/, '')
    if (app === 'acervo') {
      if (status === 201) return { estado: 'enviado', mensagem: 'Na fila do Acervo', abrir: `${base}/#/referencia/${dados.id}` }
      if (status === 409 && dados?.id) return { estado: 'repetido', mensagem: 'Já está no Acervo', abrir: `${base}/#/referencia/${dados.id}` }
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
    return { estado: 'erro', mensagem: dados?.erro || `O ${APPS[app].nome} respondeu ${status}`, abrir: '' }
  }

  // acrescentar põe o envio no topo do histórico, sem passar do máximo.
  function acrescentar(historico, envio) {
    return [envio, ...historico].slice(0, HISTORICO_MAXIMO)
  }

  globalThis.Destinos = { ENDERECOS_PADRAO, APPS, HISTORICO_MAXIMO, videoDoYouTube, destinoDaPagina, acoesDaPagina, baralhoPadrao, pedidoPara, resultadoDaResposta, acrescentar }
})()
