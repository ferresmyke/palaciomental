import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { host: '127.0.0.1', port: 5173 },
  // Versão de arquivo único (abre com duplo clique): tudo em um só pacote, caminhos relativos.
  base: mode === 'single' ? './' : '/',
  build: {
    chunkSizeWarningLimit: 4000,
    ...(mode === 'single' ? { rollupOptions: { output: { inlineDynamicImports: true } }, assetsInlineLimit: 100_000_000, cssCodeSplit: false } : {}),
  },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
}));
