import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'

const contexto = { URL }
contexto.globalThis = contexto
vm.runInNewContext(readFileSync(new URL('../extensao/aulas.js', import.meta.url), 'utf8'), contexto)
const A = contexto.Aulas

test('escolhe o manifesto mestre mais recente da aba (E15)', () => {
  const m = (url) => ({ url, referer: 'r' })
  assert.equal(A.escolherManifesto([m('https://b/a/playlist.m3u8?get_qualities=1'), m('https://b/a/playlist.m3u8'), m('https://b/a/720p/video.m3u8')]).url, 'https://b/a/playlist.m3u8')
  // Trocou de aula sem recarregar: o mestre novo vale.
  assert.equal(A.escolherManifesto([m('https://c/v1/playlist.m3u8'), m('https://c/v1/720p/video.m3u8'), m('https://c/v2/playlist.m3u8')]).url, 'https://c/v2/playlist.m3u8')
  // Só variante: ela mesma.
  assert.equal(A.escolherManifesto([m('https://c/v1/1080p/video.m3u8')]).url, 'https://c/v1/1080p/video.m3u8')
  assert.equal(A.escolherManifesto([m('https://c/a.mp4')]), null)
  assert.equal(A.escolherManifesto([]), null)
})

test('a chave e o nome padrão do curso', () => {
  assert.equal(A.chaveDoCurso('https://app.branas.io/users/u/products/0c84/contents/8b74'), 'app.branas.io/products/0c84')
  assert.equal(A.chaveDoCurso('https://mesa.linuxtips.io/treinamentos/system-design-turma4/8fd8'), 'mesa.linuxtips.io/treinamentos/system-design-turma4')
  assert.equal(A.cursoPadrao('https://mesa.linuxtips.io/treinamentos/system-design-turma4/8fd8'), 'System Design Turma4')
  assert.equal(A.cursoPadrao('https://app.branas.io/users/u/products/0c84'), '')
  assert.equal(A.tituloLimpo('Sala de Aula | LINUXtips'), '')
  assert.equal(A.tituloLimpo('Modelo OSI | LINUXtips'), 'Modelo OSI')
  assert.ok(A.PARECE_MODULO.test('Aula 6 (02/03/2026 às 19:00)'))
  assert.ok(A.PARECE_MODULO.test('Módulo 2 - Banco de dados'))
  assert.ok(!A.PARECE_MODULO.test('Arquitetura de Microservices'))
})

test('tamanho e duração para o popup', () => {
  assert.equal(A.tamanhoLegivel(400 * 2 ** 20), '400 MB')
  assert.equal(A.tamanhoLegivel(1.5 * 2 ** 30), '1,5 GB')
  assert.equal(A.duracaoLegivel(7254), '2 h 01 min')
  assert.equal(A.duracaoLegivel(1214), '20 min')
})

test('Full Cycle e Tech Leads Club: a chave do curso, o curso pelo endereço e pelo caminho (E17)', () => {
  assert.equal(A.chaveDoCurso('https://plataforma.fullcycle.com.br/courses/3b8c/370/catalog/214/lessons/9'), 'plataforma.fullcycle.com.br/courses/3b8c/370/catalog/214')
  assert.equal(A.chaveDoCurso('https://techleads.club/c/fundamentos-enterprise/sections/1/lessons/2'), 'techleads.club/c/fundamentos-enterprise')
  assert.equal(A.cursoDoEndereco('https://techleads.club/c/fundamentos-do-desenvolvimento-de-software-enterprise/sections/1', ['Banco de dados', '[Curso] Fundamentos do Desenvolvimento de Software Enterprise']), 'Fundamentos do Desenvolvimento de Software Enterprise')
  assert.equal(A.cursoDoEndereco('https://techleads.club/c/feed', ['Feed']), '')
  assert.equal(A.cursoDoCaminho(['Meus Cursos', '›', 'Curso Full Cycle 4.0 - Upgrade', 'DevSecOps', 'DevSecOps na Prática']), 'DevSecOps na Prática')
  assert.equal(A.cursoDoCaminho(['Meus Cursos', 'DevSecOps', 'Conceitos Básicos'], 'Conceitos Básicos'), 'DevSecOps')
  assert.ok(A.NAO_E_AULA.test('6 de 69 concluídos') && A.NAO_E_AULA.test('3 aulas') && A.NAO_E_AULA.test('15:50'))
  assert.ok(A.CONTAGEM.test('3 aulas') && !A.CONTAGEM.test('Aula 6'))
})

