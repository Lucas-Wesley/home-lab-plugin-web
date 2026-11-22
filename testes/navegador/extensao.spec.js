import { expect, test } from './ambiente.js'

const botao = (page) => page.locator('homelab-envio button')
// A aba aberta por último (sem a permissão "tabs", o serviço não vê o endereço das abas).
const ultimaAba = (context) =>
  context.servico.evaluate(async () => (await chrome.tabs.query({})).reduce((a, b) => (b.id > a.id ? b : a)))

test('no vídeo do YouTube, o botão manda o link à Entrada da Trilha, no automático (E13)', async ({ page, apps }) => {
  await page.goto('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1&t=42s')
  await expect(botao(page)).toBeVisible()
  await expect(botao(page)).toHaveAttribute('aria-label', 'Mandar à Trilha')

  await botao(page).click()
  await expect(page.locator('homelab-envio .texto')).toHaveText('Na Entrada: a IA divide e sugere as trilhas')
  await expect(page.locator('homelab-envio a')).toHaveAttribute('href', `${apps.endereco}/#/entrada/5`)
  const pedido = apps.recebidos.find((r) => r.caminho === '/api/entrada')
  expect(pedido.corpo).toEqual({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', automatico: true })

  // De novo: a Trilha devolve o que já tem.
  await botao(page).click()
  await expect(page.locator('homelab-envio .texto')).toHaveText('Já está na Entrada da Trilha')
})

test('o YouTube troca de página sem recarregar: o botão aparece e some com o vídeo', async ({ page }) => {
  await page.goto('https://www.youtube.com/')
  await page.waitForTimeout(1500)
  await expect(page.locator('homelab-envio')).toHaveCount(0)

  await page.evaluate(() => history.pushState({}, '', '/watch?v=aaaaaaaaaaa'))
  await expect(botao(page)).toBeVisible({ timeout: 3000 })
  await page.evaluate(() => history.pushState({}, '', '/results?search_query=laranja'))
  await expect(page.locator('homelab-envio')).toHaveCount(0, { timeout: 3000 })
})

test('numa página com frases de exemplo, o botão manda ao Flashcards, no baralho escolhido', async ({ page, apps, extensao }) => {
  // O baralho é escolhido uma vez, no popup; o padrão é o Inglês.
  await page.goto(`chrome-extension://${extensao}/popup.html`)
  await page.getByText('Ajustes').click()
  await expect(page.getByLabel('Baralho dos flashcards').locator('option:checked')).toHaveText('Inglês')
  await page.getByLabel('Baralho dos flashcards').selectOption({ label: 'Bandeiras' })
  await page.getByLabel('Tipo dos cartões').selectOption('invertido')

  // A página inicial não tem frases de exemplo: sem botão.
  await page.goto('https://blog.exemplo.com/')
  await page.waitForTimeout(1500)
  await expect(page.locator('homelab-envio')).toHaveCount(0)

  await page.goto('https://blog.exemplo.com/shoot-up-o-que-significa/?utm_source=x')
  await expect(botao(page)).toHaveAttribute('aria-label', 'Fazer flashcards')
  await botao(page).click()
  await expect(page.locator('homelab-envio .texto')).toHaveText('A IA está montando os exemplos')
  await expect(page.locator('homelab-envio a')).toHaveAttribute('href', `${apps.endereco}/#/geracao/7`)
  const pedido = apps.recebidos.find((r) => r.caminho === '/api/links')
  expect(pedido.corpo).toEqual({ url: 'https://blog.exemplo.com/shoot-up-o-que-significa/', baralho_id: 'b2', tipo: 'invertido' })
})

test('sem baralho escolhido, os flashcards vão para o Inglês', async ({ page, apps }) => {
  await page.goto('https://blog.exemplo.com/shoot-up-o-que-significa/')
  await botao(page).click()
  await expect(page.locator('homelab-envio .texto')).toHaveText('A IA está montando os exemplos')
  expect(apps.recebidos.find((r) => r.caminho === '/api/links').corpo).toEqual({
    url: 'https://blog.exemplo.com/shoot-up-o-que-significa/',
    baralho_id: 'b1',
    tipo: 'basico',
  })
})

test('qualquer página vai ao Flashcards pelo popup, mesmo sem botão na página', async ({ page, context, apps, extensao }) => {
  await page.goto('https://noticias.exemplo.com/break-the-ice?utm_medium=x')
  await page.waitForTimeout(1500)
  await expect(page.locator('homelab-envio')).toHaveCount(0)

  const aba = await ultimaAba(context)
  const popup = await context.newPage()
  await popup.goto(`chrome-extension://${extensao}/popup.html?aba=${aba.id}`)
  await expect(popup.locator('#aqui-titulo')).toHaveText('Break the ice')
  await popup.getByRole('button', { name: 'Fazer flashcards' }).click()

  await expect(page.locator('homelab-envio .texto')).toHaveText('A IA está montando os exemplos')
  expect(apps.recebidos.find((r) => r.caminho === '/api/links').corpo.url).toBe('https://noticias.exemplo.com/break-the-ice')
})

test('qualquer página vai ao Acervo pelo popup, como artigo (E10)', async ({ page, context, apps, extensao }) => {
  await page.goto('https://noticias.exemplo.com/break-the-ice?utm_medium=x')
  const aba = await ultimaAba(context)
  const popup = await context.newPage()
  await popup.goto(`chrome-extension://${extensao}/popup.html?aba=${aba.id}`)
  await expect(popup.locator('#acoes button')).toHaveText(['Mandar ao Acervo', 'Fazer flashcards'])
  await popup.getByRole('button', { name: 'Mandar ao Acervo' }).click()

  await expect(page.locator('homelab-envio .texto')).toHaveText('Na fila do Acervo')
  expect(apps.recebidos.find((r) => r.caminho === '/api/referencias').corpo).toEqual({ url: 'https://noticias.exemplo.com/break-the-ice' })
  await expect(popup.locator('#historico li').first()).toContainText('Acervo')
})

test('o popup mostra o histórico, inclusive o que falhou', async ({ page, context, extensao }) => {
  await page.goto('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  await botao(page).click()
  await expect(page.locator('homelab-envio .texto')).toHaveText('Na Entrada: a IA divide e sugere as trilhas')

  // O Flashcards fora do ar: o erro aparece no botão e no histórico.
  await context.servico.evaluate(async () => {
    const { enderecos } = await chrome.storage.local.get('enderecos')
    await chrome.storage.local.set({ enderecos: { ...enderecos, flashcards: 'http://localhost:9' } })
  })
  await page.goto('https://blog.exemplo.com/shoot-up-o-que-significa/')
  await botao(page).click()
  await expect(page.locator('homelab-envio .texto')).toHaveText('Sem conexão com o Flashcards: só funciona na rede de casa.')

  await page.goto(`chrome-extension://${extensao}/popup.html`)
  const linhas = page.locator('#historico li')
  await expect(linhas).toHaveCount(2)
  await expect(linhas.nth(0)).toContainText('Shoot Up')
  await expect(linhas.nth(0)).toContainText('Flashcards')
  await expect(linhas.nth(0).locator('.estado')).toHaveText('erro')
  await expect(linhas.nth(1)).toContainText('Origem da laranja')
  await expect(linhas.nth(1).locator('.estado')).toHaveText('enviado')
  await expect(page.locator('#erro-baralhos')).toContainText('Sem conexão com o Flashcards')

  await page.getByText('Ajustes').click()
  await page.getByRole('button', { name: 'Limpar o histórico' }).click()
  await expect(linhas).toHaveCount(0)
  await expect(page.getByText('Nada enviado ainda.')).toBeVisible()
})

test('o nome aparece ao abrir o vídeo e o popup também envia', async ({ page, context, apps, extensao }) => {
  await page.goto('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  // Nos primeiros segundos o nome fica à vista, sem passar o mouse; depois, só o ícone.
  const texto = page.locator('homelab-envio .texto')
  await expect.poll(() => texto.evaluate((e) => e.getBoundingClientRect().width)).toBeGreaterThan(40)
  await expect.poll(() => texto.evaluate((e) => e.getBoundingClientRect().width), { timeout: 8000 }).toBe(0)

  const aba = await ultimaAba(context)
  const popup = await context.newPage()
  await popup.goto(`chrome-extension://${extensao}/popup.html?aba=${aba.id}`)
  await expect(popup.getByText('Nesta página')).toBeVisible()
  await expect(popup.locator('#aqui-titulo')).toHaveText('Origem da laranja')
  // No vídeo, a Trilha primeiro e o Acervo como segunda opção.
  await expect(popup.locator('#acoes button')).toHaveText(['Mandar à Trilha', 'Mandar ao Acervo'])
  await popup.getByRole('button', { name: 'Mandar ao Acervo' }).click()

  await expect(texto).toHaveText('Na fila do Acervo')
  expect(apps.recebidos.filter((r) => r.caminho === '/api/referencias')).toHaveLength(1)
  await expect(popup.locator('#historico li')).toHaveCount(1)
  await expect(popup.locator('#aqui')).toBeHidden()
})

test('no YouTube fora de um vídeo, o popup não oferece envio', async ({ context, extensao }) => {
  const pagina = await context.newPage()
  await pagina.goto('https://www.youtube.com/')
  const aba = await ultimaAba(context)
  const popup = await context.newPage()
  await popup.goto(`chrome-extension://${extensao}/popup.html?aba=${aba.id}`)
  await expect(popup.getByText('Nada enviado ainda.')).toBeVisible()
  await expect(popup.locator('#aqui')).toBeHidden()
})

test('num PDF, o botão manda o arquivo à Biblioteca (E12)', async ({ page, context, apps, extensao }) => {
  await page.goto('https://docs.exemplo.com/livros/The%20Bell%20of%20Atri.pdf?utm_source=x')
  await expect(botao(page)).toHaveAttribute('aria-label', 'Mandar à Biblioteca')
  await botao(page).click()
  await expect(page.locator('homelab-envio .texto')).toHaveText('Na Biblioteca')
  await expect(page.locator('homelab-envio a')).toHaveAttribute('href', `${apps.endereco}/#/livro/livro1`)

  const pedido = apps.recebidos.find((r) => r.caminho === '/api/books')
  expect(pedido.tipo).toMatch(/^multipart\/form-data/)
  expect(pedido.corpo).toContain('filename="The Bell of Atri.pdf"')
  expect(pedido.corpo).toContain('%PDF-1.4\n% livro de teste')
  expect(pedido.corpo).toMatch(/name="title"\r\n\r\nThe Bell of Atri\r\n/)

  // O popup só oferece a Biblioteca; de novo, ela já tem o livro.
  const aba = await ultimaAba(context)
  const popup = await context.newPage()
  await popup.goto(`chrome-extension://${extensao}/popup.html?aba=${aba.id}`)
  await expect(popup.locator('#acoes button')).toHaveText(['Mandar à Biblioteca'])
  await popup.getByRole('button', { name: 'Mandar à Biblioteca' }).click()
  await expect(page.locator('homelab-envio .texto')).toHaveText('Já está na Biblioteca')
  await expect(popup.locator('#historico li').first()).toContainText('Biblioteca')
})

test('um PDF que pede login não vai à Biblioteca', async ({ page, apps }) => {
  await page.goto('https://docs.exemplo.com/privado.pdf')
  await botao(page).click()
  await expect(page.locator('homelab-envio .texto')).toHaveText('O endereço não devolveu um PDF (talvez peça login).')
  expect(apps.recebidos.filter((r) => r.caminho === '/api/books')).toHaveLength(0)
})

test('um PDF grande vai em partes e chega inteiro', async ({ page, apps }) => {
  await page.goto('https://docs.exemplo.com/grande.pdf')
  await botao(page).click()
  await expect(page.locator('homelab-envio .texto')).toHaveText('Na Biblioteca', { timeout: 15000 })
  const { corpo } = apps.recebidos.find((r) => r.caminho === '/api/books')
  // Os bytes não-ASCII (0xE9) chegam como bytes, não como texto: o corpo tem o PDF + 9 MiB.
  expect(corpo.split('é').length - 1).toBe(9 << 20)
})

test('na aula de um curso, o botão coleta o tráfego do player e salva o relatório (E14)', async ({ page }) => {
  await page.goto('https://app.branas.io/users/u/products/p/contents/c')
  await expect(botao(page)).toHaveAttribute('aria-label', 'Analisar vídeo')

  // Ligar a coleta recarrega a página (sem cache); depois do recarregar, o botão continua coletando.
  await Promise.all([page.waitForEvent('load'), botao(page).click()])
  await expect(page.locator('homelab-envio .texto')).toContainText('Coletando', { timeout: 5000 })
  // O player (iframe de outro site) pede o manifesto e um pedaço, como ao dar play.
  await page.frameLocator('#player').locator('video').waitFor({ state: 'attached' })
  await page.frames().find((f) => f.url().includes('player-vz-teste.tv.pandavideo.com.br')).evaluate(() => window.tocar())
  await expect(page.locator('homelab-envio .texto')).toContainText('2 de vídeo', { timeout: 8000 })

  const [download] = await Promise.all([page.waitForEvent('download'), botao(page).click()])
  expect(download.suggestedFilename()).toMatch(/^homelab-coleta-branas-\d{4}-\d{2}-\d{2}-\d{4}\.json$/)
  await expect(page.locator('homelab-envio .texto')).toHaveText('Coleta salva em Downloads: HLS com AES-128')

  const relatorio = JSON.parse(await (await import('node:fs/promises')).readFile(await download.path(), 'utf8'))
  expect(relatorio.curso).toBe('branas')
  expect(relatorio.resumo.veredito).toBe('aes128')
  expect(relatorio.quadros.some((q) => q.tipo === 'iframe' && q.url.includes('player-vz-teste.tv.pandavideo.com.br'))).toBe(true)
  const manifesto = relatorio.pedidos.find((p) => p.tipo === 'manifesto-hls')
  expect(manifesto.corpo).toContain('#EXT-X-KEY:METHOD=AES-128')
  expect(manifesto.cabecalhosPedido.Authorization).toBe('[omitido]')
  expect(relatorio.videos.length).toBe(1)
  expect(relatorio.pedidos.some((p) => p.recurso === 'Document' && p.url.startsWith('https://app.branas.io/'))).toBe(true)
})

test('na aula de um curso, o popup lê o nome da aula e do módulo e manda baixar na Trilha (E15)', async ({ page, context, apps, extensao }) => {
  await page.goto('https://app.branas.io/users/u/products/p1/contents/c6')
  await expect(botao(page)).toBeVisible()
  // O player pede o manifesto (como ao dar play); o player.js conta ao serviço.
  await page.frameLocator('#player').locator('video').waitFor({ state: 'attached' })
  await page.frames().find((f) => f.url().includes('pandavideo')).evaluate(() => window.tocar())

  const aba = await ultimaAba(context)
  const popup = await context.newPage()
  await popup.goto(`chrome-extension://${extensao}/popup.html?aba=${aba.id}`)
  await expect(popup.locator('#aula')).toBeVisible()
  await expect(popup.locator('#aula-plataforma')).toHaveText('Branas.io')
  await expect(popup.locator('#aula-titulo')).toHaveValue('Arquitetura de Microservices')
  await expect(popup.locator('#aula-modulo')).toHaveValue('Aula 6 (02/03/2026 às 19:00)')
  await expect(popup.locator('#aula-info')).toHaveText('720p (a maior) · 2 h 01 min · cerca de 400 MB · 50 GB livres')
  const estimar = apps.recebidos.find((r) => r.caminho === '/api/cursos/estimar')
  expect(estimar.corpo.manifesto).toBe('https://player-vz-teste.tv.pandavideo.com.br/v/1/playlist.m3u8?token=abc')
  expect(estimar.corpo.referer).toBe('https://player-vz-teste.tv.pandavideo.com.br/')

  // O curso vem da página; sem nome, não manda; o nome corrigido fica lembrado para as próximas aulas.
  await expect(popup.locator('#aula-curso')).toHaveValue('Clean Code e Clean Architecture - Gravação da Turma 24')
  await popup.locator('#aula-curso').fill('')
  await popup.getByRole('button', { name: 'Baixar esta aula' }).click()
  await expect(popup.locator('#aula-info')).toHaveText('Escreva o nome do curso e o da aula.')
  await popup.locator('#aula-curso').fill('Clean Code e Arquitetura')
  await popup.getByRole('button', { name: 'Baixar esta aula' }).click()
  await expect(popup.locator('#aula-resultado')).toContainText('Na fila de downloads da Trilha')
  await expect(popup.locator('#aula-resultado a')).toHaveAttribute('href', `${apps.endereco}/#/entrada/cursos`)
  const pedido = apps.recebidos.find((r) => r.caminho === '/api/cursos/aulas')
  expect(pedido.corpo).toEqual({
    plataforma: 'branas',
    curso: 'Clean Code e Arquitetura',
    modulo: 'Aula 6 (02/03/2026 às 19:00)',
    titulo: 'Arquitetura de Microservices',
    pagina: 'https://app.branas.io/users/u/products/p1/contents/c6',
    manifesto: 'https://player-vz-teste.tv.pandavideo.com.br/v/1/playlist.m3u8?token=abc',
    referer: 'https://player-vz-teste.tv.pandavideo.com.br/',
  })
  await popup.reload()
  await expect(popup.locator('#aula-curso')).toHaveValue('Clean Code e Arquitetura')
  await expect(popup.locator('#historico li').first()).toContainText('Arquitetura de Microservices')
})

test('na sala da LINUXtips, o popup lê o curso, o módulo e a aula (E15)', async ({ page, context, extensao }) => {
  await page.goto('https://mesa.linuxtips.io/treinamentos/system-design-turma4/9a4a64b6')
  await expect(botao(page)).toBeVisible()
  const aba = await ultimaAba(context)
  const popup = await context.newPage()
  await popup.goto(`chrome-extension://${extensao}/popup.html?aba=${aba.id}`)
  await expect(popup.locator('#aula-plataforma')).toHaveText('LINUXtips')
  await expect(popup.locator('#aula-titulo')).toHaveValue('Protocolos de Rede: IP, IPV4 e IPV6')
  await expect(popup.locator('#aula-modulo')).toHaveValue('MODULO 1 - FUNDAMENTOS E PROTOCOLOS DE REDE')
  await expect(popup.locator('#aula-curso')).toHaveValue('System Design Turma4')
})

test('na Tech Leads Club, o player da própria página conta e o popup lê o curso, o módulo e a aula (E17)', async ({ page, context, apps, extensao }) => {
  await page.goto('https://techleads.club/c/fundamentos-do-desenvolvimento-de-software-enterprise/sections/227710/lessons/840644')
  await expect(botao(page)).toBeVisible()
  await page.evaluate(() => window.tocar())
  const aba = await ultimaAba(context)
  const popup = await context.newPage()
  await popup.goto(`chrome-extension://${extensao}/popup.html?aba=${aba.id}`)
  await expect(popup.locator('#aula-plataforma')).toHaveText('Tech Leads Club')
  await expect(popup.locator('#aula-titulo')).toHaveValue('Banco de dados')
  await expect(popup.locator('#aula-modulo')).toHaveValue('Construindo o primeiro MVP de streaming')
  await expect(popup.locator('#aula-curso')).toHaveValue('Fundamentos do Desenvolvimento de Software Enterprise')
  await expect(popup.getByRole('button', { name: 'Baixar esta aula' })).toBeEnabled()
  const estimar = apps.recebidos.find((r) => r.caminho === '/api/cursos/estimar')
  expect(estimar.corpo.manifesto).toBe('https://stream.video-teste.com/abc.m3u8?token=t1')
  expect(estimar.corpo.referer).toBe('https://techleads.club/')
})

test('na Tech Leads Club, o popup acha as aulas da lista e baixa o curso inteiro, uma aula por vez (E19)', async ({ page, context, apps, extensao }) => {
  test.setTimeout(90000)
  await page.goto('https://techleads.club/c/fundamentos-do-desenvolvimento-de-software-enterprise/sections/227710/lessons/840644')
  await expect(botao(page)).toBeVisible()
  const aba = await ultimaAba(context)
  const popup = await context.newPage()
  await popup.goto(`chrome-extension://${extensao}/popup.html?aba=${aba.id}`)
  await expect(popup.locator('#lote-info')).toContainText('Achei 4 aulas em 2 seções')
  await popup.getByRole('button', { name: 'Baixar o curso inteiro' }).click()
  await expect(popup.locator('#lote-info')).toContainText('4 de 4 · 4 na Trilha', { timeout: 80000 })
  const pedidos = apps.recebidos.filter((r) => r.caminho === '/api/cursos/aulas')
  expect(pedidos.map((p) => p.corpo.titulo)).toEqual(['Setup e upload de video', 'Banco de dados', 'Fundamentos do streaming de conteúdo escalável', 'Domain Driven Design - DDD'])
  expect(pedidos.map((p) => p.corpo.modulo)).toEqual(['Construindo o primeiro MVP de streaming', 'Construindo o primeiro MVP de streaming', 'Construindo o primeiro MVP de streaming', 'Patterns de Desenvolvimento Enterprise'])
  expect(pedidos[3].corpo.pagina).toBe('https://techleads.club/c/fundamentos-do-desenvolvimento-de-software-enterprise/sections/227711/lessons/840650')
  expect(pedidos[0].corpo.curso).toBe('Fundamentos do Desenvolvimento de Software Enterprise')
})

test('na Full Cycle, o player de outro site conta e o popup lê o curso, o módulo e a aula (E17)', async ({ page, context, apps, extensao }) => {
  await page.goto('https://plataforma.fullcycle.com.br/courses/3b8c4f2c/370/catalog/214/lessons/1')
  await expect(botao(page)).toBeVisible()
  await page.frameLocator('#player').locator('video').waitFor({ state: 'attached' })
  await page.frames().find((f) => f.url().includes('player.video-teste.com')).evaluate(() => window.tocar())
  const aba = await ultimaAba(context)
  const popup = await context.newPage()
  await popup.goto(`chrome-extension://${extensao}/popup.html?aba=${aba.id}`)
  await expect(popup.locator('#aula-plataforma')).toHaveText('Full Cycle')
  await expect(popup.locator('#aula-titulo')).toHaveValue('Conceitos Básicos')
  await expect(popup.locator('#aula-modulo')).toHaveValue('Conceitos Básicos de Pipelines')
  await expect(popup.locator('#aula-curso')).toHaveValue('DevSecOps na Prática')
  await expect(popup.getByRole('button', { name: 'Baixar esta aula' })).toBeEnabled()
  const estimar = apps.recebidos.find((r) => r.caminho === '/api/cursos/estimar')
  expect(estimar.corpo.manifesto).toBe('https://player.video-teste.com/hls/9/master.m3u8?s=x')
  expect(estimar.corpo.referer).toBe('https://player.video-teste.com/')
})

test('num site que não é curso, o player.js não conta o vídeo (E17)', async ({ page, context, extensao }) => {
  const servico = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'))
  await page.goto('https://videos.exemplo.com/')
  await page.frameLocator('#player').locator('video').waitFor({ state: 'attached' })
  await page.frames().find((f) => f.url().includes('player.video-teste.com')).evaluate(() => window.tocar())
  await page.waitForTimeout(300)
  const guardados = await servico.evaluate(() => chrome.storage.session.get(null))
  expect(Object.keys(guardados).filter((k) => k.startsWith('manifestos:'))).toEqual([])
})

test('na aula sem play, o popup pede para dar play (E15)', async ({ page, context, extensao }) => {
  await page.goto('https://app.branas.io/users/u/products/p1/contents/c6')
  await expect(botao(page)).toBeVisible()
  const aba = await ultimaAba(context)
  const popup = await context.newPage()
  await popup.goto(`chrome-extension://${extensao}/popup.html?aba=${aba.id}`)
  await expect(popup.locator('#aula-info')).toHaveText('Ainda não achei o vídeo: dê play na aula e procure de novo.')
  await expect(popup.getByRole('button', { name: 'Baixar esta aula' })).toBeDisabled()
})

test('no Chef Enzo Neto, o popup mapeia a escola pela vitrine e manda cada aula, com o texto, para a trilha do curso (E20)', async ({ page, context, apps, extensao }) => {
  test.setTimeout(150000)
  await page.goto('https://aluno.enzoneto.com/area/vitrine/home')
  await expect(botao(page)).toBeVisible()
  const aba = await ultimaAba(context)
  const popup = await context.newPage()
  await popup.goto(`chrome-extension://${extensao}/popup.html?aba=${aba.id}`)
  await expect(popup.locator('#escola-nome')).toHaveText('Chef Enzo Neto')
  await expect(popup.locator('#aula')).toBeHidden()
  await popup.getByRole('button', { name: 'Mapear a escola' }).click()
  await expect(popup.locator('#escola-info')).toContainText('Achei 3 cursos e 8 aulas', { timeout: 60000 })
  await expect(popup.locator('#escola-cursos li')).toHaveText([
    'Cozinha de panela só - Comece por aqui · 3 módulos · 4 aulas',
    'Curso 2 · 1 módulo · 1 aula',
    'As praças da cozinha prática · 2 módulos · 3 aulas',
  ])
  const { lote } = await context.servico.evaluate(() => chrome.storage.local.get('lote'))
  const modulos = (c) => lote.mapa.cursos[c].modulos.map((m) => [m.nome, m.aulas.map((a) => a.titulo)])
  // As caixas "← / →" (que levam à primeira aula do módulo vizinho) não viram aula.
  expect(modulos(0)).toEqual([
    ['O caminho da praticidade', ['Bases prontas agilizam']],
    ['Organização da família e da rotina', ['Obrigatório em toda casa', '1 - 2 pessoas em casa']],
    ['Praça pronta - Habilidades básicas', ['Guia da praça pronta - PDF']],
  ])
  expect(modulos(1)).toEqual([['Instruções', ['Como usar o Enzap']]])
  expect(modulos(2)).toEqual([
    ['Praça pronta - Bases e temperos', ['Bases pronta = economia de tempo', 'Tablete de cebola']],
    ['Praça pronta - Molho tomate', ['Molho de tomate base']],
  ])
  // Nada foi para a Trilha ainda: o mapa só lê.
  expect(apps.recebidos.filter((r) => r.caminho === '/api/cursos/aulas')).toHaveLength(0)

  await popup.locator('#escola-cursos li', { hasText: 'Curso 2' }).getByRole('checkbox').uncheck()
  await popup.getByRole('button', { name: 'Baixar as aulas marcadas' }).click()
  await expect(popup.locator('#escola-info')).toContainText('7 de 7 · 6 vídeos na Trilha · 1 só texto · 1 PDF', { timeout: 120000 })
  await expect(popup.locator('#escola-link')).toHaveAttribute('href', `${apps.endereco}/#/trilhas/grupo/Chef%20Enzo%20Neto`)
  const pedidos = apps.recebidos.filter((r) => r.caminho === '/api/cursos/aulas').map((r) => r.corpo)
  expect(pedidos.map((p) => [p.curso, p.ordem, p.titulo])).toEqual([
    ['Cozinha de panela só - Comece por aqui', 1, 'Bases prontas agilizam'],
    ['Cozinha de panela só - Comece por aqui', 2, 'Obrigatório em toda casa'],
    ['Cozinha de panela só - Comece por aqui', 3, '1 - 2 pessoas em casa'],
    ['Cozinha de panela só - Comece por aqui', 4, 'Guia da praça pronta - PDF'],
    ['As praças da cozinha prática', 1, 'Bases pronta = economia de tempo'],
    ['As praças da cozinha prática', 2, 'Tablete de cebola'],
    ['As praças da cozinha prática', 3, 'Molho de tomate base'],
  ])
  expect(pedidos.every((p) => p.plataforma === 'enzoneto' && p.trilha === true)).toBe(true)
  // O YouTube embutido vai como embed, com a escola como Referer; o player em iframe, pelo HLS.
  expect(pedidos[1].embed).toBe('https://www.youtube.com/embed/AAAAAAAAAA1?controls=0&rel=0')
  expect(pedidos[1].referer).toBe('https://aluno.enzoneto.com/')
  expect(pedidos[1].manifesto).toBeUndefined()
  // O SmartPlayer: a imagem de maior qualidade e o som (que chega depois) vão juntos (E23).
  expect(pedidos[6].manifesto).toBe('https://player.escola-teste.com/c1/v7/v7_0_1080p.m3u8?token=b')
  expect(pedidos[6].audio).toBe('https://player.escola-teste.com/c1/v7/v7_0_en_192k.m3u8?token=c')
  expect(pedidos[6].referer).toBe('https://player.escola-teste.com/')
  expect(pedidos[4].modulo).toBe('Praça pronta - Bases e temperos')
  // O texto da página, sem as listas de afiliados; a aula sem vídeo leva só o texto e o PDF.
  expect(pedidos[1].texto).toContain('Vamos começar a aula Obrigatório em toda casa')
  expect(pedidos[1].texto).toContain('- Porcionar as proteínas antes de grelhar.')
  expect(pedidos[1].texto).not.toMatch(/afiliados|MERCADO LIVRE|LINK UTENS|mercadolivre|PRATICIDADE|HABILIDADES/i)
  expect(pedidos[1].texto).not.toContain('1 - 2 pessoas em casa')
  expect(pedidos[3].embed).toBeUndefined()
  expect(pedidos[3].manifesto).toBeUndefined()
  expect(pedidos[3].texto).toContain('O guia completo da praça pronta')
  // O PDF vai inteiro para a Trilha (E22); no texto, só o nome.
  expect(pedidos[3].texto).toContain('- Guia da praça pronta - Ebook Virtual.pdf')
  expect(pedidos[3].texto).not.toContain('signature')
  const anexos = apps.recebidos.filter((r) => r.caminho === '/api/cursos/aulas/9/anexos')
  expect(anexos).toHaveLength(1)
  expect(anexos[0].tipo).toContain('multipart/form-data')
  expect(anexos[0].corpo).toContain('%PDF-1.4')
  expect(anexos[0].corpo).toContain('Guia da pra') // o nome vai no formulário
  expect(pedidos.some((p) => 'anexos' in p)).toBe(false) // a lista não vai no corpo da aula
})

test('no Chef Enzo Neto, a aula aberta vai com o vídeo embutido, o texto e a trilha do curso (E20)', async ({ page, context, apps, extensao }) => {
  await page.goto('https://aluno.enzoneto.com/area/conteudo/aula/1')
  await expect(botao(page)).toBeVisible()
  await page.frameLocator('#player').locator('h1').waitFor()
  const aba = await ultimaAba(context)
  const popup = await context.newPage()
  await popup.goto(`chrome-extension://${extensao}/popup.html?aba=${aba.id}`)
  await expect(popup.locator('#escola')).toBeVisible()
  await expect(popup.locator('#aula-titulo')).toHaveValue('Obrigatório em toda casa')
  await expect(popup.locator('#aula-modulo')).toHaveValue('Organização da família e da rotina')
  await expect(popup.locator('#aula-curso')).toHaveValue('CDPS - Comece por aqui')
  await popup.getByRole('button', { name: 'Baixar esta aula' }).click()
  await expect(popup.locator('#aula-resultado')).toContainText('Na fila de downloads da Trilha')
  const estimar = apps.recebidos.find((r) => r.caminho === '/api/cursos/estimar')
  expect(estimar.corpo.embed).toBe('https://www.youtube.com/embed/AAAAAAAAAA1?controls=0&rel=0')
  const pedido = apps.recebidos.find((r) => r.caminho === '/api/cursos/aulas').corpo
  expect(pedido).toMatchObject({ plataforma: 'enzoneto', curso: 'CDPS - Comece por aqui', trilha: true, embed: 'https://www.youtube.com/embed/AAAAAAAAAA1?controls=0&rel=0' })
  expect(pedido.texto).toContain('Vamos começar a aula')
})
