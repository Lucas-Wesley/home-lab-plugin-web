import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'

// coleta.js e destinos.js são scripts comuns: rodam num contexto à parte, como no destinos.test.js.
const contexto = { URL }
contexto.globalThis = contexto
for (const arq of ['destinos.js', 'coleta.js']) vm.runInNewContext(readFileSync(new URL(`../extensao/${arq}`, import.meta.url), 'utf8'), contexto)
const { Coleta: C, Destinos: D } = contexto
const json = (o) => JSON.parse(JSON.stringify(o))

test('nas páginas dos dois cursos, o botão é o da coleta, com o endereço base (E14)', () => {
  assert.deepEqual(json(D.destinoDaPagina('https://app.branas.io/users/x/products/y/contents/z', false)), {
    app: 'coleta', curso: 'branas', nome: 'Branas.io', url: 'https://app.branas.io',
  })
  assert.equal(D.destinoDaPagina('https://mesa.linuxtips.io/treinamentos/system-design-turma4/abc', false).curso, 'linuxtips')
  assert.equal(D.cursoDaPagina('https://plataforma.fullcycle.com.br/courses/x').curso, 'fullcycle')
  assert.equal(D.cursoDaPagina('https://techleads.club/c/curso').curso, 'techleads')
  // E20: a área de alunos do Chef Enzo Neto é escola (o site de vendas dele, não).
  assert.deepEqual(json(D.cursoDaPagina('https://aluno.enzoneto.com/area/vitrine/home')), { curso: 'enzoneto', nome: 'Chef Enzo Neto', url: 'https://aluno.enzoneto.com', escola: true })
  assert.equal(D.cursoDaPagina('https://enzoneto.com/'), null)
  assert.equal(D.cursoDaPagina('https://branas.io.exemplo.com/'), null)
  assert.equal(D.cursoDaPagina('https://naobranas.io/'), null)
  assert.equal(D.cursoDaPagina('http://mesa.linuxtips.io/'), null)
  // O popup continua oferecendo o Acervo e o Flashcards nessas páginas.
  assert.deepEqual(json(D.acoesDaPagina('https://app.branas.io/a')).map((a) => a.app), ['acervo', 'flashcards'])
})

test('a sessão do Lucas não vai para o arquivo', () => {
  assert.deepEqual(json(C.semSegredos({ Cookie: 'a=1', Authorization: 'Bearer x', 'set-cookie': 's', Referer: 'https://app.branas.io/' })), {
    Cookie: '[omitido]', Authorization: '[omitido]', 'set-cookie': '[omitido]', Referer: 'https://app.branas.io/',
  })
})

test('o tipo de cada pedido e quais corpos guardar', () => {
  assert.equal(C.tipoDoPedido('https://cdn.x/v/playlist.m3u8?token=1'), 'manifesto-hls')
  assert.equal(C.tipoDoPedido('https://cdn.x/v/1', 'application/vnd.apple.mpegurl'), 'manifesto-hls')
  assert.equal(C.tipoDoPedido('https://cdn.x/v/manifest.mpd'), 'manifesto-dash')
  assert.equal(C.tipoDoPedido('https://cdn.x/v/720p/seg_001.ts'), 'pedaco')
  assert.equal(C.tipoDoPedido('https://cdn.x/v/legenda.vtt'), 'legenda')
  assert.equal(C.tipoDoPedido('https://cdn.x/v/aula.mp4', 'video/mp4'), 'midia')
  assert.equal(C.tipoDoPedido('https://drm.x/widevine/license', 'application/octet-stream'), 'licenca')
  assert.equal(C.tipoDoPedido('https://cdn.x/v/keys/abc'), 'chave')
  assert.ok(C.precisaDoCorpo('https://cdn.x/v/playlist.m3u8') > 0)
  assert.ok(C.precisaDoCorpo('https://api.x/player/config', 'application/json') > 0)
  assert.equal(C.precisaDoCorpo('https://api.x/me', 'application/json'), 0)
  assert.equal(C.precisaDoCorpo('https://cdn.x/v/seg.ts', 'video/mp2t'), 0)
  assert.equal(C.precisaDoCorpo('https://cdn.x/v/keys/abc', 'application/octet-stream'), 0)
})

const HLS_AES = '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="https://cdn.x/keys/k1",IV=0x1\n#EXTINF:6.0,\nseg_001.ts\n#EXTINF:6.0,\nseg_002.ts\n'
const MESTRE = '#EXTM3U\n#EXT-X-MEDIA:TYPE=SUBTITLES,NAME="pt",URI="sub.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=1\n720p.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=2\n1080p.m3u8\n'

test('lê os manifestos: chaves, variantes, pedaços e DRM', () => {
  const m = json(C.lerManifesto('u', HLS_AES, 'manifesto-hls'))
  assert.deepEqual(m.chaves, [{ metodo: 'AES-128', formato: 'identity', uri: 'https://cdn.x/keys/k1' }])
  assert.equal(m.pedacos, 2)
  const mestre = json(C.lerManifesto('u', MESTRE, 'manifesto-hls'))
  assert.equal(mestre.variantes, 2)
  assert.equal(mestre.legendas, 1)
  const wv = json(C.lerManifesto('u', '#EXTM3U\n#EXT-X-KEY:METHOD=SAMPLE-AES,URI="data:x",KEYFORMAT="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed"\n', 'manifesto-hls'))
  assert.deepEqual(wv.drm, ['Widevine'])
  const dash = json(C.lerManifesto('u', '<MPD><ContentProtection schemeIdUri="urn:uuid:EDEF8BA9-79D6-4ACE-A3C8-27DCD51D21ED"/><Representation/></MPD>', 'manifesto-dash'))
  assert.deepEqual(dash.drm, ['Widevine'])
})

test('o resumo diz como o vídeo chega', () => {
  const p = (url, tipo, extra = {}) => ({ url, tipo, tamanho: 100, ...extra })
  assert.equal(C.resumir([p('https://cdn.x/a.m3u8', 'manifesto-hls', { corpo: HLS_AES }), p('https://cdn.x/seg_001.ts', 'pedaco')]).veredito, 'aes128')
  assert.equal(C.resumir([p('https://cdn.x/a.m3u8', 'manifesto-hls', { corpo: MESTRE })]).veredito, 'sem-criptografia')
  assert.equal(C.resumir([p('https://cdn.x/a.m3u8', 'manifesto-hls', { corpo: MESTRE })], [{ mediaKeys: true }]).veredito, 'drm')
  assert.equal(C.resumir([p('https://cdn.x/aula.mp4', 'midia')]).veredito, 'arquivo-direto')
  assert.equal(C.resumir([p('https://cdn.x/seg.ts', 'pedaco')]).veredito, 'indefinido')
  assert.equal(C.resumir([]).veredito, 'indefinido')
  const r = json(C.resumir([p('https://cdn.x/a.m3u8', 'manifesto-hls', { corpo: HLS_AES }), p('https://cdn.x/s.ts', 'pedaco')]))
  assert.deepEqual(r.hosts['cdn.x'], { pedidos: 2, bytes: 200, tipos: { 'manifesto-hls': 1, pedaco: 1 } })
})

test('o nome do arquivo tem o curso e a hora', () => {
  assert.equal(C.nomeDoArquivo('branas', new Date(2026, 10, 20, 9, 5)), 'homelab-coleta-branas-2026-11-20-0905.json')
})