test('o nome da aula é o texto repetido ou marcado como atual (E15)', () => {
  const t = (texto, fonte = 14, ativo = false) => ({ texto, fonte, ativo })
  // Branas.io: no alto (letra grande) e marcado na lista; o módulo aberto também vem "ativo".
  assert.equal(A.escolherTitulo([t('0% CONCLUÍDO'), t('Aula 6 (02/03/2026 às 19:00)', 14, true), t('Assistir aula completa'), t('Arquitetura de Microservices', 14, true), t('Arquitetura de Microservices', 26)]), 'Arquitetura de Microservices')
  // LINUXtips: no título do painel e na lista, sem marca de ativo; o título do texto em caixa alta não se repete.
  assert.equal(A.escolherTitulo([t('Protocolos de Rede: IP, IPV4 e IPV6'), t('8 min'), t('8 min'), t('Protocolos de Rede: IP, IPV4 e IPV6', 15), t('PROTOCOLO IP, IPV4 E IPV6', 18)]), 'Protocolos de Rede: IP, IPV4 e IPV6')
  // Uma aula cujo nome começa com "Aula" ainda vale.
  assert.equal(A.escolherTitulo([t('Aula de teste'), t('Aula de teste', 24)]), 'Aula de teste')
  assert.equal(A.escolherTitulo([t('Só uma vez', 30)]), '')
  assert.equal(A.escolherTitulo([t('Vídeo', 14, true), t('Vídeo'), t('Protocolos de Rede: DNS'), t('Protocolos de Rede: DNS')]), 'Protocolos de Rede: DNS')
  assert.ok(A.PROGRESSO.test('0% CONCLUÍDO'))
})

test('E20: o player embutido do YouTube e do Vimeo', () => {
  assert.ok(A.ehEmbed('https://www.youtube.com/embed/AAAAAAAAAAA?controls=0&rel=0'))
  assert.ok(A.ehEmbed('https://www.youtube-nocookie.com/embed/AAAAAAAAAAA'))
  assert.ok(A.ehEmbed('https://player.vimeo.com/video/123456?h=abc&badge=0'))
  assert.ok(!A.ehEmbed('https://www.youtube.com/watch?v=AAAAAAAAAAA'))
  assert.ok(!A.ehEmbed('https://player-vz-x.tv.pandavideo.com.br/embed/?v=1'))
  assert.ok(!A.ehEmbed('http://player.vimeo.com/video/1'))
})

test('E20: os nomes da vitrine em caixa alta e o número da aula', () => {
  assert.equal(A.nomeBonito('AS PRAÇAS DA COZINHA PRÁTICA'), 'As praças da cozinha prática')
  assert.equal(A.nomeBonito('COZINHA DE PANELA SÓ - COMECE POR AQUI'), 'Cozinha de panela só - Comece por aqui')
  assert.equal(A.nomeBonito('PRAÇA PRONTA - GRÃOS, MASSAS E CEREAIS'), 'Praça pronta - Grãos, massas e cereais')
  assert.equal(A.nomeBonito('CDPS - COMECE POR AQUI'), 'CDPS - Comece por aqui')
  assert.equal(A.nomeBonito('CONGELAMENTO INTELIGENTE 2026'), 'Congelamento inteligente 2026')
  assert.equal(A.nomeBonito('Guia da praça pronta - PDF'), 'Guia da praça pronta - PDF')
  assert.equal(A.semNumero('1. Bases pronta = economia de tempo'), 'Bases pronta = economia de tempo')
  assert.equal(A.semNumero('12) Tablete de cebola'), 'Tablete de cebola')
  assert.equal(A.semNumero('1 - 2 pessoas em casa'), '1 - 2 pessoas em casa')
  assert.equal(A.semNumero('5 pessoas ou mais em casa'), '5 pessoas ou mais em casa')
  assert.equal(A.semNumero('Obrigatório em toda casa'), 'Obrigatório em toda casa')
  assert.ok(A.LINK_AULA_ESCOLA.test('/area/conteudo/aula/7643834'))
  assert.ok(A.LINK_MODULO_ESCOLA.test('/area/conteudo/modulo/1475290'))
})

