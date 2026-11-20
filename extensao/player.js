// Nos iframes dos players dos cursos (E15): conta ao serviço cada manifesto HLS que o player pediu,
// com o Referer que o servidor do vídeo confere (a origem do player). Lê só a lista de recursos da
// própria página do player (Resource Timing), sem tocar no vídeo nem na rede.
;(() => {
  const { ehManifesto } = globalThis.Aulas
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
