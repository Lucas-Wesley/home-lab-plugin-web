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

  await botao(page).click()
  await expect(page.locator('homelab-envio .texto')).toContainText('Coletando')
  // O player (iframe de outro site) pede o manifesto e um pedaço, como ao dar play.
  await page.frameLocator('#player').locator('video').waitFor({ state: 'attached' })
  await page.frames().find((f) => f.url().includes('player.exemplo.com')).evaluate(() => window.tocar())
  await expect(page.locator('homelab-envio .texto')).toContainText('2 de vídeo', { timeout: 8000 })

  const [download] = await Promise.all([page.waitForEvent('download'), botao(page).click()])
  expect(download.suggestedFilename()).toMatch(/^homelab-coleta-branas-\d{4}-\d{2}-\d{2}-\d{4}\.json$/)
  await expect(page.locator('homelab-envio .texto')).toHaveText('Coleta salva em Downloads: HLS com AES-128')

  const relatorio = JSON.parse(await (await import('node:fs/promises')).readFile(await download.path(), 'utf8'))
  expect(relatorio.curso).toBe('branas')
  expect(relatorio.resumo.veredito).toBe('aes128')
  expect(relatorio.quadros.some((q) => q.tipo === 'iframe' && q.url.includes('player.exemplo.com'))).toBe(true)
  const manifesto = relatorio.pedidos.find((p) => p.tipo === 'manifesto-hls')
  expect(manifesto.corpo).toContain('#EXT-X-KEY:METHOD=AES-128')
  expect(manifesto.cabecalhosPedido.Authorization).toBe('[omitido]')
  expect(relatorio.videos.length).toBe(1)
})
