import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'

// destinos.js é um script comum (o Chrome não carrega módulos nos content scripts): roda num contexto à parte.
const contexto = { URL }
contexto.globalThis = contexto
vm.runInNewContext(readFileSync(new URL('../extensao/destinos.js', import.meta.url), 'utf8'), contexto)
const D = contexto.Destinos
// Objetos de outro contexto não são iguais por referência de protótipo: compara pelo JSON.
const json = (o) => JSON.parse(JSON.stringify(o))

test('acha o vídeo do YouTube nos links que o Acervo aceita', () => {
  assert.equal(D.videoDoYouTube('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s'), 'dQw4w9WgXcQ')
  assert.equal(D.videoDoYouTube('https://m.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ')
  assert.equal(D.videoDoYouTube('https://www.youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ')
  assert.equal(D.videoDoYouTube('https://www.youtube.com/live/dQw4w9WgXcQ?si=x'), 'dQw4w9WgXcQ')
  assert.equal(D.videoDoYouTube('https://www.youtube.com/'), '')
  assert.equal(D.videoDoYouTube('https://www.youtube.com/results?search_query=laranja'), '')
  assert.equal(D.videoDoYouTube('https://www.youtube.com/watch?v=curto'), '')
  assert.equal(D.videoDoYouTube('https://exemplo.com/watch?v=dQw4w9WgXcQ'), '')
  assert.equal(D.videoDoYouTube('não é link'), '')
})

test('cada página vai para o seu app, com o link limpo', () => {
  assert.deepEqual(json(D.destinoDaPagina('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1&t=9', false)), {
    app: 'acervo',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  })
  assert.deepEqual(json(D.destinoDaPagina('https://www.mairovergara.com/shoot-up-o-que-significa/?utm_source=x#audio', true)), {
    app: 'flashcards',
    url: 'https://www.mairovergara.com/shoot-up-o-que-significa/',
  })
  // Página do Mairo sem frases de exemplo (a inicial, uma lista de posts): sem botão.
  assert.equal(D.destinoDaPagina('https://www.mairovergara.com/', false), null)
  assert.equal(D.destinoDaPagina('https://www.google.com/', true), null)
})

test('monta o pedido de cada app', () => {
  assert.deepEqual(json(D.pedidoPara('acervo', 'u', {})), { caminho: '/api/referencias', corpo: { url: 'u' } })
  const flash = D.pedidoPara('flashcards', 'u', { baralho: 'b1', tipo: 'invertido' })
  assert.equal(flash.caminho, '/api/links')
  assert.deepEqual(json(flash.corpo), { url: 'u', baralho_id: 'b1', tipo: 'invertido' })
  assert.deepEqual(json(D.pedidoPara('flashcards', 'u', {}).corpo), { url: 'u', baralho_id: '', tipo: 'basico' })
})

test('traduz as respostas dos apps', () => {
  const acervo = 'https://192.168.1.20:8444/'
  assert.deepEqual(json(D.resultadoDaResposta('acervo', acervo, 201, { id: 'abc' })), {
    estado: 'enviado',
    mensagem: 'Na fila do Acervo',
    abrir: 'https://192.168.1.20:8444/#/referencia/abc',
  })
  assert.equal(D.resultadoDaResposta('acervo', acervo, 409, { erro: 'x', id: 'abc' }).estado, 'repetido')
  assert.equal(D.resultadoDaResposta('acervo', acervo, 400, { erro: 'Cole um link de vídeo do YouTube.' }).mensagem, 'Cole um link de vídeo do YouTube.')
  assert.equal(D.resultadoDaResposta('acervo', acervo, 502, null).mensagem, 'O Acervo respondeu 502')

  const flash = 'https://192.168.1.20:8445'
  assert.equal(D.resultadoDaResposta('flashcards', flash, 201, { id: 7, estado: 'na_fila' }).mensagem, 'A IA está escolhendo os exemplos')
  assert.equal(D.resultadoDaResposta('flashcards', flash, 201, { id: 7, estado: 'em_revisao' }).abrir, 'https://192.168.1.20:8445/#/geracao/7')
  assert.deepEqual(json(D.resultadoDaResposta('flashcards', flash, 409, { erro: 'Todas as frases deste link já estão no baralho.' })), {
    estado: 'repetido',
    mensagem: 'Todas as frases deste link já estão no baralho.',
    abrir: '',
  })
})

test('o histórico guarda os últimos envios, o mais novo primeiro', () => {
  let h = []
  for (let i = 0; i < D.HISTORICO_MAXIMO + 5; i++) h = D.acrescentar(h, { n: i })
  assert.equal(h.length, D.HISTORICO_MAXIMO)
  assert.equal(h[0].n, D.HISTORICO_MAXIMO + 4)
})
