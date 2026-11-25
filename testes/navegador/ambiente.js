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
      if (req.method === 'POST' && /^\/api\/cursos\/aulas\/\d+\/anexos$/.test(req.url)) {
        recebidos.push({ metodo: req.method, caminho: req.url, tipo: req.headers['content-type'], corpo: bruto.toString('latin1') })
        return responder(201, { anexo: { id: 1, nome: 'x.pdf', tamanho: bruto.length } })
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
      // O Cortes (E26): 201 com o vídeo; o mesmo vídeo de novo, 409 com o id.
      if (req.method === 'POST' && req.url === '/api/videos') {
        if (vistos.has('cortes:' + dados.url)) return responder(409, { erro: 'Este vídeo já está na lista.', id: 9 })
        vistos.add('cortes:' + dados.url)
        return responder(201, { id: 9 })
      }
      // Os cursos da Trilha (T50): a estimativa e a fila de downloads.
      if (req.method === 'POST' && req.url === '/api/cursos/estimar') return responder(200, { qualidade: '720p', duracao: 7254, tamanho_estimado: 400 * 2 ** 20, livre: 50 * 2 ** 30, cifrado: false })
      if (req.method === 'POST' && req.url === '/api/cursos/aulas') {
        const chave = 'aula:' + (dados.manifesto || dados.embed || dados.pagina)
        const ja = vistos.has(chave)
        vistos.add(chave)
        const estado = dados.manifesto || dados.embed ? 'na_fila' : 'texto'
        const trilha = dados.trilha ? { trilha_id: 31 } : {}
        return ja ? responder(200, { repetida: true, aula: { id: 9, estado }, ...trilha }) : responder(202, { aula: { id: 9, estado }, ...trilha })
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

// A escola do Chef Enzo Neto: os módulos e as aulas da Cademí falsa.
const MODULOS_DA_ESCOLA = {
  100: { produto: 'CDPS - Comece por aqui', nome: 'O CAMINHO DA PRATICIDADE', aulas: [3], proximo: 101 },
  101: { produto: 'CDPS - Comece por aqui', nome: 'ORGANIZAÇÃO DA FAMÍLIA E DA ROTINA', aulas: [1, 2], anterior: 100, proximo: 102 },
  102: { produto: 'CDPS - Comece por aqui', nome: 'PRAÇA PRONTA - HABILIDADES BÁSICAS', aulas: [4], anterior: 101 },
}
const AULAS_DA_ESCOLA = {
  1: { titulo: 'Obrigatório em toda casa', video: 'youtube:AAAAAAAAAA1' },
  2: { titulo: '1 - 2 pessoas em casa', video: 'youtube:AAAAAAAAAA2' },
  3: { titulo: 'Bases prontas agilizam', video: 'youtube:AAAAAAAAAA3' },
  4: { titulo: 'Guia da praça pronta - PDF', video: '' },
  5: { titulo: 'Bases pronta = economia de tempo', video: 'youtube:AAAAAAAAAA5', lista: '1. Bases pronta = economia de tempo' },
  6: { titulo: 'Tablete de cebola', video: 'youtube:AAAAAAAAAA6', lista: '2. Tablete de cebola' },
  7: { titulo: 'Molho de tomate base', video: 'hls', lista: '1. Molho de tomate base' },
  8: { titulo: 'Como usar o Enzap', video: 'youtube:AAAAAAAAAA8' },
  // E24: o curso da fileira "Black Friday" (um módulo só; o cartão da vitrine não leva a um módulo).
  // E25: o título da página difere do da lista; depois do texto, os comentários e o menu das notificações.
  9: { titulo: 'Boas vindas', pagina: 'Boas-vindas ao curso', video: 'youtube:AAAAAAAAAA9', lista: '1. Boas vindas', comentarios: true },
  10: { titulo: 'O tripé - base, personalidade e frescor', video: 'youtube:AAAAAAAAA10', lista: '2. O tripé - base, personalidade e frescor' },
}

function listaDoModulo(nome, aulas) {
  const itens = aulas.map((n) => `<li><a href="/area/conteudo/aula/${n}"><span class="bolinha"></span>${AULAS_DA_ESCOLA[n].lista || AULAS_DA_ESCOLA[n].titulo}</a></li>`).join('')
  return `<div class="caixa modulo"><div class="cab"><div class="circulo"></div><div><div class="nome">${nome}</div><div class="conta">${aulas.length} aulas</div></div></div><ul>${itens}</ul></div>`
}

// As praças (produto "Praças - CDPS") mostram os módulos em sanfona; o segundo começa fechado.
const LATERAL_PRACAS = `<div class="lateral">${listaDoModulo('PRAÇA PRONTA - BASES E TEMPEROS', [5, 6])}
  <div class="caixa modulo"><button aria-expanded="false" onclick="abrir(this)"><div class="nome">PRAÇA PRONTA - MOLHO TOMATE</div><div class="conta">1 aulas</div></button><ul class="itens"></ul></div></div>
  <script>function abrir(b) { b.setAttribute('aria-expanded', 'true'); b.nextElementSibling.innerHTML = '<li><a href="/area/conteudo/aula/7">1. Molho de tomate base</a></li>' }</script>`

function lateralDoModulo(id) {
  const m = MODULOS_DA_ESCOLA[id]
  if (id === 300) return { lateral: `<div class="lateral">${listaDoModulo('INSTRUÇÕES', [8])}</div>`, produto: 'Enzap' }
  if (id === 400) return { lateral: `<div class="lateral">${listaDoModulo('Comida com assinatura', [9, 10])}</div>`, produto: 'Comida com assinatura' }
  if (!m) return { lateral: LATERAL_PRACAS, produto: 'Praças - CDPS' }
  const vizinho = (n, seta) => (n ? `<a class="caixa" href="/area/conteudo/aula/${MODULOS_DA_ESCOLA[n].aulas[0]}"><span>${seta}</span><span>${MODULOS_DA_ESCOLA[n].nome}</span></a>` : '')
  return {
    produto: m.produto,
    lateral: `<div class="lateral"><div class="caixa"><div>Meu progresso - 5.9%</div><div>1 de 17 aula</div></div>${vizinho(m.anterior, '←')}${listaDoModulo(m.nome, m.aulas)}${vizinho(m.proximo, '→')}</div>`,
  }
}

const moduloDaAula = (n) => (n >= 9 ? 400 : n === 8 ? 300 : n >= 5 ? 201 : Number(Object.entries(MODULOS_DA_ESCOLA).find(([, m]) => m.aulas.includes(n))[0]))

const COMENTARIOS_DA_AULA = `<div class="comentarios"><div class="abas"><a>Comentários, duvidas e pertguntas</a></div>
  <div class="comentario"><p>Fernanda D.</p><p>Animada por dar início a mais um curso do Enzo</p></div></div>`

function paginaDaEscola(caminho) {
  const topo = '<header><a href="/area/vitrine/home">Pagina inicial</a><a>SUPORTE</a><button aria-expanded="false">Perfil</button></header>'
  if (caminho === '/area/vitrine/home') {
    const cartao = (n, alt) => `<a class="cartao" href="/area/conteudo/modulo/${n}"><img alt="${alt}" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></a>`
    return `<!doctype html><html><head><title>Chef Enzo Neto</title></head><body>${topo}
      <section><div class="fileira-cab"><img class="ponto" alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="><span>COZINHA DE PANELA SÓ - COMECE POR AQUI</span></div>
        <div class="cartoes">${cartao(100, 'O método CDPS')}${cartao(101, 'Adequando o CDPS à sua família')}${cartao(102, 'Organização do ambiente e habilidades básicas')}</div></section>
      <section><div class="cartoes">${cartao(300, 'Instruções')}</div></section>
      <section><div class="fileira-cab"><span>AS PRAÇAS DA COZINHA PRÁTICA</span><button>‹</button><button>›</button></div>
        <div class="carrossel"><div class="trilho">${cartao(201, '')}${cartao(201, '')}</div></div></section>
      <section><div class="fileira-cab"><span>BLACK FRIDAY EXCLUSIVA DE ALUNOS</span></div>
        <div class="cartoes"><a class="cartao" href="/area/vitrine/oferta/400"><img alt="Comida com assinatura" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></a></div></section>
      <section><div class="fileira-cab"><span>COMUNIDADE NO WHATSAPP</span></div><div><a href="https://chat.whatsapp.com/x"><img alt="grupo" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></a></div></section>
      </body></html>`
  }
  let m = caminho.match(/^\/area\/conteudo\/modulo\/(\d+)$/)
  if (m) {
    const { lateral, produto } = lateralDoModulo(Number(m[1]))
    return `<!doctype html><html><head><title>Chef Enzo Neto</title></head><body>${topo}<main><div class="caminho"><a>Início</a><span>›</span><a>${produto}</a></div><h4>Escolha uma aula</h4></main>${lateral}</body></html>`
  }
  m = caminho.match(/^\/area\/conteudo\/aula\/(\d+)$/)
  if (!m) return ''
  const n = Number(m[1])
  const a = AULAS_DA_ESCOLA[n]
  if (!a) return ''
  const { lateral, produto } = lateralDoModulo(moduloDaAula(n))
  const video = a.video.startsWith('youtube:')
    ? `<iframe id="player" src="https://www.youtube.com/embed/${a.video.slice(8)}?controls=0&rel=0"></iframe>`
    : a.video === 'hls' ? '<iframe id="player" src="https://player.escola-teste.com/embed/7"></iframe>' : ''
  const conteudo = a.video
    ? `<h3>LINK UTENSÍLIOS</h3><h3>MERCADO LIVRE</h3><div class="afiliado"><p><b>Minhas listas de recomendações</b></p><p>Lista de afiliados</p><p>https://www.mercadolivre.com.br/social/enzoneto</p></div>
       <p>Transcrição</p><p>Vamos começar a aula ${a.titulo} e aqui eu quero deixar a primeira regra para você.</p>
       <ul><li><b>Preparação prévia</b></li><li>Porcionar as proteínas antes de grelhar.</li></ul>`
    : `<p>O guia completo da praça pronta, para imprimir.</p><a href="/area/arquivo/anexo?a=01M3ZC&amp;c=texto&amp;n=Guia%20da%20pra%C3%A7a%20pronta%20-%20Ebook%20Virtual.pdf&amp;o=${n}&amp;t=aula&amp;signature=abc" class="article-attach p-3" target="_blank"><span>Guia da praça pronta - Ebook Virtual.pdf</span><span>2.1 MB</span></a>`
  return `<!doctype html><html><head><title>Chef Enzo Neto</title></head><body>${topo}
    <main>${video}<div class="caminho"><a href="/area/vitrine/home">Início</a><span>›</span><a>${produto}</a></div>
      <h4 style="font-size:22px">${a.pagina || a.titulo}</h4>${conteudo}${a.comentarios ? COMENTARIOS_DA_AULA : ''}</main>${lateral}
    ${a.comentarios ? '<div class="menu-topo"><p>Sem notificações</p><ul><li><a href="/area/vitrine/home">Pagina inicial</a></li><li>SUPORTE</li></ul></div>' : ''}</body></html>`
}

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
    // Como a página de verdade (print de 20/11): aba "branas.io", sem <h1>, o curso acima do "0% CONCLUÍDO",
    // os módulos em sanfona e a aula no alto e marcada na lista.
    const BRANAS = `<!doctype html><html><head><title>branas.io</title></head><body>
      <aside><a href="#">‹ Voltar</a><div><div style="font-size:18px;font-weight:700">Clean Code e Clean Architecture - Gravação da Turma 24</div><div>0% CONCLUÍDO</div></div>
        <div><button><span>Aula 2 (19/01/2026 às 19:00)</span><svg width="10" height="10"></svg></button></div>
        <div><button><span>Aula 6 (02/03/2026 às 19:00)</span><svg width="10" height="10"></svg></button>
          <div><div class="item"><i></i>Assistir aula completa</div><div class="item item--active"><i></i>Arquitetura de Microservices</div><div class="item"><i></i>Event-Driven Architecture</div></div></div></aside>
      <main><div style="font-size:26px;font-weight:700">Arquitetura de Microservices</div><div>← ANTERIOR</div><div>PRÓXIMO →</div><div>○ CONCLUÍDO</div>
        <iframe id="player" src="https://player-vz-teste.tv.pandavideo.com.br/embed/1"></iframe></main></body></html>`
    await context.route('https://app.branas.io/**', (route) => route.fulfill({ contentType: 'text/html; charset=utf-8', body: BRANAS }))
    // A sala da LINUXtips (print de 20/11): aba "Sala de Aula | LINUXtips", a aula no título do painel do vídeo e
    // destacada na lista, o módulo com a duração e a contagem ao lado.
    const LINUXTIPS = `<!doctype html><html><head><title>Sala de Aula | LINUXtips</title></head><body>
      <nav><span>Vídeo</span><span>Conteúdo</span><span>Transcrição</span></nav>
      <aside><div>SYSTEM DESIGN T4</div>
        <div><div><span>MODULO 0 - COMECE POR AQUI &amp; AULAS AO VIVO ANTERIORES</span><span>28 MIN</span><span>1/1</span></div></div>
        <div><div><span>MODULO 1 - FUNDAMENTOS E PROTOCOLOS DE REDE</span><span>1H 13MIN</span><span>1/10</span></div><div>Report do módulo</div>
          <ul><li><p>Protocolos de Rede: Introdução a Protocolos</p><p>Assistida · 5 min</p></li>
            <li><p>Protocolos de Rede: IP, IPV4 e IPV6</p><p>8 min</p></li>
            <li><p>Protocolos de Rede: Protocolo TCP e UDP</p><p>7 min</p></li></ul></div></aside>
      <section><header><span>Protocolos de Rede: IP, IPV4 e IPV6</span></header><div style="height:200px">vídeo</div>
        <header><span>Conteúdo da Aula</span></header><h3>PROTOCOLO IP, IPV4 E IPV6</h3><p>O Protocolo de Internet (IP) opera na camada de rede.</p></section></body></html>`
    await context.route('https://mesa.linuxtips.io/**', (route) => route.fulfill({ contentType: 'text/html; charset=utf-8', body: LINUXTIPS }))
    await context.route('https://player-vz-teste.tv.pandavideo.com.br/**', (route) => {
      const u = new URL(route.request().url())
      if (u.pathname === '/embed/1')
        return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>player</title><video></video><script>window.tocar = () => fetch("/v/1/playlist.m3u8?token=abc", { headers: { Authorization: "Bearer segredo" } }).then((r) => r.text()).then(() => fetch("/v/1/seg_001.ts"))</script>' })
      if (u.pathname.endsWith('.m3u8'))
        return route.fulfill({ contentType: 'application/vnd.apple.mpegurl', headers: { 'Access-Control-Allow-Origin': '*' }, body: '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="https://player-vz-teste.tv.pandavideo.com.br/keys/k1"\n#EXTINF:6.0,\nseg_001.ts\n' })
      return route.fulfill({ contentType: 'video/mp2t', body: Buffer.alloc(1000, 1) })
    })
    // A aula da Tech Leads Club (print de 20/11, uma comunidade Circle): o curso na barra de cima ("[Curso] …",
    // o mesmo da URL /c/<curso>), os módulos em cartões com "N aulas", a aula no <h1> e destacada na lista,
    // e o player na própria página (sem iframe).
    const TECHLEADS = `<!doctype html><html><head><title>Tech Leads Club</title></head><body>
      <header><button>☰</button><span>[Curso] Fundamentos do Desenvolvimento de Software Enterprise</span><button>Concluir aula</button></header>
      <aside><div><button>←</button><div>6 de 69 concluídos</div><div>8%</div></div>
        <div class="secao"><div class="cab"><div>Construindo o primeiro MVP de streaming</div><div>3 aulas</div></div>
          <div class="itens"><a class="item" href="/c/fundamentos-do-desenvolvimento-de-software-enterprise/sections/227710/lessons/840643"><span>Setup e upload de video</span><span>Aula</span></a>
            <a class="item item-ativo" aria-current="page" href="/c/fundamentos-do-desenvolvimento-de-software-enterprise/sections/227710/lessons/840644"><span>Banco de dados</span><span>Aula</span></a>
            <a class="item" href="/c/fundamentos-do-desenvolvimento-de-software-enterprise/sections/227710/lessons/840645"><span>Fundamentos do streaming de conteúdo escalável</span><span>Aula</span></a></div></div>
        <div class="secao"><div class="cab"><div>Patterns de Desenvolvimento Enterprise</div><div>3 aulas</div></div>
          <div class="itens"><a class="item" href="/c/fundamentos-do-desenvolvimento-de-software-enterprise/sections/227711/lessons/840650"><span>Domain Driven Design - DDD</span><span>Aula</span></a></div></div></aside>
      <main><video></video><div><span>00:00</span><span>Passo 2 da primeira parte agora a gente vai começar</span><button>Mostrar transcrição</button></div>
        <h1 style="font-size:32px">Banco de dados</h1><p>Neste vídeo vamos fazer o setup do banco de dados utilizando Prisma.</p></main>
      <script>window.tocar = () => fetch("https://stream.video-teste.com/abc.m3u8?token=t1").then((r) => r.text())
        document.querySelector('video').addEventListener('play', () => window.tocar())</script></body></html>`
    await context.route('https://techleads.club/**', (route) => route.fulfill({ contentType: 'text/html; charset=utf-8', body: TECHLEADS }))
    await context.route('https://stream.video-teste.com/**', (route) =>
      route.fulfill({ contentType: 'application/vnd.apple.mpegurl', headers: { 'Access-Control-Allow-Origin': '*' }, body: '#EXTM3U\n#EXTINF:6.0,\nseg_001.ts\n' }),
    )
    // A aula da Full Cycle (print de 20/11): o caminho "Meus Cursos › Curso Full Cycle 4.0 - Upgrade › DevSecOps ›
    // DevSecOps na Prática", a aula num <select> e na lista dos capítulos (sanfonas), o player num iframe.
    const FULLCYCLE = `<!doctype html><html><head><title>Full Cycle</title></head><body>
      <header><a>Meus Cursos</a><a>Livro Full Cycle</a><a>Fórum</a></header>
      <div class="trilha"><a>Meus Cursos</a><i>›</i><a>Curso Full Cycle 4.0 - Upgrade</a><i>›</i><a>DevSecOps</a><i>›</i><span>DevSecOps na Prática</span></div>
      <div class="esq"><select><option selected>Conceitos Básicos</option><option>Introducao</option><option>Workflow</option></select>
        <iframe id="player" src="https://player.video-teste.com/embed/9"></iframe></div>
      <div class="dir"><button>Mostrar Transcrição</button>
        <div class="capitulo"><button aria-expanded="true"><i></i><span>Conceitos Básicos de Pipelines</span></button>
          <div class="aulas"><div class="aula"><i></i><a class="atual">Conceitos Básicos</a><span>15:50</span></div></div></div>
        <div class="capitulo"><button aria-expanded="true"><i></i><span>GitHub Actions na Prática</span></button>
          <div class="aulas"><div class="aula"><i></i><a>Introducao</a><span>09:26</span></div><div class="aula"><i></i><a>Workflow</a><span>05:14</span></div></div></div></div>
      </body></html>`
    await context.route('https://plataforma.fullcycle.com.br/**', (route) => route.fulfill({ contentType: 'text/html; charset=utf-8', body: FULLCYCLE }))
    await context.route('https://player.video-teste.com/**', (route) => {
      const u = new URL(route.request().url())
      if (u.pathname === '/embed/9')
        return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>player</title><video></video><script>window.tocar = () => fetch("/hls/9/master.m3u8?s=x").then((r) => r.text())</script>' })
      return route.fulfill({ contentType: 'application/vnd.apple.mpegurl', body: '#EXTM3U\n#EXTINF:6.0,\nseg_001.ts\n' })
    })
    // A escola do Chef Enzo Neto (Cademí, prints de 22/11): a vitrine com fileiras de cartões (imagens) que levam aos
    // módulos; o módulo paginado (← e → para os vizinhos, "N aulas" e a lista); o módulo em sanfona (o segundo fechado,
    // as aulas só aparecem no clique); a aula com o vídeo (YouTube embutido, ou HLS num player em iframe, ou nenhum),
    // o caminho "Início › …", o título, as listas de afiliados e o texto.
    await context.route('https://aluno.enzoneto.com/**', (route) => {
      const u = new URL(route.request().url())
      // No site, o link do anexo redireciona (302) para upload.cademi.cloud, que responde com
    // Access-Control-Allow-Origin: *; o fetch padrão da página segue e lê (conferido em 22/11 com dois servidores
    // HTTP de verdade). O route do Playwright não segue redirecionamento entre origens num fetch: aqui o PDF vem direto.
    if (u.pathname === '/area/arquivo/anexo') return route.fulfill({ contentType: 'application/pdf', body: PDF })
    const body = paginaDaEscola(u.pathname)
      return body ? route.fulfill({ contentType: 'text/html; charset=utf-8', body }) : route.fulfill({ status: 404, body: 'não' })
    })
    await context.route('https://player.escola-teste.com/**', (route) => {
      const u = new URL(route.request().url())
      if (u.pathname === '/embed/7')
        // Como o SmartPlayer (E23): sem lista mestre; a imagem em duas qualidades e o som, cada um com seu token.
        return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>player</title><video></video><script>document.querySelector("video").addEventListener("play", () => { for (const n of ["v7_0_480p.m3u8?token=a", "v7_0_1080p.m3u8?token=b"]) fetch("/c1/v7/" + n).then((r) => r.text()); setTimeout(() => fetch("/c1/v7/v7_0_en_192k.m3u8?token=c").then((r) => r.text()), 2500) })</script>' })
      return route.fulfill({ contentType: 'application/vnd.apple.mpegurl', body: '#EXTM3U\n#EXTINF:6.0,\nseg_001.ts\n' })
    })
    // Um site qualquer com um player HLS: o player.js roda lá, mas não conta nada (não é aula de curso).
    await context.route('https://videos.exemplo.com/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Vídeos</title><iframe id="player" src="https://player.video-teste.com/embed/9"></iframe>' }),
    )
    await context.route('https://noticias.exemplo.com/**', (route) => route.fulfill({ contentType: 'text/html', body: ARTIGO }))
    let [servico] = context.serviceWorkers()
    if (!servico) servico = await context.waitForEvent('serviceworker')
    await servico.evaluate((e) => chrome.storage.local.set({ enderecos: { acervo: e, flashcards: e, biblioteca: e, trilha: e, cortes: e } }), apps.endereco)
    context.servico = servico
    await usar(context)
    await context.close()
  },
  extensao: async ({ context }, usar) => {
    await usar(new URL(context.servico.url()).host)
  },
})

export { expect } from '@playwright/test'
