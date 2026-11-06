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

// O Acervo e o Flashcards de mentira: guardam o que receberam.
function appsFalsos() {
  const recebidos = []
  const vistos = new Set()
  const servidor = http.createServer((req, res) => {
    let corpo = ''
    req.on('data', (c) => (corpo += c))
    req.on('end', () => {
      const responder = (status, dados) => {
        res.writeHead(status, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(dados))
      }
      const dados = corpo ? JSON.parse(corpo) : null
      recebidos.push({ metodo: req.method, caminho: req.url, corpo: dados })
      if (req.method === 'POST' && req.url === '/api/referencias') {
        if (vistos.has(dados.url)) return responder(409, { erro: 'Este vídeo já está nas Referências.', id: 'r1' })
        vistos.add(dados.url)
        return responder(201, { id: 'r1', estado: 'novo' })
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
    await context.route('https://noticias.exemplo.com/**', (route) => route.fulfill({ contentType: 'text/html', body: ARTIGO }))
    let [servico] = context.serviceWorkers()
    if (!servico) servico = await context.waitForEvent('serviceworker')
    await servico.evaluate((e) => chrome.storage.local.set({ enderecos: { acervo: e, flashcards: e } }), apps.endereco)
    context.servico = servico
    await usar(context)
    await context.close()
  },
  extensao: async ({ context }, usar) => {
    await usar(new URL(context.servico.url()).host)
  },
})

export { expect } from '@playwright/test'
