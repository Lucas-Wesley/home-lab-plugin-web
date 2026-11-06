import { expect, test } from './ambiente.js'

const botao = (page) => page.locator('homelab-envio button')
// A aba aberta por último (sem a permissão "tabs", o serviço não vê o endereço das abas).
const ultimaAba = (context) =>
  context.servico.evaluate(async () => (await chrome.tabs.query({})).reduce((a, b) => (b.id > a.id ? b : a)))

test('no vídeo do YouTube, o botão manda o link ao Acervo', async ({ page, apps }) => {
  await page.goto('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1&t=42s')
  await expect(botao(page)).toBeVisible()
  await expect(botao(page)).toHaveAttribute('aria-label', 'Mandar ao Acervo')

  await botao(page).click()
  await expect(page.locator('homelab-envio .texto')).toHaveText('Na fila do Acervo')
  await expect(page.locator('homelab-envio a')).toHaveAttribute('href', `${apps.endereco}/#/referencia/r1`)
  const pedido = apps.recebidos.find((r) => r.caminho === '/api/referencias')
  expect(pedido.corpo).toEqual({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' })

  // De novo: o Acervo diz que já tem.
  await botao(page).click()
  await expect(page.locator('homelab-envio .texto')).toHaveText('Já está no Acervo')
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

test('no Mairo Vergara, o botão manda a página ao Flashcards, no baralho escolhido', async ({ page, apps, extensao }) => {
  // O baralho é escolhido uma vez, no popup.
  await page.goto(`chrome-extension://${extensao}/popup.html`)
  await page.getByText('Ajustes').click()
  await page.getByLabel('Baralho dos links do Mairo Vergara').selectOption({ label: 'Inglês' })
  await page.getByLabel('Tipo dos cartões').selectOption('invertido')

  // A página inicial não tem frases de exemplo: sem botão.
  await page.goto('https://www.mairovergara.com/')
  await page.waitForTimeout(1500)
  await expect(page.locator('homelab-envio')).toHaveCount(0)

  await page.goto('https://www.mairovergara.com/shoot-up-o-que-significa/?utm_source=x')
  await expect(botao(page)).toHaveAttribute('aria-label', 'Fazer flashcards')
  await botao(page).click()
  await expect(page.locator('homelab-envio .texto')).toHaveText('A IA está escolhendo os exemplos')
  await expect(page.locator('homelab-envio a')).toHaveAttribute('href', `${apps.endereco}/#/geracao/7`)
  const pedido = apps.recebidos.find((r) => r.caminho === '/api/links')
  expect(pedido.corpo).toEqual({ url: 'https://www.mairovergara.com/shoot-up-o-que-significa/', baralho_id: 'b1', tipo: 'invertido' })
})

test('o popup mostra o histórico, inclusive o que falhou', async ({ page, context, extensao }) => {
  await page.goto('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  await botao(page).click()
  await expect(page.locator('homelab-envio .texto')).toHaveText('Na fila do Acervo')

  // O Flashcards fora do ar: o erro aparece no botão e no histórico.
  await context.servico.evaluate(async () => {
    const { enderecos } = await chrome.storage.local.get('enderecos')
    await chrome.storage.local.set({ enderecos: { ...enderecos, flashcards: 'http://localhost:9' } })
  })
  await page.goto('https://www.mairovergara.com/shoot-up-o-que-significa/')
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
  await popup.getByRole('button', { name: 'Mandar ao Acervo' }).click()

  await expect(texto).toHaveText('Na fila do Acervo')
  expect(apps.recebidos.filter((r) => r.caminho === '/api/referencias')).toHaveLength(1)
  await expect(popup.locator('#historico li')).toHaveCount(1)
  await expect(popup.locator('#aqui')).toBeHidden()
})

test('fora de vídeo e do Mairo, o popup não oferece envio', async ({ context, extensao }) => {
  const pagina = await context.newPage()
  await pagina.goto('https://www.youtube.com/')
  const aba = await ultimaAba(context)
  const popup = await context.newPage()
  await popup.goto(`chrome-extension://${extensao}/popup.html?aba=${aba.id}`)
  await expect(popup.getByText('Nada enviado ainda.')).toBeVisible()
  await expect(popup.locator('#aqui')).toBeHidden()
})
