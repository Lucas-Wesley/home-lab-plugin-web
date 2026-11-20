import { test as base, chromium } from '@playwright/test'
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

const raiz = path.resolve(import.meta.dirname, '../..')

// Uma cópia da extensão que também pode falar com o servidor falso, em localhost.
function extensaoDeTeste() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'homelab-extensao-'))
  cpSync(path.join(raiz, 'extensao'), dir, { recursive: true })
  const manifest = JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8'))
  manifest.host_permissions.push('http://localhost/*')
  writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest))
  return dir
}

// O Acervo, o Flashcards e a Biblioteca de mentira: guardam o que receberam.
function appsFalsos() {
  const recebidos = []
  const vistos = new Set()
  const servidor = http.createServer((req, res) => {
    const pedacos = []
    req.on('data', (c) => pedacos.push(c))
    req.on('end', () => {
      const bruto = Buffer.concat(pedacos)
      const responder = (status, dados) => {
        res.writeHead(status, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(dados))
      }
      // A Biblioteca recebe o PDF num formulário: guarda o corpo como texto (latin1, byte a byte).
      if (req.method === 'POST' && req.url === '/api/books') {
        const corpo = bruto.toString('latin1')
        recebidos.push({ metodo: req.method, caminho: req.url, tipo: req.headers['content-type'], corpo })
        const ja = vistos.has('livro')
        vistos.add('livro')
        return ja ? responder(409, { error: 'esse livro já está na biblioteca' }) : responder(201, { id: 'livro1', title: 'x' })
      }
      const dados = bruto.length ? JSON.parse(bruto.toString('utf8')) : null
      recebidos.push({ metodo: req.method, caminho: req.url, corpo: dados })
      if (req.method === 'POST' && req.url === '/api/referencias') {
        if (vistos.has(dados.url)) return responder(409, { erro: 'Este vídeo já está nas Referências.', id: 'r1' })
        vistos.add(dados.url)
        return responder(201, { id: 'r1', estado: 'novo' })
      }
      // A Entrada da Trilha: 202 com a lista de fontes; o mesmo vídeo volta como está (já lido).
      if (req.method === 'POST' && req.url === '/api/entrada') {
        const ja = vistos.has('entrada:' + dados.url)
        vistos.add('entrada:' + dados.url)
        return responder(202, [{ id: 5, estado: ja ? 'pronta' : 'na_fila' }])
      }
      // Os cursos da Trilha (T50): a estimativa e a fila de downloads.
      if (req.method === 'POST' && req.url === '/api/cursos/estimar') return responder(200, { qualidade: '720p', duracao: 7254, tamanho_estimado: 400 * 2 ** 20, livre: 50 * 2 ** 30, cifrado: false })
      if (req.method === 'POST' && req.url === '/api/cursos/aulas') {
        const ja = vistos.has('aula:' + dados.manifesto)
        vistos.add('aula:' + dados.manifesto)
        return ja ? responder(200, { repetida: true, aula: { id: 9, estado: 'na_fila' } }) : responder(202, { aula: { id: 9, estado: 'na_fila' } })
      }
      if (req.method === 'GET' && req.url === '/api/baralhos') return responder(200, [{ id: 'b2', nome: 'Bandeiras' }, { id: 'b1', nome: 'Inglês' }])
      if (req.method === 'POST' && req.url === '/api/links') return responder(201, { id: 7, origem: 'link', estado: 'na_fila' })
      responder(404, { erro: 'não encontrado' })
    })
  })
  return { servidor, recebidos }
}

const paginaDoYouTube = (titulo) => `<!doctype html><html><head><title>${titulo} - YouTube</title></head><body><h1>${titulo}</h1>
  <a id="outro" href="#">outro vídeo</a></body></html>`

export const PAGINA_COM_EXEMPLOS = `<!doctype html><html><head><title>Shoot Up | O que significa? - Blog de Inglês</title></head><body>
  <h1>Shoot Up</h1>
  <p><em><strong>Prices shot up last month.</strong><br>Os preços dispararam no mês passado.</em></p>
  <figure><audio src="/audio/01.mp3"></audio></figure></body></html>`

// Um PDF mínimo; o conteúdo é o que a Biblioteca falsa confere.
export const PDF = '%PDF-1.4\n% livro de teste\n%%EOF\n'

const ARTIGO = `<!doctype html><html><head><title>Break the ice - Notícias</title></head><body>
  <h1>Break the ice</h1><p>Um artigo sem frases de exemplo destacadas.</p></body></html>`

