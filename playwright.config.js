import { defineConfig } from '@playwright/test'

// A extensão roda num Chromium de verdade; as páginas do YouTube e do Mairo Vergara são simuladas,
// e um servidor falso faz o papel do Acervo e do Flashcards (testes/navegador/ambiente.js).
export default defineConfig({
  testDir: './testes/navegador',
  workers: 1,
  timeout: 30000,
})
