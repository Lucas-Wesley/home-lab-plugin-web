// Nos quadros da aula dos cursos (E15, E17): conta ao serviço cada manifesto HLS que o player pediu,
// com o Referer que o servidor do vídeo confere (a origem do quadro do player). Lê só a lista de recursos
// do próprio quadro (Resource Timing), sem tocar no vídeo nem na rede. Roda em todo quadro de todo site
// (cada plataforma usa um player: Panda, Bunny, Vimeo, o da própria página…), mas só conta quando a aba
// é a de um curso: o endereço do quadro de cima vem do location.ancestorOrigins.
;(() => {
  const { ehManifesto } = globalThis.Aulas
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
