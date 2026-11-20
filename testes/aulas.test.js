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
