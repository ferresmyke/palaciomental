/**
 * Junta o resultado do build (HTML + CSS + JS) em um único arquivo, que abre com duplo clique
 * (file://), sem servidor. Uso: npm run build:single
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const dist = path.resolve('dist-single');
let html = readFileSync(path.join(dist, 'index.html'), 'utf8');
const read = (rel) => readFileSync(path.join(dist, rel.replace(/^\.?\//, '')), 'utf8');

html = html.replace(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (_m, href) => `<style>\n${read(href)}\n</style>`);
html = html.replace(/<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g, (_m, src) => {
  const js = read(src).replace(/<\/script/gi, '<\\/script');
  return `<script type="module">\n${js}\n</script>`;
});
const svg = readFileSync(path.join(dist, 'favicon.svg'), 'utf8');
html = html.replace(/<link rel="icon"[^>]*>/, `<link rel="icon" href="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" />`);
if (/(src|href)="(\.\/|\/)assets\//.test(html)) throw new Error('Sobrou referência externa no HTML final.');

// O módulo precisa ficar depois do #root: move o script para o fim do corpo.
const m = /<script type="module">[\s\S]*?<\/script>/.exec(html);
// (replace com função: o JavaScript tem sequências como "$&" que String.replace trataria como padrões)
if (m) html = html.replace(m[0], () => '').replace('</body>', () => `${m[0]}\n</body>`);

mkdirSync('versao-pronta', { recursive: true });
const out = path.resolve('versao-pronta', 'Recanto.html');
writeFileSync(out, html);
console.log(`OK: ${out} (${(html.length / 1024 / 1024).toFixed(2)} MB). Arquivos no build: ${readdirSync(path.join(dist, 'assets')).join(', ')}`);
