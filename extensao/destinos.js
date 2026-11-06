// Para onde vai cada página: as regras dos sites conhecidos, usadas pela página (pagina.js), pelo
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

  function ehMairoVergara(endereco) {
    try {
      return ['mairovergara.com', 'www.mairovergara.com'].includes(new URL(endereco).hostname)
    } catch {
      return false
    }
  }

  // destinoDaPagina diz se a página tem botão e para qual app. temExemplos: a página do Mairo
  // Vergara tem frases de exemplo com áudio (só essas viram cartões).
  function destinoDaPagina(endereco, temExemplos) {
    const video = videoDoYouTube(endereco)
    if (video) return { app: 'acervo', url: `https://www.youtube.com/watch?v=${video}` }
    if (ehMairoVergara(endereco) && temExemplos) {
      const u = new URL(endereco)
      return { app: 'flashcards', url: `${u.origin}${u.pathname}` }
    }
    return null
  }

  // O pedido que cada app recebe e onde abrir o resultado.
  function pedidoPara(app, url, ajustes) {
    if (app === 'acervo') return { caminho: '/api/referencias', corpo: { url } }
    return { caminho: '/api/links', corpo: { url, baralho_id: ajustes.baralho || '', tipo: ajustes.tipo || 'basico' } }
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
        mensagem: pronta ? 'Cartões prontos para revisar' : 'A IA está escolhendo os exemplos',
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

  globalThis.Destinos = { ENDERECOS_PADRAO, APPS, HISTORICO_MAXIMO, videoDoYouTube, ehMairoVergara, destinoDaPagina, pedidoPara, resultadoDaResposta, acrescentar }
})()
