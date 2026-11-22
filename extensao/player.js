// Nos quadros da aula dos cursos (E15, E17): conta ao serviço cada manifesto HLS que o player pediu,
// com o Referer que o servidor do vídeo confere (a origem do quadro do player). Lê só a lista de recursos
// do próprio quadro (Resource Timing), sem tocar no vídeo nem na rede. Roda em todo quadro de todo site
// (cada plataforma usa um player: Panda, Bunny, Vimeo, o da própria página…), mas só conta quando a aba
// é a de um curso: o endereço do quadro de cima vem do location.ancestorOrigins.
;(() => {
  const { ehManifesto, ehEmbed } = globalThis.Aulas
  const origens = [...(location.ancestorOrigins || [])]
  const topo = origens.length ? origens[origens.length - 1] : location.origin
  if (!globalThis.Destinos.cursoDaPagina(`${topo}/`)) return
  const vistos = new Set()
  const referer = `${location.origin}/`

  function contar(url) {
    if (!ehManifesto(url) || vistos.has(url)) return
    vistos.add(url)
    chrome.runtime.sendMessage({ tipo: 'manifestoVisto', url, referer }).catch(() => {})
  }

  // E20: este quadro é o player embutido do YouTube ou do Vimeo (dentro de outro quadro, a página não
  // o vê): conta o endereço dele, com o Referer = a origem de quem o embutiu (o Vimeo privado confere).
  if (window !== window.top && ehEmbed(location.href)) {
    const pai = origens.length ? `${origens[0]}/` : referer
    chrome.runtime.sendMessage({ tipo: 'embedVisto', url: location.href, referer: pai }).catch(() => {})
  }

  // E19/E20: o download do curso inteiro dá play sem som também no player que fica num iframe (Panda,
  // Vimeo): a página de cima só alcança o <video> dela. O quadro não responde: a resposta é a da página.
  if (window !== window.top) {
    chrome.runtime.onMessage.addListener((mensagem) => {
      if (mensagem?.tipo !== 'tocarMudo' && mensagem?.tipo !== 'pausar') return false
      for (const v of document.querySelectorAll('video')) {
        if (mensagem.tipo === 'pausar') v.pause()
        else {
          v.muted = true
          v.play().catch(() => {})
        }
      }
      return false
    })
  }

  for (const e of performance.getEntriesByType('resource')) contar(e.name)
  try {
    new PerformanceObserver((lista) => {
      for (const e of lista.getEntries()) contar(e.name)
    }).observe({ type: 'resource', buffered: true })
  } catch {
    // Sem o observador, os já carregados bastam (o mestre vem logo no começo).
  }
  // A lista de recursos tem limite (150 por padrão): numa aula longa, ela enche de pedaços.
  performance.setResourceTimingBufferSize?.(2000)
})()