export const test = base.extend({
  apps: [
    async ({}, usar) => {
      const apps = appsFalsos()
      await new Promise((ok) => apps.servidor.listen(0, ok))
      apps.endereco = `http://localhost:${apps.servidor.address().port}`
      await usar(apps)
      apps.servidor.close()
    },
    { scope: 'test' },
  ],
  context: async ({ apps }, usar) => {
    const dir = extensaoDeTeste()
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [`--disable-extensions-except=${dir}`, `--load-extension=${dir}`],
    })
    // As páginas dos sites são simuladas: o Chrome acha que está no YouTube, num blog e num site de notícias.
    await context.route('https://www.youtube.com/**', (route) => route.fulfill({ contentType: 'text/html', body: paginaDoYouTube('Origem da laranja') }))
    await context.route('https://blog.exemplo.com/**', (route) => {
      const u = new URL(route.request().url())
      if (u.pathname.endsWith('.mp3')) return route.fulfill({ status: 404 })
      const body = u.pathname === '/' ? '<!doctype html><html><head><title>Blog</title></head><body><h1>Blog</h1></body></html>' : PAGINA_COM_EXEMPLOS
      return route.fulfill({ contentType: 'text/html', body })
    })
    // O Chromium dos testes baixa o PDF em vez de abrir: a página do PDF é simulada com HTML, e a
    // leitura do arquivo (o fetch da extensão) recebe o PDF.
    await context.route('https://docs.exemplo.com/**', (route) => {
      const u = new URL(route.request().url())
      if (u.pathname === '/privado.pdf') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Entrar</title><h1>Entrar</h1>' })
      if (u.pathname === '/grande.pdf' && route.request().resourceType() !== 'document')
        return route.fulfill({ contentType: 'application/pdf', body: Buffer.concat([Buffer.from(PDF), Buffer.alloc(9 << 20, 0xe9)]) })
      if (route.request().resourceType() === 'document')
        return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head><title>The Bell of Atri</title></head><body><a id="pdf" href="/outro.pdf">PDF</a></body></html>' })
      return route.fulfill({ contentType: 'application/pdf', body: PDF })
    })
    // A aula de um curso (E14): a página carrega o player num iframe de outro site, que pede um HLS com AES-128.
    await context.route('https://app.branas.io/**', (route) =>
      route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html><html><head><title>Arquitetura de Microservices</title></head><body><aside><div><p>Aula 2 (19/01/2026 às 19:00)</p><ul><li>Arquitetura Hexagonal</li></ul></div><div><p>Aula 6 (02/03/2026 às 19:00)</p><ul><li>Assistir aula completa</li><li><span>Arquitetura de Microservices</span></li></ul></div></aside><main><h1>Arquitetura de Microservices</h1><iframe id="player" src="https://player-vz-teste.tv.pandavideo.com.br/embed/1"></iframe></main></body></html>' }),
    )
    await context.route('https://player-vz-teste.tv.pandavideo.com.br/**', (route) => {
      const u = new URL(route.request().url())
      if (u.pathname === '/embed/1')
        return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>player</title><video></video><script>window.tocar = () => fetch("/v/1/playlist.m3u8?token=abc", { headers: { Authorization: "Bearer segredo" } }).then((r) => r.text()).then(() => fetch("/v/1/seg_001.ts"))</script>' })
      if (u.pathname.endsWith('.m3u8'))
        return route.fulfill({ contentType: 'application/vnd.apple.mpegurl', headers: { 'Access-Control-Allow-Origin': '*' }, body: '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="https://player-vz-teste.tv.pandavideo.com.br/keys/k1"\n#EXTINF:6.0,\nseg_001.ts\n' })
      return route.fulfill({ contentType: 'video/mp2t', body: Buffer.alloc(1000, 1) })
    })
    await context.route('https://noticias.exemplo.com/**', (route) => route.fulfill({ contentType: 'text/html', body: ARTIGO }))
    let [servico] = context.serviceWorkers()
    if (!servico) servico = await context.waitForEvent('serviceworker')
    await servico.evaluate((e) => chrome.storage.local.set({ enderecos: { acervo: e, flashcards: e, biblioteca: e, trilha: e } }), apps.endereco)
    context.servico = servico
    await usar(context)
    await context.close()
  },
  extensao: async ({ context }, usar) => {
    await usar(new URL(context.servico.url()).host)
  },
})

export { expect } from '@playwright/test'
