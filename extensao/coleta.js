// A coleta do vídeo nos cursos (E14): as regras puras, usadas pelo serviço (servico.js) e pelos testes.
// Script comum, como o destinos.js: só globalThis.Coleta sai. Nada aqui baixa vídeo; diz o que guardar
// do tráfego e resume como o vídeo chega (pedaços HLS/DASH, criptografia, DRM).
;(() => {
  const VERSAO = 1
  const PEDIDOS_MAXIMO = 5000
  const CORPO_MANIFESTO = 2 << 20 // 2 MB
  const CORPO_TEXTO = 200 << 10 // 200 KB

  // Cabeçalhos com a sessão do Lucas: o valor não vai para o arquivo.
  const SEGREDOS = /^(cookie|set-cookie|authorization|proxy-authorization|x-api-key|x-auth-token|x-csrf-token|x-xsrf-token)$/i

  function semSegredos(cabecalhos = {}) {
    const limpo = {}
    for (const [k, v] of Object.entries(cabecalhos)) limpo[k] = SEGREDOS.test(k) ? '[omitido]' : v
    return limpo
  }

  // O que o pedido é, pelo tipo da resposta e pelo endereço.
  function tipoDoPedido(url, mime = '') {
    const m = mime.toLowerCase()
    let caminho = ''
    try {
      caminho = new URL(url).pathname.toLowerCase()
    } catch {}
    if (m.includes('mpegurl') || caminho.endsWith('.m3u8')) return 'manifesto-hls'
    if (m.includes('dash+xml') || caminho.endsWith('.mpd')) return 'manifesto-dash'
    if (m.includes('vtt') || m.includes('subrip') || /\.(vtt|srt)$/.test(caminho)) return 'legenda'
    if (/\.(ts|m4s|m4v|m4a|aac|cmfv|cmfa)$/.test(caminho) || m === 'video/mp2t' || m === 'video/iso.segment') return 'pedaco'
    if (m.startsWith('video/') || m.startsWith('audio/') || /\.(mp4|webm|mp3)$/.test(caminho)) return 'midia'
    if (/licen[cs]e|widevine|playready|fairplay|\/drm\b/.test(caminho)) return 'licenca'
    if (/\.key$|\/keys?\//.test(caminho)) return 'chave'
    return 'outro'
  }

  // Palavras que indicam a configuração do player (o JSON que diz qual vídeo tocar).
  const DO_PLAYER = /video|player|embed|playback|manifest|stream|media|config|lesson|aula|content|source/i

  // precisaDoCorpo: o tamanho máximo do corpo a guardar (0 = não guardar). Só texto: manifestos e
  // legendas sempre; JSON/XML pequeno só se parecer do player. Binário (pedaço, chave, licença) nunca.
  function precisaDoCorpo(url, mime = '') {
    const tipo = tipoDoPedido(url, mime)
    if (tipo === 'manifesto-hls' || tipo === 'manifesto-dash' || tipo === 'legenda') return CORPO_MANIFESTO
    if (tipo !== 'outro') return 0
    const m = mime.toLowerCase()
    if (!(m.includes('json') || m.includes('xml') || m.startsWith('text/plain'))) return 0
    return DO_PLAYER.test(url) ? CORPO_TEXTO : 0
  }

  // Os atributos de uma linha #EXT-X-KEY: METHOD=AES-128,URI="...",KEYFORMAT="..."
  function atributosHls(linha) {
    const attrs = {}
    const resto = linha.slice(linha.indexOf(':') + 1)
    for (const m of resto.matchAll(/([A-Z0-9-]+)=("[^"]*"|[^,]*)/g)) attrs[m[1]] = m[2].replace(/^"|"$/g, '')
    return attrs
  }

  const WIDEVINE = 'edef8ba9-79d6-4ace-a3c8-27dcd51d21ed'
  const PLAYREADY = '9a04f079-9840-4286-ab92-e65be0885f95'
  const FAIRPLAY = 'com.apple.streamingkeydelivery'

  function drmDoTexto(texto) {
    const t = texto.toLowerCase()
    const achados = []
    if (t.includes(WIDEVINE) || t.includes('com.widevine')) achados.push('Widevine')
    if (t.includes(PLAYREADY) || t.includes('playready')) achados.push('PlayReady')
    if (t.includes(FAIRPLAY) || t.includes('skd://')) achados.push('FairPlay')
    return achados
  }

  // lerManifesto: o que um manifesto HLS ou DASH diz sobre a criptografia e as variantes.
  function lerManifesto(url, corpo, tipo) {
    const m = { url, tipo: tipo === 'manifesto-dash' ? 'dash' : 'hls', chaves: [], drm: drmDoTexto(corpo), variantes: 0, pedacos: 0, legendas: 0, audio: 0 }
    if (m.tipo === 'hls') {
      for (const linha of corpo.split(/\r?\n/)) {
        if (linha.startsWith('#EXT-X-KEY:') || linha.startsWith('#EXT-X-SESSION-KEY:')) {
          const a = atributosHls(linha)
          if (a.METHOD && a.METHOD !== 'NONE') m.chaves.push({ metodo: a.METHOD, formato: a.KEYFORMAT || 'identity', uri: a.URI || '' })
        } else if (linha.startsWith('#EXT-X-STREAM-INF:')) m.variantes++
        else if (linha.startsWith('#EXTINF:')) m.pedacos++
        else if (linha.startsWith('#EXT-X-MEDIA:')) {
          const a = atributosHls(linha)
          if (a.TYPE === 'SUBTITLES') m.legendas++
          if (a.TYPE === 'AUDIO') m.audio++
        }
      }
    } else {
      for (const p of corpo.matchAll(/<ContentProtection[^>]*schemeIdUri="([^"]+)"/gi)) m.chaves.push({ metodo: 'ContentProtection', formato: p[1], uri: '' })
      m.variantes = (corpo.match(/<Representation\b/gi) || []).length
    }
    return m
  }

  const hostDe = (url) => {
    try {
      return new URL(url).hostname
    } catch {
      return ''
    }
  }

  // resumir: o que a coleta mostra, para ler sem abrir os pedidos um a um. `pedidos` são os do
  // relatório (url, tipo, mime, status, tamanho, corpo?); `videos`, o estado dos <video> de cada quadro.
  function resumir(pedidos, videos = []) {
    const hosts = {}
    const manifestos = []
    const legendas = []
    let drmNaRede = []
    for (const p of pedidos) {
      const h = (hosts[p.host || hostDe(p.url)] ??= { pedidos: 0, bytes: 0, tipos: {} })
      h.pedidos++
      h.bytes += p.tamanho || 0
      h.tipos[p.tipo] = (h.tipos[p.tipo] || 0) + 1
      if ((p.tipo === 'manifesto-hls' || p.tipo === 'manifesto-dash') && p.corpo) manifestos.push(lerManifesto(p.url, p.corpo, p.tipo))
      if (p.tipo === 'legenda') legendas.push(p.url)
      if (p.tipo === 'licenca') drmNaRede.push(p.url)
    }
    const conta = (tipo) => pedidos.filter((p) => p.tipo === tipo).length
    const chaves = manifestos.flatMap((m) => m.chaves)
    const drm = [...new Set([...manifestos.flatMap((m) => m.drm), ...chaves.flatMap((c) => drmDoTexto(c.formato + ' ' + c.uri))])]
    const comMediaKeys = videos.filter((v) => v.mediaKeys).length
    const metodos = [...new Set(chaves.map((c) => c.metodo))]

    let veredito
    let explicacao
    if (drm.length || comMediaKeys || drmNaRede.length) {
      veredito = 'drm'
      explicacao = `O vídeo usa DRM (${drm.join(', ') || (comMediaKeys ? 'o <video> pediu chaves ao navegador' : 'pedido de licença na rede')}).`
    } else if (metodos.includes('SAMPLE-AES') || metodos.includes('SAMPLE-AES-CTR')) {
      veredito = 'sample-aes'
      explicacao = 'HLS com SAMPLE-AES: criptografia por amostra, sem DRM declarado.'
    } else if (metodos.includes('AES-128')) {
      veredito = 'aes128'
      explicacao = 'HLS com AES-128: os pedaços vêm cifrados e a chave é entregue ao navegador.'
    } else if (manifestos.length) {
      veredito = 'sem-criptografia'
      explicacao = `${manifestos.some((m) => m.tipo === 'dash') ? 'DASH' : 'HLS'} sem criptografia: os pedaços vêm abertos.`
    } else if (conta('midia')) {
      veredito = 'arquivo-direto'
      explicacao = 'O vídeo vem como arquivo (MP4 ou parecido), sem manifesto.'
    } else {
      veredito = 'indefinido'
      explicacao = conta('pedaco')
        ? 'Vieram pedaços de vídeo, mas o manifesto não foi lido (a coleta começou depois do play?).'
        : 'Nenhum vídeo passou pela rede: dê play durante a coleta.'
    }

    return {
      veredito,
      explicacao,
      manifestos,
      legendas,
      drm,
      videosComMediaKeys: comMediaKeys,
      contagem: { pedidos: pedidos.length, manifestos: conta('manifesto-hls') + conta('manifesto-dash'), pedacos: conta('pedaco'), midia: conta('midia'), chaves: conta('chave'), licencas: drmNaRede.length },
      hosts,
    }
  }

  // Frase curta para o botão da página, depois de salvar.
  const NOMES_VEREDITO = {
    drm: 'com DRM',
    'sample-aes': 'HLS com SAMPLE-AES',
    aes128: 'HLS com AES-128',
    'sem-criptografia': 'sem criptografia',
    'arquivo-direto': 'arquivo direto',
    indefinido: 'sem vídeo na coleta',
  }

  // O nome do arquivo salvo: homelab-coleta-<curso>-<aaaa-mm-dd-hhmm>.json
  function nomeDoArquivo(curso, quando) {
    const d = new Date(quando)
    const p = (n) => String(n).padStart(2, '0')
    return `homelab-coleta-${curso}-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`
  }

  // O que roda em cada quadro (página e iframes) no fim da coleta: o estado dos <video>.
  const SONDA_VIDEO = `(() => [...document.querySelectorAll('video')].map((v) => ({
    quadro: location.href,
    src: v.currentSrc || v.src || '',
    blob: (v.currentSrc || '').startsWith('blob:'),
    duracao: Number.isFinite(v.duration) ? Math.round(v.duration) : null,
    tempo: Math.round(v.currentTime),
    tocando: !v.paused,
    pronto: v.readyState,
    mediaKeys: !!v.mediaKeys,
    faixas: [...v.textTracks].map((t) => ({ tipo: t.kind, idioma: t.language, nome: t.label })),
    largura: v.videoWidth,
    altura: v.videoHeight,
  })))()`

  globalThis.Coleta = { VERSAO, PEDIDOS_MAXIMO, NOMES_VEREDITO, SONDA_VIDEO, semSegredos, tipoDoPedido, precisaDoCorpo, lerManifesto, resumir, nomeDoArquivo }
})()