test('E20: o mapa da escola junta os módulos de cada curso, sem repetir aula', () => {
  const mapa = {}
  const g1 = [{ modulo: 'PRAÇA PRONTA - BASES E TEMPEROS', esperado: 3, aulas: [{ url: 'u1', titulo: '1. Bases' }, { url: 'u2', titulo: '2. Tablete' }] }]
  assert.equal(A.acrescentarAoMapa(mapa, 'As praças', g1), 2)
  // A mesma página de novo (outro cartão leva ao mesmo módulo): nada novo.
  assert.equal(A.acrescentarAoMapa(mapa, 'As praças', g1), 0)
  A.acrescentarAoMapa(mapa, 'As praças', [{ modulo: 'Praça pronta - Proteínas', aulas: [{ url: 'u3', titulo: 'Carne' }] }])
  A.acrescentarAoMapa(mapa, 'Métodos', [{ modulo: '', aulas: [{ url: 'u4', titulo: 'Grelhado' }] }], 'PREPAROS GRELHADOS')
  const r = A.resumoDoMapa(mapa)
  assert.deepEqual(JSON.parse(JSON.stringify(r)), [
    { nome: 'As praças', modulos: 2, aulas: 3, faltando: ['Praça pronta - Bases e temperos (2 de 3)'] },
    { nome: 'Métodos', modulos: 1, aulas: 1, faltando: [] },
  ])
  const fila = A.aulasDoMapa(mapa, ['As praças'])
  assert.deepEqual(JSON.parse(JSON.stringify(fila.map((a) => [a.titulo, a.modulo, a.ordem]))), [
    ['Bases', 'Praça pronta - Bases e temperos', 1],
    ['Tablete', 'Praça pronta - Bases e temperos', 2],
    ['Carne', 'Praça pronta - Proteínas', 3],
  ])
  assert.equal(A.aulasDoMapa(mapa)[3].modulo, 'Preparos grelhados')
})

test('E20: a aula que entrou pela caixa "→ módulo" volta para o módulo dela', () => {
  const mapa = {}
  // Na página do módulo A, a caixa "→ GUIA DA PRAÇA PRONTA - PDF" leva à aula 88 (lida como aula de A).
  A.acrescentarAoMapa(mapa, 'Métodos', [{ modulo: 'Partida limpa - Guisados', aulas: [{ url: 'u86', titulo: 'Guisado' }, { url: 'u88', titulo: 'GUIA DA PRAÇA PRONTA - PDF' }] }])
  // Na página do módulo Guia, a aula 88 de verdade.
  A.acrescentarAoMapa(mapa, 'Métodos', [{ modulo: 'Guia da praça pronta - PDF', aulas: [{ url: 'u88', titulo: 'Guia da praça pronta - PDF' }] }])
  const m = mapa.cursos[0].modulos.map((x) => [x.nome, x.aulas.map((a) => a.url)])
  assert.deepEqual(JSON.parse(JSON.stringify(m)), [['Partida limpa - Guisados', ['u86']], ['Guia da praça pronta - PDF', ['u88']]])
})

test('E23: no SmartPlayer, a imagem de maior qualidade e o som da mesma pasta', () => {
  const m = (url) => ({ url, referer: 'https://player.scaleup.com.br/' })
  const p = 'https://stream.smartplayer.io/c1/v1/v1'
  const vistos = [m(`${p}_0_480p.m3u8?token=a`), m(`${p}_0_1080p.m3u8?token=b`), m(`${p}_0_en_192k.m3u8?token=c`)]
  assert.deepEqual(JSON.parse(JSON.stringify(A.escolherVideo(vistos))), { url: `${p}_0_1080p.m3u8?token=b`, referer: 'https://player.scaleup.com.br/', audio: `${p}_0_en_192k.m3u8?token=c` })
  // Trocou de aula: vale a pasta do vídeo tocado por último (o som da aula anterior não serve).
  const q = 'https://stream.smartplayer.io/c1/v2/v2'
  const depois = [...vistos, m(`${q}_0_1080p.m3u8?token=d`)]
  assert.equal(A.escolherVideo(depois).url, `${q}_0_1080p.m3u8?token=d`)
  assert.equal(A.escolherVideo(depois).audio, undefined)
  assert.ok(A.faltaOSom({ manifesto: `${q}_0_1080p.m3u8?token=d` }))
  assert.ok(!A.faltaOSom({ manifesto: `${q}_0_1080p.m3u8`, audio: 'x' }))
  // Com lista mestre (Panda, Bunny), segue como antes, sem som à parte.
  assert.deepEqual(JSON.parse(JSON.stringify(A.escolherVideo([m('https://b/a/playlist.m3u8'), m('https://b/a/720p/video.m3u8')]))), m('https://b/a/playlist.m3u8'))
  assert.ok(!A.faltaOSom({ manifesto: 'https://b/a/playlist.m3u8' }))
})
