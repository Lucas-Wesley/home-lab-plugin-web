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
    app: 'cortes',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  })
  assert.deepEqual(json(D.destinoDaPagina('https://blog.exemplo.com/shoot-up-o-que-significa/?utm_source=x&p=12&fbclid=y#audio', true)), {
    app: 'flashcards',
    url: 'https://blog.exemplo.com/shoot-up-o-que-significa/?p=12',
  })
  // Página sem frases de exemplo (a inicial de um blog, uma lista de posts): sem botão na página.
  assert.equal(D.destinoDaPagina('https://blog.exemplo.com/', false), null)
  // O YouTube fora de um vídeo não vai a lugar nenhum.
  assert.equal(D.destinoDaPagina('https://www.youtube.com/', true), null)
  assert.equal(D.destinoDaPagina('chrome://extensions', true), null)
})

test('qualquer página vai ao Acervo ou ao Flashcards; o vídeo, ao Cortes, à Trilha ou ao Acervo (E10, E13, E26, E27)', () => {
  assert.deepEqual(json(D.acoesDaPagina('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=9')), [
    { app: 'cortes', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
    { app: 'trilha', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
    { app: 'acervo', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
  ])
  assert.deepEqual(json(D.acoesDaPagina('https://blog.exemplo.com/historia-do-cafe/?utm_source=x#topo')), [
    { app: 'acervo', url: 'https://blog.exemplo.com/historia-do-cafe/' },
    { app: 'flashcards', url: 'https://blog.exemplo.com/historia-do-cafe/' },
  ])
  assert.deepEqual(json(D.acoesDaPagina('https://www.youtube.com/')), [])
  assert.deepEqual(json(D.acoesDaPagina('chrome://extensions')), [])
  assert.deepEqual(json(D.acoesDaPagina('não é link')), [])
})

test('o baralho padrão é o Inglês', () => {
  assert.equal(D.baralhoPadrao([{ id: 'b2', nome: 'Bandeiras' }, { id: 'b1', nome: ' inglês ' }]), 'b1')
  assert.equal(D.baralhoPadrao([{ id: 'b2', nome: 'Bandeiras' }]), '')
})

test('monta o pedido de cada app', () => {
  assert.deepEqual(json(D.pedidoPara('acervo', 'u', {})), { caminho: '/api/referencias', corpo: { url: 'u' } })
  const flash = D.pedidoPara('flashcards', 'u', { baralho: 'b1', tipo: 'invertido' })
  assert.equal(flash.caminho, '/api/links')
  assert.deepEqual(json(flash.corpo), { url: 'u', baralho_id: 'b1', tipo: 'invertido' })
  assert.deepEqual(json(D.pedidoPara('flashcards', 'u', {}).corpo), { url: 'u', baralho_id: '', tipo: 'basico' })
  assert.equal(D.pedidoPara('flashcards', 'u', { baralho: 'novo' }).corpo.baralho_id, '')
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
  assert.equal(D.resultadoDaResposta('flashcards', flash, 201, { id: 7, estado: 'na_fila' }).mensagem, 'A IA está montando os exemplos')
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

test('um PDF vai só à Biblioteca, pelo tipo do documento ou pelo nome (E12)', () => {
  assert.equal(D.ehPdf('https://site.com/livros/O%20Convite.pdf?token=1'), true)
  assert.equal(D.ehPdf('https://site.com/Arquivo.PDF'), true)
  assert.equal(D.ehPdf('https://site.com/baixar?id=9', 'application/pdf'), true)
  assert.equal(D.ehPdf('https://site.com/pdf-gratis/'), false)
  assert.equal(D.ehPdf('file:///Users/x/a.pdf'), false)
  assert.deepEqual(json(D.acoesDaPagina('https://site.com/a.pdf?utm_source=x&token=1#page=3', true)), [
    { app: 'biblioteca', url: 'https://site.com/a.pdf?token=1' },
  ])
  assert.deepEqual(json(D.destinoDaPagina('https://site.com/a.pdf', false, true)), { app: 'biblioteca', url: 'https://site.com/a.pdf' })
  assert.equal(D.destinoDaPagina('https://site.com/a', false, false), null)
  assert.equal(D.nomeDoPdf('https://site.com/livros/O%20Convite.pdf?t=1'), 'O Convite.pdf')
  assert.equal(D.nomeDoPdf('https://site.com/baixar'), 'baixar.pdf')
  assert.equal(D.nomeDoPdf('https://site.com/'), 'documento.pdf')
})

test('traduz as respostas da Biblioteca', () => {
  const base = 'https://biblioteca.internal/'
  assert.deepEqual(json(D.resultadoDaResposta('biblioteca', base, 201, { id: 'a b' })), {
    estado: 'enviado',
    mensagem: 'Na Biblioteca',
    abrir: 'https://biblioteca.internal/#/livro/a%20b',
  })
  assert.equal(D.resultadoDaResposta('biblioteca', base, 409, { error: 'esse livro já está na biblioteca' }).estado, 'repetido')
  assert.equal(D.resultadoDaResposta('biblioteca', base, 400, { error: 'arquivo inválido' }).mensagem, 'arquivo inválido')
  assert.equal(D.pedidoPara('biblioteca', 'https://site.com/a.pdf', {}).caminho, '/api/books')
})

test('a Trilha recebe o vídeo na Entrada, no automático, e abre a fonte (E13)', () => {
  assert.deepEqual(json(D.pedidoPara('trilha', 'u', {})), { caminho: '/api/entrada', corpo: { url: 'u', automatico: true } })
  const trilha = 'https://trilha.internal/'
  assert.deepEqual(json(D.resultadoDaResposta('trilha', trilha, 202, [{ id: 3, estado: 'na_fila' }])), {
    estado: 'enviado',
    mensagem: 'Na Entrada: a IA divide e sugere as trilhas',
    abrir: 'https://trilha.internal/#/entrada/3',
  })
  assert.equal(D.resultadoDaResposta('trilha', trilha, 202, [{ id: 3, estado: 'fragmentada' }]).estado, 'repetido')
  assert.equal(D.resultadoDaResposta('trilha', trilha, 400, { erro: 'mande o link' }).mensagem, 'mande o link')
})

test('o Cortes recebe o vídeo e abre a tela dele (E26)', () => {
  assert.deepEqual(json(D.pedidoPara('cortes', 'u', {})), { caminho: '/api/videos', corpo: { url: 'u' } })
  const cortes = 'https://cortes.internal/'
  assert.deepEqual(json(D.resultadoDaResposta('cortes', cortes, 201, { id: 7 })), {
    estado: 'enviado',
    mensagem: 'No Cortes: legenda e mapa de assuntos a caminho',
    abrir: 'https://cortes.internal/#/video/7',
  })
  assert.deepEqual(json(D.resultadoDaResposta('cortes', cortes, 409, { erro: 'Este vídeo já está na lista.', id: 7 })), {
    estado: 'repetido',
    mensagem: 'Já está no Cortes',
    abrir: 'https://cortes.internal/#/video/7',
  })
  assert.equal(D.resultadoDaResposta('cortes', cortes, 400, { erro: 'Não achei um link do YouTube.' }).mensagem, 'Não achei um link do YouTube.')
  assert.equal(D.ENDERECOS_PADRAO.cortes, 'https://cortes.internal')
})
