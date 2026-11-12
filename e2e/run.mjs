/**
 * Testes ponta a ponta dos critérios de aceitação (seção 16 do documento mestre).
 * Sobe o Vite, abre o Chromium e usa a interface real. Cada cenário começa com um
 * navegador limpo (IndexedDB vazio). Uso: npm run e2e  [-- --only=nome] [--shots]
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith('--only='))?.slice(7);
const shots = args.includes('--shots');
const shotDir = path.join(root, 'e2e', 'shots');
if (shots) mkdirSync(shotDir, { recursive: true });

const server = await createServer({ root, logLevel: 'error', server: { port: 0, host: '127.0.0.1' } });
await server.listen();
const url = server.resolvedUrls.local[0];
// Locale UTF-8: sem isso, o armazenamento virtual do Chromium no Linux recusa nomes com acento.
const browser = await chromium.launch({ env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' }, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

const results = [];
const consoleErrors = [];

class Fail extends Error {}
function check(cond, msg) {
  if (!cond) throw new Fail(msg);
}

/** Abre o app em um contexto limpo e devolve utilidades para o cenário. */
async function open(viewport = { width: 1440, height: 900 }, ctxOpts = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: 'pt-BR', acceptDownloads: true, ...ctxOpts });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(`console: ${m.text()}`);
  });
  await page.goto(url);
  await page.waitForFunction(() => window.__pm?.dbStore.getState().ready, null, { timeout: 30000 });
  await page.waitForFunction(() => !!window.__pm?.game, null, { timeout: 30000 });
  const t = {
    page,
    ctx,
    db: () => page.evaluate(() => window.__pm.dbStore.getState().db),
    ui: () => page.evaluate(() => {
      const s = window.__pm.uiStore.getState();
      return { place: s.place, panels: s.panels, reform: s.reform, selectedId: s.selectedId };
    }),
    eval: (fn, arg) => page.evaluate(fn, arg),
    wait: (ms) => page.waitForTimeout(ms),
    shot: async (name) => shots && page.screenshot({ path: path.join(shotDir, `${name}.png`) }),
    /** Começa com as seis casas, pulando a abertura pela própria interface. */
    async start(mode = 'six', name = 'Recanto de Teste') {
      await page.click('text=Pular');
      await page.fill('.onboarding input.field-input', name);
      await page.click(mode === 'six' ? 'text=Começar com as seis casas sugeridas' : 'text=Começar do zero');
      await page.click('text=Entrar no Recanto');
      await page.waitForSelector('.hud');
      await page.waitForTimeout(800);
    },
    async reduceMotion() {
      await page.evaluate(() => window.__pm.exec('Reduzir movimento', (d) => window.__pm.ops.updateSettings(d, { reduceMotion: true }), { transient: true }));
      await page.waitForTimeout(100);
    },
    async reload() {
      await page.evaluate(() => new Promise((r) => setTimeout(r, 300)));
      await page.reload();
      await page.waitForFunction(() => window.__pm?.dbStore.getState().ready, null, { timeout: 30000 });
      await page.waitForTimeout(600);
    },
    async place(kind, timeout = 12000) {
      await page.waitForFunction((k) => window.__pm.uiStore.getState().place.kind === k && !window.__pm.uiStore.getState().traveling, kind, { timeout });
      await page.waitForTimeout(300);
    },
    id: (table, pred) => page.evaluate(([tb, src]) => Object.values(window.__pm.dbStore.getState().db[tb]).find(new Function('x', `return ${src}`))?.id, [table, pred]),
    /** Clica no centro de uma célula da cena ativa (coordenadas de mundo). */
    async clickWorld(wx, wy) {
      const pt = await page.evaluate(([x, y]) => {
        const game = window.__pm.game;
        const scene = game.scene.getScenes(true)[0];
        const cam = scene.cameras.main;
        const r = game.canvas.getBoundingClientRect();
        return { x: r.left + (x - cam.worldView.x) * cam.zoom, y: r.top + (y - cam.worldView.y) * cam.zoom };
      }, [wx, wy]);
      await page.mouse.move(pt.x, pt.y);
      await page.waitForTimeout(80);
      await page.mouse.down();
      await page.mouse.up();
      await page.waitForTimeout(250);
    },
  };
  return t;
}

async function scenario(name, fn) {
  if (only && !name.includes(only)) return;
  const started = Date.now();
  let t;
  try {
    t = await fn(open);
    results.push({ name, ok: true, ms: Date.now() - started });
    process.stdout.write(`  ✓ ${name} (${((Date.now() - started) / 1000).toFixed(1)}s)\n`);
  } catch (e) {
    results.push({ name, ok: false, err: e.message });
    process.stdout.write(`  ✗ ${name}\n      ${e.message.split('\n').slice(0, 4).join('\n      ')}\n`);
  } finally {
    void t;
  }
}

const TILE = 16;

console.log(`Palácio Mental — testes ponta a ponta em ${url}`);

// ─────────────────────────────────────────────────────────────

await scenario('abertura, nome da cidade e começar do zero', async (open) => {
  const t = await open();
  check(await t.page.isVisible('text=Toda vida junta coisas'), 'primeira tela da história ausente');
  await t.page.click('text=Continuar');
  check(await t.page.isVisible('text=Este é o Recanto'), 'segunda tela ausente');
  await t.page.click('text=Continuar');
  check(await t.page.isVisible('text=A cada visita'), 'terceira tela ausente');
  await t.page.click('text=Continuar');
  await t.page.fill('.onboarding input.field-input', 'Recanto da Ana');
  await t.page.click('text=Começar do zero');
  await t.shot('01-escolha');
  await t.page.click('text=Entrar no Recanto');
  await t.page.waitForSelector('text=Criar minha primeira casa');
  const db = await t.db();
  check(db.meta.world.name === 'Recanto da Ana', 'nome da cidade não salvo');
  check(Object.keys(db.houses).length === 0, 'começar do zero criou casas');
  check(await t.page.isVisible('.breadcrumbs >> text=Recanto da Ana'), 'breadcrumb sem o nome da cidade');
  await t.reload();
  check(!(await t.page.isVisible('.onboarding')), 'abertura reaparece após recarregar');
  await t.ctx.close();
});

await scenario('começar explorando com exemplos', async (open) => {
  const t = await open();
  await t.page.click('text=Pular');
  await t.page.click('text=Explorar com exemplos');
  await t.page.click('text=Entrar no Recanto');
  await t.page.waitForSelector('.hud');
  const db = await t.db();
  check(Object.values(db.houses).length === 6 && Object.values(db.books).length >= 25, 'o exemplo não preencheu as casas');
  check(Object.values(db.tasks).some((x) => x.repeat) && Object.values(db.goals).length === 5, 'o exemplo não trouxe repetições e objetivos');
  await t.page.keyboard.press('m');
  const text = await t.page.textContent('.panel');
  check(text.includes('Declarar o imposto de renda') && text.includes('Pagar o aluguel'), 'a Mesa do Dia do exemplo está vazia');
  await t.ctx.close();
});

await scenario('seis casas: navegar, entrar e voltar à praça', async (open) => {
  const t = await open();
  await t.start('six');
  const db = await t.db();
  check(Object.values(db.houses).length === 6, 'não criou as seis casas');
  await t.shot('02-cidade');
  // zoom e arrasto do mapa
  const z0 = await t.eval(() => window.__pm.game.scene.getScene('city').cameras.main.zoom);
  await t.page.click('button[aria-label=Aproximar]');
  await t.wait(200);
  const z1 = await t.eval(() => window.__pm.game.scene.getScene('city').cameras.main.zoom);
  check(z1 > z0, 'botão de zoom não aproximou');
  const s0 = await t.eval(() => window.__pm.game.scene.getScene('city').cameras.main.scrollX);
  await t.page.keyboard.press('ArrowRight');
  await t.wait(400);
  const s1 = await t.eval(() => window.__pm.game.scene.getScene('city').cameras.main.scrollX);
  check(s1 > s0, 'setas não moveram o mapa');
  // atalho 1 → entra na primeira casa (com caminhada real)
  await t.page.keyboard.press('1');
  await t.place('house');
  const ui = await t.ui();
  check(ui.place.houseId === (await t.id('houses', "x.name==='Oficina'")), 'atalho 1 não levou à Oficina');
  check(await t.page.isVisible('.summary'), 'resumo da casa ausente');
  check(await t.page.isVisible('.breadcrumbs >> text=Oficina'), 'breadcrumb sem a casa');
  await t.shot('03-oficina');
  await t.page.keyboard.press('0');
  await t.place('city');
  await t.page.keyboard.press('o');
  await t.place('observatory');
  await t.page.click('button[aria-label=Voltar]');
  await t.place('city');
  await t.ctx.close();
});

await scenario('casas: criar, renomear, mover, ocultar e excluir com destino', async (open) => {
  const t = await open();
  await t.start('six');
  await t.reduceMotion();
  await t.page.click('button[aria-label=Casas]');
  await t.page.click('text=+ Nova casa');
  await t.page.fill('.panel input.field-input', 'Jardim');
  await t.page.click('.model:has-text("Cabana de palha")');
  await t.page.click('text=Criar casa');
  await t.place('house');
  let db = await t.db();
  const jardim = Object.values(db.houses).find((h) => h.name === 'Jardim');
  check(jardim && jardim.modelId === 'palha', 'casa nova não criada com o modelo escolhido');
  check(Object.values(db.furniture).filter((f) => f.houseId === jardim.id && f.kind === 'essential').length === 3, 'casa nova sem interior-base');
  // renomear com duplo clique no painel da casa
  await t.eval((id) => window.__pm.ui.open({ type: 'house', id }), jardim.id);
  await t.page.dblclick('.panel-title .inline-edit');
  await t.page.fill('.panel-title .inline-input', 'Jardim e Horta');
  await t.page.keyboard.press('Enter');
  db = await t.db();
  check(db.houses[jardim.id].name === 'Jardim e Horta', 'renomear casa falhou');
  // mover para outro terreno pela Reforma da cidade
  await t.page.click('text=Mover de terreno');
  await t.place('city');
  const oldLot = db.houses[jardim.id].lotId;
  await t.page.locator('.world-label.lot:visible').first().click();
  await t.wait(300);
  db = await t.db();
  check(db.houses[jardim.id].lotId !== oldLot, 'casa não mudou de terreno');
  await t.page.keyboard.press('r');
  // ocultar
  await t.eval((id) => window.__pm.ui.open({ type: 'house', id }), jardim.id);
  await t.page.click('.panel >> text=Ocultar');
  db = await t.db();
  check(db.houses[jardim.id].hidden, 'ocultar falhou');
  check(!(await t.page.isVisible(`.world-label.house:has-text("Jardim e Horta")`)), 'casa oculta ainda aparece no mapa');
  await t.page.click('.panel >> text=Mostrar');
  // excluir exige destino do conteúdo
  const shelfId = await t.id('furniture', `x.houseId==='${jardim.id}' && x.kind==='container'`);
  await t.eval((fid) => window.__pm.exec('Livro', (d) => window.__pm.ops.createBook(d, { title: 'Calendário de plantio', furnitureId: fid })), shelfId);
  await t.page.click('text=Excluir casa…');
  check(await t.page.isVisible('text=Para onde vai esse conteúdo?'), 'exclusão não pediu destino');
  await t.page.selectOption('select[aria-label="Casa de destino"]', { label: 'Lar' });
  await t.page.click('.panel-foot >> text=Excluir casa');
  db = await t.db();
  const book = Object.values(db.books).find((b) => b.title === 'Calendário de plantio');
  check(db.houses[jardim.id].trash, 'casa não foi para a lixeira');
  check(db.houses[book.houseId].name === 'Lar', 'conteúdo não foi para a casa escolhida');
  await t.ctx.close();
});

await scenario('móveis: criar, nomear, mover, girar, trocar tipo e excluir', async (open) => {
  const t = await open();
  await t.start('six');
  await t.reduceMotion();
  await t.page.keyboard.press('2');
  await t.place('house');
  const houseId = (await t.ui()).place.houseId;
  await t.page.keyboard.press('r');
  await t.page.click('.catalog-item:has-text("Gaveteiro")');
  await t.clickWorld(11 * TILE + 8, 4 * TILE + 8);
  await t.page.keyboard.press('Escape');
  let db = await t.db();
  let gav = Object.values(db.furniture).find((f) => f.houseId === houseId && f.containerType === 'drawer');
  check(gav, 'gaveteiro não criado pelo catálogo');
  const pl = () => t.eval((fid) => Object.values(window.__pm.dbStore.getState().db.placements).find((p) => p.furnitureId === fid), gav.id);
  // renomear no painel de propriedades
  await t.eval((id) => window.__pm.ui.select(id), (await pl()).id);
  await t.page.dblclick('.reform-selected .inline-edit');
  await t.page.fill('.reform-selected .inline-input', 'Fichas da casa');
  await t.page.keyboard.press('Enter');
  // livros dentro
  await t.eval((fid) => window.__pm.exec('Livros', (d) => { for (const n of ['A', 'B', 'C']) window.__pm.ops.createBook(d, { title: n, furnitureId: fid }); }), gav.id);
  // mover com teclado e girar
  const before = await pl();
  await t.page.keyboard.press('ArrowLeft');
  await t.page.keyboard.press('ArrowDown');
  const after = await pl();
  check(after.x === before.x - 1 && after.y === before.y + 1, `setas não moveram o móvel (${JSON.stringify([before.x, before.y, after.x, after.y])})`);
  await t.page.click('text=⟳ Girar');
  check((await pl()).rot === 1, 'girar falhou');
  // trocar tipo sem perder conteúdo
  await t.page.selectOption('.reform-dock select:near(:text("Tipo"))', 'cabinet');
  db = await t.db();
  gav = db.furniture[gav.id];
  check(gav.name === 'Fichas da casa', 'renomear móvel falhou');
  check(gav.containerType === 'cabinet', 'troca de tipo falhou');
  check(Object.values(db.books).filter((b) => b.furnitureId === gav.id).length === 3, 'troca de tipo perdeu livros');
  // desfazer e refazer
  await t.page.keyboard.press('Control+z');
  check((await t.db()).furniture[gav.id].containerType === 'drawer', 'desfazer não voltou o tipo');
  await t.page.keyboard.press('Control+Shift+z');
  check((await t.db()).furniture[gav.id].containerType === 'cabinet', 'refazer falhou');
  // excluir exige destino dos livros
  await t.page.keyboard.press('Delete');
  check(await t.page.isVisible('text=Para onde eles vão?'), 'exclusão do móvel não pediu destino');
  await t.page.click('.choice:has-text("Deixar no chão da casa")');
  await t.page.click('.panel-foot >> text=Excluir móvel');
  db = await t.db();
  check(db.furniture[gav.id].trash, 'móvel não foi para a lixeira');
  check(Object.values(db.books).filter((b) => ['A', 'B', 'C'].includes(b.title) && !b.furnitureId && b.houseId === houseId).length === 3, 'livros não ficaram no chão da casa');
  // essenciais não podem ser removidos
  const desk = Object.values(db.placements).find((p) => p.scope === houseId && p.catalogId === 'desk');
  await t.eval((id) => window.__pm.ui.select(id), desk.id);
  check(await t.page.isDisabled('.reform-dock button:has-text("Remover")'), 'mesa de trabalho pode ser removida');
  await t.shot('04-reforma-interior');
  await t.ctx.close();
});

await scenario('decoração: inserir, duplicar, remover, quadro com imagem; layout persiste; restaurar padrão', async (open) => {
  const t = await open();
  await t.start('six');
  await t.reduceMotion();
  await t.page.keyboard.press('3');
  await t.place('house');
  const houseId = (await t.ui()).place.houseId;
  await t.page.keyboard.press('r');
  const count = async (cat) => (await t.eval(([h, c]) => Object.values(window.__pm.dbStore.getState().db.placements).filter((p) => p.scope === h && p.catalogId === c).length, [houseId, cat]));
  const plants0 = await count('plant');
  await t.page.click('.catalog-item:has-text("Planta")');
  await t.clickWorld(8 * TILE + 8, 6 * TILE + 8);
  check((await count('plant')) === plants0 + 1, 'planta não inserida');
  await t.page.keyboard.press('Escape');
  const plantId = await t.eval(([h]) => Object.values(window.__pm.dbStore.getState().db.placements).filter((p) => p.scope === h && p.catalogId === 'plant').sort((a, b) => b.createdAt - a.createdAt)[0].id, [houseId]);
  await t.eval((id) => window.__pm.ui.select(id), plantId);
  await t.page.keyboard.press('d');
  check((await count('plant')) === plants0 + 2, 'duplicar falhou');
  await t.page.keyboard.press('Delete');
  check((await count('plant')) === plants0 + 1, 'remover decoração falhou');
  // quadro com imagem do usuário
  await t.page.click('.catalog-item:has-text("Quadro")');
  await t.clickWorld(2 * TILE + 8, -20);
  await t.page.keyboard.press('Escape');
  const pic = await t.eval((h) => Object.values(window.__pm.dbStore.getState().db.placements).find((p) => p.scope === h && p.catalogId === 'picture'), houseId);
  check(pic, 'quadro não inserido na parede');
  await t.eval((id) => window.__pm.ui.select(id), pic.id);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP4z8DAwMDAxMDAwMDAAAANHQEDK+mmyAAAAABJRU5ErkJggg==', 'base64');
  await t.page.setInputFiles('.reform-dock input[type=file]', { name: 'foto.png', mimeType: 'image/png', buffer: png });
  await t.page.waitForFunction((id) => !!window.__pm.dbStore.getState().db.placements[id].imageId, pic.id);
  // a disposição sobrevive a fechar e reabrir o navegador
  const layout = await t.eval((h) => JSON.stringify(Object.values(window.__pm.dbStore.getState().db.placements).filter((p) => p.scope === h).map((p) => [p.id, p.x, p.y, p.rot, p.variant, p.color, p.imageId ?? null]).sort()), houseId);
  await t.reload();
  const layout2 = await t.eval((h) => JSON.stringify(Object.values(window.__pm.dbStore.getState().db.placements).filter((p) => p.scope === h).map((p) => [p.id, p.x, p.y, p.rot, p.variant, p.color, p.imageId ?? null]).sort()), houseId);
  check(layout === layout2, 'disposição mudou ao recarregar');
  const blob = await t.eval(async (id) => !!(await window.__pm.repo().getBlob(id)), pic.imageId ?? (await t.db()).placements[pic.id].imageId);
  check(blob, 'imagem do quadro não persistiu');
  // restaurar disposição inicial (com confirmação e desfazer)
  await t.eval((id) => window.__pm.ui.open({ type: 'house', id }), houseId);
  await t.page.click('text=Restaurar a disposição inicial');
  await t.page.click('.dialog button:has-text("Restaurar")');
  check((await count('picture')) === 0, 'restaurar não voltou ao padrão');
  await t.page.click('.toast >> text=Desfazer');
  check((await count('picture')) === 1, 'desfazer a restauração falhou');
  await t.shot('05-quadro');
  await t.ctx.close();
});

await scenario('modelos de livro: criar campos, livros, remover e recuperar dados', async (open) => {
  const t = await open();
  await t.start('six');
  await t.page.click('button[aria-label=Configurações]');
  await t.page.click('text=Modelos de livro');
  await t.page.fill('.panel .quick-add input', 'Fornecedor');
  await t.page.keyboard.press('Enter');
  const add = async (name, type) => {
    await t.page.fill('input[aria-label="Nome do novo campo"]', name);
    await t.page.selectOption('select[aria-label="Tipo do novo campo"]', type);
    await t.page.click('text=Adicionar campo');
  };
  await add('Especialidade', 'text');
  await add('Valor da visita', 'currency');
  await add('Atende em', 'multiselect');
  await add('Próxima revisão', 'date');
  let db = await t.db();
  const tpl = Object.values(db.templates).find((x) => x.name === 'Fornecedor');
  check(tpl.fields.map((f) => f.type).join() === 'text,currency,multiselect,date', 'campos não criados com os tipos certos');
  await t.page.fill('input[aria-label="Nova opção de Atende em"]', 'Sábado');
  await t.page.keyboard.press('Enter');
  // criar um livro a partir do modelo
  const shelf = await t.id('furniture', "x.name==='Manutenção'");
  await t.eval((id) => window.__pm.ui.open({ type: 'furniture', id }), shelf);
  await t.page.selectOption('select[aria-label="Modelo do novo livro"]', { label: 'Fornecedor' });
  await t.page.fill('.panel input[aria-label="Novo livro neste móvel"]', 'Seu Zé Encanador');
  await t.page.keyboard.press('Enter');
  await t.page.click('.spine:has-text("Seu Zé")');
  await t.page.fill('input[aria-label="Especialidade"]', 'Calhas e encanamento');
  await t.page.fill('input[aria-label="Valor da visita"]', '150,50');
  await t.page.click('button.chip:has-text("Sábado")');
  await t.page.locator('input[aria-label="Valor da visita"]').blur();
  await t.wait(500);
  db = await t.db();
  const b = Object.values(db.books).find((x) => x.title === 'Seu Zé Encanador');
  const f = Object.fromEntries(tpl.fields.map((x) => [x.name, x.id]));
  check(b.templateId === tpl.id, 'livro não usa o modelo');
  check(b.fields[f['Especialidade']] === 'Calhas e encanamento', 'campo de texto não salvo');
  check(b.fields[f['Valor da visita']] === 150.5, 'campo de moeda não salvo');
  check(Array.isArray(b.fields[f['Atende em']]) && b.fields[f['Atende em']].length === 1, 'opção múltipla não salva');
  // remover campo do modelo preserva os dados
  await t.eval((id) => window.__pm.ui.open({ type: 'templates', id }), tpl.id);
  await t.page.click('button[aria-label="Remover campo Especialidade"]');
  db = await t.db();
  check(db.templates[tpl.id].fields.find((x) => x.id === f['Especialidade']).hidden, 'campo não ficou oculto');
  check(db.books[b.id].fields[f['Especialidade']] === 'Calhas e encanamento', 'dados do campo removido foram apagados');
  check(await t.page.isVisible('text=Campos removidos (dados preservados)'), 'lista de campos removidos ausente');
  await t.page.click('.row:has-text("Especialidade") >> text=Recuperar');
  check(!(await t.db()).templates[tpl.id].fields.find((x) => x.id === f['Especialidade']).hidden, 'recuperar campo falhou');
  // remoção definitiva exige confirmação
  await t.page.click('button[aria-label="Remover campo Especialidade"]');
  await t.page.click('.row:has-text("Especialidade") >> text=Remover de vez');
  await t.page.click('.dialog button:has-text("Remover definitivamente")');
  db = await t.db();
  check(db.books[b.id].fields[f['Especialidade']] === undefined, 'remoção definitiva não apagou os dados');
  // excluir modelo exige destino
  await t.page.click('text=Excluir modelo…');
  check(await t.page.isVisible('text=Qual modelo eles passam a usar?'), 'exclusão de modelo não pediu destino');
  await t.page.click('.panel-foot >> text=Excluir modelo');
  db = await t.db();
  check(db.books[b.id].templateId === 'tpl_note', 'livros não passaram para Nota');
  check(db.books[b.id].blocks[0]?.text?.includes('Valor da visita: 150.5'), 'campos preenchidos não viraram texto');
  await t.ctx.close();
});

await scenario('páginas: inserir, editar, reordenar e remover blocos', async (open) => {
  const t = await open();
  await t.start('six');
  const shelf = await t.id('furniture', "x.name==='Ideias'");
  const bid = await t.eval((fid) => window.__pm.exec('Livro', (d) => window.__pm.ops.createBook(d, { title: 'Caderno de ideias', furnitureId: fid })), shelf);
  await t.eval((id) => window.__pm.ui.open({ type: 'book', id }), bid);
  await t.page.click('.add-block >> text=+ Título');
  await t.page.fill('.block-heading input', 'Projetos de 2027');
  await t.page.click('.add-block >> text=+ Texto');
  await t.page.fill('.block-text textarea', 'Uma horta no quintal.');
  await t.page.click('.add-block >> text=+ Tabela');
  await t.page.fill('input[aria-label="Linha 1, coluna 1"]', 'Item');
  await t.page.click('.add-block >> text=+ Link');
  await t.page.fill('.block-link input[aria-label="Endereço do link"]', 'https://exemplo.org');
  await t.page.locator('.block-link input[aria-label="Endereço do link"]').blur();
  await t.wait(500);
  let b = (await t.db()).books[bid];
  check(b.blocks.map((x) => x.type).join() === 'heading,text,table,link', `blocos fora de ordem: ${b.blocks.map((x) => x.type)}`);
  check(b.blocks[1].text === 'Uma horta no quintal.' && b.blocks[2].rows[0][0] === 'Item', 'edição de bloco não salva');
  await t.page.click('.block-text >> button[aria-label="Subir bloco"]');
  b = (await t.db()).books[bid];
  check(b.blocks[0].type === 'text', 'reordenar falhou');
  await t.page.click('.block-table >> button[aria-label="Remover bloco Tabela"]');
  b = (await t.db()).books[bid];
  check(b.blocks.length === 3 && !b.blocks.some((x) => x.type === 'table'), 'remover bloco falhou');
  await t.reload();
  b = (await t.db()).books[bid];
  check(b.blocks.length === 3 && b.blocks[0].text === 'Uma horta no quintal.', 'blocos não persistiram');
  await t.ctx.close();
});

await scenario('Correio: tarefa rápida, classificar, guardar, editar, concluir; índice de arrumação', async (open) => {
  const t = await open();
  await t.start('six');
  await t.reduceMotion();
  await t.page.keyboard.press('n');
  await t.page.fill('.capture input', 'Trocar a resistência do chuveiro');
  await t.page.keyboard.press('Enter');
  await t.page.keyboard.press('Escape');
  let db = await t.db();
  const task = Object.values(db.tasks).find((x) => x.title === 'Trocar a resistência do chuveiro');
  check(task && task.houseId === null, 'tarefa não entrou no Correio');
  check((await t.page.textContent('button[aria-label=Correio] .hud-badge')) === '1', 'contador do Correio não atualizou');
  await t.page.click('button[aria-label=Correio]');
  const lar = await t.id('houses', "x.name==='Lar'");
  await t.page.selectOption(`select[aria-label="Casa para ${task.title}"]`, lar);
  db = await t.db();
  check(db.tasks[task.id].houseId === lar, 'classificar por casa falhou');
  const tidy = () => t.eval((h) => window.__pm.sel.tidy(window.__pm.dbStore.getState().db, h), lar);
  check((await tidy()).loose === 1, 'tarefa classificada não aparece solta na casa');
  check(await t.page.isVisible('.world-label.house:has-text("Lar") .world-badge:has-text("▫ 1")'), 'selo de item solto ausente no exterior');
  // arrumar: guardar na mesa de trabalho
  await t.page.keyboard.press('Escape');
  await t.page.keyboard.press('2');
  await t.place('house');
  await t.page.click('.summary >> text=Arrumar um item');
  await t.page.click('.row.pick:has-text("Mesa de trabalho")');
  check((await tidy()).loose === 0 && (await tidy()).label === 'Esmerada', 'índice de arrumação não mudou ao guardar');
  // editar e concluir
  await t.eval((id) => window.__pm.ui.open({ type: 'task', id }), task.id);
  await t.page.selectOption('.panel select:near(:text("Prioridade"))', 'high');
  await t.page.fill('.panel input[type=date] >> nth=0', '2020-01-10');
  check((await t.page.textContent('.panel')).includes('Atrasada'), 'risco de atraso não sinalizado');
  await t.page.click('.segmented button:has-text("Concluída")');
  db = await t.db();
  check(db.tasks[task.id].status === 'done' && db.tasks[task.id].completedAt, 'concluir tarefa falhou');
  check(db.tasks[task.id].priority === 'high', 'prioridade não salva');
  await t.page.click('text=Mesa de trabalho >> nth=0').catch(() => {});
  await t.eval((h) => window.__pm.ui.open({ type: 'chest', houseId: h }), lar);
  check(await t.page.isVisible('.panel >> text=Trocar a resistência do chuveiro'), 'tarefa concluída não aparece no baú');
  await t.ctx.close();
});

await scenario('arrastar item solto do chão até a estante', async (open) => {
  const t = await open();
  await t.start('six');
  await t.reduceMotion();
  const lar = await t.id('houses', "x.name==='Lar'");
  await t.eval((h) => window.__pm.exec('Solto', (d) => window.__pm.ops.createBook(d, { title: 'Nota fiscal da geladeira', houseId: h })), lar);
  await t.page.keyboard.press('2');
  await t.place('house');
  const pos = await t.eval(() => {
    const scene = window.__pm.game.scene.getScene('house');
    const [v] = [...scene.loose.values()];
    const cam = scene.cameras.main;
    const r = window.__pm.game.canvas.getBoundingClientRect();
    const target = [...scene.views.values()].find((x) => x.placement.furnitureId && window.__pm.dbStore.getState().db.furniture[x.placement.furnitureId].name === 'Documentos');
    const b = target.sprite.getBounds();
    const toScreen = (x, y) => ({ x: r.left + (x - cam.worldView.x) * cam.zoom, y: r.top + (y - cam.worldView.y) * cam.zoom });
    return { from: toScreen(v.sprite.x + 8, v.sprite.y - 6), to: toScreen(b.centerX, b.centerY) };
  });
  await t.page.mouse.move(pos.from.x, pos.from.y);
  await t.page.mouse.down();
  await t.page.mouse.move(pos.from.x + 20, pos.from.y - 20, { steps: 4 });
  await t.page.mouse.move(pos.to.x, pos.to.y, { steps: 12 });
  await t.wait(150);
  await t.page.mouse.up();
  await t.wait(300);
  const db = await t.db();
  const b = Object.values(db.books).find((x) => x.title === 'Nota fiscal da geladeira');
  check(db.furniture[b.furnitureId]?.name === 'Documentos', 'arrastar até o móvel não guardou o livro');
  await t.ctx.close();
});

await scenario('lixeira: excluir e restaurar ao endereço original', async (open) => {
  const t = await open();
  await t.start('six');
  const shelf = await t.id('furniture', "x.name==='Contas'");
  const bid = await t.eval((fid) => window.__pm.exec('Livro', (d) => window.__pm.ops.createBook(d, { title: 'Conta de água', furnitureId: fid })), shelf);
  await t.eval((id) => window.__pm.ui.open({ type: 'book', id }), bid);
  await t.page.click('.panel button[aria-label="Ações do livro"]');
  await t.page.click('.menu-list >> text=Excluir');
  check((await t.db()).books[bid].trash, 'livro não foi para a lixeira');
  check(!(await t.eval(() => window.__pm.search(window.__pm.dbStore.getState().db, 'conta de agua').length)), 'livro excluído aparece na busca');
  await t.page.click('button[aria-label=Configurações]');
  await t.page.click('text=Lixeira');
  check(await t.page.isVisible('.panel >> text=Conta de água'), 'lixeira não lista o livro');
  check(await t.page.isVisible('.panel >> text=some em 30 dias'), 'prazo de 30 dias não exibido');
  await t.page.click('.row:has-text("Conta de água") >> text=Restaurar');
  const db = await t.db();
  check(!db.books[bid].trash && db.books[bid].furnitureId === shelf, 'restaurar não devolveu ao endereço original');
  await t.ctx.close();
});

await scenario('Observatório: constelação, objetivo, traçar caminho e progresso calculado', async (open) => {
  const t = await open();
  await t.start('six');
  await t.reduceMotion();
  await t.page.keyboard.press('o');
  await t.place('observatory');
  await t.page.click('.summary >> text=+ Novo objetivo');
  await t.page.fill('input[aria-label="Nova constelação"]', 'Ano de 2027');
  await t.page.keyboard.press('Enter');
  await t.page.fill('input[aria-label="Novo objetivo em Ano de 2027"]', 'Correr 10 km');
  await t.page.keyboard.press('Enter');
  let db = await t.db();
  const g = Object.values(db.goals).find((x) => x.title === 'Correr 10 km');
  check(g && db.constellations[g.constellationId].name === 'Ano de 2027', 'objetivo não criado na constelação');
  check(await t.page.isVisible('text=◌ Sem caminho'), 'estrela sem caminho não sinalizada');
  await t.page.click('.segmented button:has-text("Este trimestre")');
  await t.page.selectOption('select[aria-label="Casa do novo projeto"]', { label: 'Ginásio' });
  await t.page.fill('input[aria-label="Novo projeto para este objetivo"]', 'Plano de treino');
  await t.page.keyboard.press('Enter');
  db = await t.db();
  const p = Object.values(db.books).find((x) => x.title === 'Plano de treino');
  check(p && p.project && db.goals[g.id].projectIds.includes(p.id), 'traçar caminho não criou e ligou o projeto');
  check(db.houses[p.houseId].name === 'Ginásio', 'projeto não foi para a casa escolhida');
  await t.eval((pid) => window.__pm.exec('Tarefas', (d) => { const ids = ['Semana 1', 'Semana 2', 'Semana 3', 'Semana 4'].map((title) => window.__pm.ops.createTask(d, { title, bookId: pid })); window.__pm.ops.updateTask(d, ids[0], { status: 'done' }); }), p.id);
  const prog = await t.eval((id) => window.__pm.sel.goalProgress(window.__pm.dbStore.getState().db, window.__pm.dbStore.getState().db.goals[id]), g.id);
  check(Math.abs(prog.ratio - 0.25) < 1e-9 && prog.state === 'active', `progresso do objetivo incorreto: ${JSON.stringify(prog)}`);
  check(await t.page.isVisible('.panel >> text=25%'), 'progresso não exibido');
  await t.page.click('.panel button[aria-label="Ações do objetivo"]');
  await t.page.click('.menu-list >> text=Deixar adormecer');
  check((await t.db()).goals[g.id].dormant, 'adormecer falhou');
  await t.shot('06-ceu');
  await t.ctx.close();
});

await scenario('Mesa do Dia, busca universal com viagem e Ronda semanal', async (open) => {
  const t = await open();
  await t.start('six');
  await t.reduceMotion();
  const today = new Date().toISOString().slice(0, 10);
  await t.eval((today) => {
    const { exec, ops, dbStore } = window.__pm;
    const db = () => dbStore.getState().db;
    const F = (n) => Object.values(db().furniture).find((f) => f.name === n).id;
    const H = (n) => Object.values(db().houses).find((h) => h.name === n).id;
    exec('seed', (d) => {
      const tpl = ops.createTemplate(d, { name: 'Médico' });
      const fid = ops.addField(d, tpl, { name: 'Especialidade', type: 'text' });
      const b = ops.createBook(d, { title: 'Dra. Helena', templateId: tpl, furnitureId: F('Consultas') });
      ops.setBookField(d, b, fid, 'Dermatologia');
      ops.createTask(d, { title: 'Hoje mesmo', houseId: H('Lar'), dueDate: today });
      ops.createTask(d, { title: 'Já passou', houseId: H('Oficina'), dueDate: '2020-01-01', priority: 'critical' });
      const w = ops.createTask(d, { title: 'Esperando o pedreiro', houseId: H('Lar') });
      ops.updateTask(d, w, { status: 'waiting' });
      ops.createTask(d, { title: 'Solta no correio' });
    });
  }, today);
  await t.page.keyboard.press('m');
  const text = await t.page.textContent('.panel');
  for (const s of ['Hoje', 'Próximos sete dias', 'Atrasadas', 'Urgentes', 'Em andamento', 'Aguardando terceiros', 'Concluídas']) check(text.includes(s), `Mesa do Dia sem a seção ${s}`);
  check(text.includes('Hoje mesmo') && text.includes('Já passou') && text.includes('Esperando o pedreiro'), 'Mesa do Dia sem as tarefas');
  check(text.includes('Oficina › Chão'), 'Mesa do Dia sem endereço');
  // filtro por casa
  await t.page.selectOption('select[aria-label="Filtrar por casa"]', { label: 'Lar' });
  check(!(await t.page.textContent('.panel')).includes('Já passou'), 'filtro por casa não funcionou');
  // ir até lá
  await t.page.click('.task-row:has-text("Hoje mesmo") >> button.go');
  await t.place('house');
  check((await t.ui()).panels.some((p) => p.type === 'task'), 'ir até lá não abriu a tarefa');
  // busca pelos campos de modelo personalizado, com endereço e viagem
  await t.page.keyboard.press('Escape');
  await t.page.keyboard.press('Escape');
  await t.page.keyboard.press('/');
  await t.page.fill('.search-box input', 'dermato');
  await t.wait(200);
  const r = await t.page.textContent('.search-results');
  check(r.includes('Dra. Helena') && r.includes('Ginásio › Consultas › Dra. Helena') && r.includes('Médico'), `resultado sem endereço/tipo: ${r}`);
  await t.page.keyboard.press('Enter');
  await t.place('house');
  const ui = await t.ui();
  const db = await t.db();
  check(db.houses[ui.place.houseId].name === 'Ginásio', 'a busca não levou à casa do livro');
  check(ui.panels.some((p) => p.type === 'book'), 'a busca não abriu o livro');
  // Ronda semanal
  await t.page.keyboard.press('m');
  await t.page.click('text=Ronda semanal');
  check(await t.page.isVisible('.panel >> text=Correio'), 'Ronda não começa pelo Correio');
  await t.page.click('.ronda-item:has-text("Solta no correio") >> text=Arquivar');
  check(Object.values((await t.db()).tasks).find((x) => x.title === 'Solta no correio').status === 'archived', 'arquivar na Ronda falhou');
  for (let i = 0; i < 8; i++) {
    const next = t.page.locator('.panel-foot button:has-text("Próxima")');
    if (!(await next.count())) break;
    await next.click();
    if ((await t.page.textContent('.panel')).includes('Já passou')) {
      await t.page.click('.ronda-item:has-text("Já passou") >> text=Adiar uma semana');
      const due = Object.values((await t.db()).tasks).find((x) => x.title === 'Já passou').dueDate;
      check(due > today, 'adiar na Ronda falhou');
    }
  }
  check(await t.page.isVisible('text=Semana que passou'), 'Ronda não termina com a semana');
  await t.page.click('.panel-foot >> text=Concluir');
  await t.ctx.close();
});

await scenario('exportar e importar todos os dados', async (open) => {
  const t = await open();
  await t.start('six', 'Recanto Exportado');
  const lar = await t.id('houses', "x.name==='Lar'");
  await t.eval((h) => {
    const { exec, ops } = window.__pm;
    exec('seed', (d) => {
      const tpl = ops.createTemplate(d, { name: 'Receita' });
      ops.addField(d, tpl, { name: 'Tempo', type: 'number' });
      ops.createBook(d, { title: 'Pão de queijo', templateId: tpl, houseId: h });
      ops.placeObject(d, { scope: h, catalogId: 'globe', x: 12, y: 6 });
    });
  }, lar);
  await t.eval(async () => {
    await window.__pm.repo().putBlob({ id: 'anx_teste', mime: 'text/plain', data: new TextEncoder().encode('conteúdo do anexo').buffer });
    window.__pm.exec('Anexo', (d) => window.__pm.ops.addAttachment(d, { id: 'anx_teste', name: 'nota.txt', mime: 'text/plain', size: 17 }));
  });
  await t.page.click('button[aria-label=Configurações]');
  const [download] = await Promise.all([t.page.waitForEvent('download'), t.page.click('text=Exportar backup')]);
  const file = path.join(root, 'e2e', 'backup-teste.json');
  await download.saveAs(file);
  await t.ctx.close();

  const u = await open();
  await u.start('zero', 'Outro');
  await u.page.click('button[aria-label=Configurações]');
  await u.page.setInputFiles('input[aria-label="Arquivo de backup"]', file);
  await u.page.click('.dialog button:has-text("Substituir e importar")');
  await u.page.waitForFunction(() => window.__pm.dbStore.getState().db.meta.world.name === 'Recanto Exportado');
  await u.reload();
  const db = await u.db();
  check(Object.values(db.houses).length === 6, 'casas não importadas');
  check(Object.values(db.templates).some((x) => x.name === 'Receita' && x.fields[0].name === 'Tempo'), 'modelos não importados');
  check(Object.values(db.placements).some((p) => p.catalogId === 'globe' && p.x === 12 && p.y === 6), 'layout não importado');
  const text = await u.eval(async () => new TextDecoder().decode((await window.__pm.repo().getBlob('anx_teste')).data));
  check(text === 'conteúdo do anexo', 'anexo não importado');
  const { unlinkSync } = await import('node:fs');
  unlinkSync(file);
  await u.ctx.close();
});

await scenario('Obsidian: ligar a pasta, criar notas, editar nos dois lados e resolver conflito sem perda', async (open) => {
  const t = await open();
  await t.start('six');
  await t.reduceMotion();
  const lar = await t.id('houses', "x.name==='Lar'");
  const shelf = await t.id('furniture', "x.name==='Documentos'");
  const bid = await t.eval(([f]) => window.__pm.exec('Livro', (d) => {
    const id = window.__pm.ops.createBook(d, { title: 'Contrato de aluguel', templateId: 'tpl_contract', furnitureId: f });
    window.__pm.ops.setBookField(d, id, 'c_party', 'Imobiliária Sol');
    window.__pm.ops.addBlock(d, id, 'text', undefined, { text: 'Reajuste anual pelo IGP-M.' });
    return id;
  }), [shelf]);
  // pasta virtual (a mesma API da pasta real do computador)
  await t.eval(async () => {
    const root = await navigator.storage.getDirectory();
    try { await root.removeEntry('vault-e2e', { recursive: true }); } catch {}
    window.__vh = await root.getDirectoryHandle('vault-e2e', { create: true });
  });
  const read = (p) => t.eval(async (path) => {
    let cur = window.__vh;
    const parts = path.split('/');
    for (const seg of parts.slice(0, -1)) cur = await cur.getDirectoryHandle(seg);
    return (await (await cur.getFileHandle(parts.at(-1))).getFile()).text();
  }, p);
  const write = (p, text) => t.eval(async ([path, body]) => {
    let cur = window.__vh;
    const parts = path.split('/');
    for (const seg of parts.slice(0, -1)) cur = await cur.getDirectoryHandle(seg, { create: true });
    const w = await (await cur.getFileHandle(parts.at(-1), { create: true })).createWritable();
    await w.write(body); await w.close();
  }, [p, text]);
  /** Sincroniza e espera de verdade: se já houver uma em andamento, tenta de novo. */
  const sync = async () => {
    for (let i = 0; i < 20; i++) {
      if (await t.eval(() => window.__pm.vault.syncNow().then((r) => !!r))) return;
      await t.wait(400);
    }
    throw new Fail('a sincronização não terminou');
  };
  await t.page.click('button[aria-label=Configurações]');
  await t.page.click('.panel >> text=Obsidian');
  check(await t.page.isVisible('text=Escolher a pasta do Obsidian'), 'painel do Obsidian sem o botão de escolher a pasta');
  await t.eval(() => window.__pm.vault.connectHandle(window.__vh, 'Meu Vault'));
  await t.page.waitForSelector('text=Conectado');
  const path = '10 - Áreas da Vida/Lar/Documentos/Contrato de aluguel.md';
  let md = await read(path);
  check(md.includes(`recanto_id: ${bid}`) && md.includes('tipo: Contrato') && md.includes('Com quem: Imobiliária Sol') && md.includes('Reajuste anual pelo IGP-M.'), 'nota criada incorretamente');
  check((await read('90 - Sistema/Recanto/ÍNDICE.md')).includes('[[Contrato de aluguel]]'), 'índice ausente');
  check(await t.page.isVisible('.panel >> text=nota(s) criada(s)'), 'relatório da sincronização não exibido');
  await t.shot('08-obsidian');
  // edição no Obsidian → Recanto (pela interface: Sincronizar agora)
  await write(path, md.replace('Reajuste anual pelo IGP-M.', 'Reajuste anual pelo IPCA.\n\n- [ ] Assinar aditivo').replace('Com quem: Imobiliária Sol', 'Com quem: Imobiliária Lua'));
  const before = await t.eval(() => window.__pm.vault.vaultStore.getState().lastSync);
  await t.page.click('.panel >> text=Sincronizar agora');
  await t.page.waitForFunction((b) => window.__pm.vault.vaultStore.getState().lastSync > b, before, { timeout: 15000 });
  let db = await t.db();
  check(db.books[bid].fields['c_party'] === 'Imobiliária Lua', 'campo editado no Obsidian não chegou ao Recanto');
  check(db.books[bid].blocks.map((b) => b.type).join() === 'text,checklist', 'blocos editados no Obsidian não chegaram');
  // edição no Recanto → Obsidian
  await t.eval(([id]) => window.__pm.exec('Edita', (d) => window.__pm.ops.addBlock(d, id, 'heading', undefined, { text: 'Anexos' })), [bid]);
  await sync();
  md = await read(path);
  check(md.includes('## Anexos'), 'edição do Recanto não chegou ao Obsidian');
  // conflito: os dois lados mudam
  await write(path, md.replace('Reajuste anual pelo IPCA.', 'TEXTO DO OBSIDIAN'));
  await t.eval(([id]) => window.__pm.exec('Edita', (d) => window.__pm.ops.updateBlock(d, id, window.__pm.dbStore.getState().db.books[id].blocks[0].id, { text: 'TEXTO DO RECANTO' })), [bid]);
  await sync();
  db = await t.db();
  const first = db.books[bid].blocks[0];
  check(first.text === 'TEXTO DO OBSIDIAN', 'em conflito, a versão do Obsidian deveria vencer');
  const report = await t.eval(() => window.__pm.vault.vaultStore.getState().report);
  check(report.conflicts.length === 1, 'conflito não registrado');
  check((await read(report.conflicts[0].copyPath)).includes('TEXTO DO RECANTO'), 'a versão do Recanto não foi guardada na cópia de conflito');
  await t.page.waitForSelector('.panel >> text=Conflitos (nada foi perdido)');
  // nota nova criada no Obsidian vira livro no Correio
  await write('00 - Caixa de Entrada/Ideia vinda do Obsidian.md', 'Comprar um caderno novo.\n\n- [ ] Pesquisar preços');
  await sync();
  db = await t.db();
  const novo = Object.values(db.books).find((b) => b.title === 'Ideia vinda do Obsidian');
  check(novo && novo.houseId === null && novo.blocks.length === 2, 'nota nova do Obsidian não virou livro no Correio');
  check((await read('00 - Caixa de Entrada/Ideia vinda do Obsidian.md')).includes(`recanto_id: ${novo.id}`), 'recanto_id não foi acrescentado à nota nova');
  // o livro mostra o atalho para abrir no Obsidian
  await t.eval((id) => window.__pm.ui.open({ type: 'book', id }), bid);
  check(await t.page.isVisible('.panel >> text=Abrir no Obsidian'), 'livro sem o atalho para o Obsidian');
  const href = await t.page.getAttribute('.panel a:has-text("Abrir no Obsidian")', 'href');
  check(href.startsWith('obsidian://open?vault=Meu%20Vault&file=10%20-%20%C3%81reas'), `link do Obsidian incorreto: ${href}`);
  // a configuração do Vault fica gravada no Recanto (a pasta em si fica no IndexedDB do navegador;
  // recarregar com uma pasta virtual derruba o Chromium sem interface, então isso não é exercitado aqui)
  check((await t.eval(() => window.__pm.dbStore.getState().db.meta.world.vault.name)) === 'Meu Vault', 'configuração do Vault não gravada');
  const keys = await t.eval(async () => { const db = await new Promise((r) => { const q = indexedDB.open('palacio-mental'); q.onsuccess = () => r(q.result); }); const n = await new Promise((r) => { const q = db.transaction('handles').objectStore('handles').count(); q.onsuccess = () => r(q.result); }); db.close(); return n; });
  check(keys === 1, 'a pasta ligada não foi guardada no navegador');
  await t.ctx.close();
});

await scenario('conexões entre livros e Mapa de Conexões', async (open) => {
  const t = await open();
  await t.start('six');
  await t.reduceMotion();
  const ids = await t.eval(() => {
    const { exec, ops, dbStore } = window.__pm;
    const F = (n) => Object.values(dbStore.getState().db.furniture).find((f) => f.name === n).id;
    return exec('seed', (d) => {
      const a = ops.createBook(d, { title: 'Projeto de expansão', templateId: 'tpl_project', furnitureId: F('Projetos') });
      const b = ops.createBook(d, { title: 'Fornecedor Alfa', furnitureId: F('Equipes') });
      const c = ops.createBook(d, { title: 'Reunião de kickoff', furnitureId: F('Reuniões') });
      ops.addBlock(d, a, 'bookref', undefined, { bookId: b });
      ops.addBlock(d, c, 'text', undefined, { text: 'Seguimos com [[Projeto de expansão]].' });
      return [a, b, c];
    });
  });
  await t.eval((id) => window.__pm.ui.open({ type: 'book', id }), ids[0]);
  check(await t.page.isVisible('.panel >> text=Este livro cita'), 'seção de conexões sem os links de saída');
  check(await t.page.isVisible('.panel >> text=Citado por'), 'seção de conexões sem os backlinks');
  await t.page.click('.panel >> text=Ver no mapa');
  await t.page.waitForSelector('svg.graph');
  check((await t.page.locator('svg.graph g.node').count()) === 3, 'o mapa deveria mostrar 3 livros');
  check((await t.page.locator('svg.graph line.edge').count()) === 2, 'o mapa deveria mostrar 2 conexões');
  await t.shot('09-mapa');
  await t.page.click('svg.graph g.node:has-text("Fornecedor Alfa")');
  check(await t.page.isVisible('.panel-title >> text=Fornecedor Alfa'), 'clicar no nó não abriu o livro');
  // renomear mantém os links
  await t.eval(([id]) => window.__pm.exec('Renomear', (d) => window.__pm.ops.updateBook(d, id, { title: 'Projeto Expansão 2027' })), [ids[0]]);
  const db = await t.db();
  const bl = db.books[ids[2]].blocks[0];
  check(bl.text.includes('[[Projeto Expansão 2027]]'), 'renomear não atualizou o [[link]]');
  await t.ctx.close();
});

await scenario('tarefas que se repetem e cópias automáticas', async (open) => {
  const t = await open();
  await t.start('six');
  await t.reduceMotion();
  const tid = await t.eval(() => window.__pm.exec('Tarefa', (d) => window.__pm.ops.createTask(d, { title: 'Regar as plantas', dueDate: new Date().toISOString().slice(0, 10) })));
  await t.eval((id) => window.__pm.ui.open({ type: 'task', id }), tid);
  await t.page.selectOption('select[aria-label="Repetição"]', 'week');
  check((await t.db()).tasks[tid].repeat?.every === 'week', 'repetição não salva');
  await t.page.click('.segmented button:has-text("Concluída")');
  const tasks = Object.values((await t.db()).tasks).filter((x) => x.title === 'Regar as plantas');
  check(tasks.length === 2, 'a próxima ocorrência não foi criada');
  const next = tasks.find((x) => x.status === 'pending');
  check(next.repeat?.every === 'week' && next.dueDate > new Date().toISOString().slice(0, 10), 'a próxima ocorrência deveria repetir e ser futura');
  // cópias automáticas: uma ao abrir, restaurar volta ao estado anterior
  await t.page.click('button[aria-label=Configurações]');
  check(await t.page.isVisible('.panel >> text=Cópias de segurança'), 'seção de cópias ausente');
  await t.page.click('text=Fazer uma cópia agora');
  await t.eval(() => window.__pm.exec('Mudança', (d) => window.__pm.ops.createBook(d, { title: 'Livro depois da cópia' })));
  await t.page.click('.row:has-text("manual") >> text=Restaurar');
  await t.page.click('.dialog button:has-text("Restaurar")');
  await t.page.waitForFunction(() => !Object.values(window.__pm.dbStore.getState().db.books).some((b) => b.title === 'Livro depois da cópia'));
  check(!!(await t.db()).tasks[tid], 'restaurar perdeu dados anteriores à cópia');
  await t.ctx.close();
});

await scenario('celular: criar e editar conteúdo em tela pequena', async (open) => {
  const t = await open({ width: 390, height: 844 }, { hasTouch: true, isMobile: true });
  await t.start('six');
  await t.reduceMotion();
  await t.page.click('button[aria-label=Correio]');
  await t.page.fill('.panel .quick-add input', 'Comprar ração');
  await t.page.keyboard.press('Enter');
  await t.page.click('.task-row:has-text("Comprar ração") .row-main');
  await t.page.fill('.panel textarea[aria-label="Descrição"]', 'A do saco azul');
  await t.page.locator('.panel textarea[aria-label="Descrição"]').blur();
  await t.page.click('.panel button[aria-label="Ações da tarefa"]');
  await t.page.click('.menu-list >> text=Guardar em…');
  await t.page.click('.panel .chip:has-text("Lar")');
  await t.page.click('.row.pick:has-text("Mesa de trabalho")');
  const db = await t.db();
  const task = Object.values(db.tasks).find((x) => x.title === 'Comprar ração');
  check(task.description === 'A do saco azul' && task.onDesk, 'edição no celular falhou');
  const box = await t.page.locator('.hud-top-right').boundingBox();
  check(box.width <= 390, 'barra do HUD estoura a largura do celular');
  const overflow = await t.eval(() => document.documentElement.scrollWidth > window.innerWidth);
  check(!overflow, 'rolagem horizontal no celular');
  await t.shot('07-celular');
  await t.ctx.close();
});

// ─────────────────────────────────────────────────────────────

await browser.close();
await server.close();
const critical = consoleErrors.filter((e) => !/favicon|ReadPixels|DevTools/i.test(e));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} cenários aprovados.`);
if (critical.length) console.log(`Erros no console (${critical.length}):\n  ${[...new Set(critical)].slice(0, 10).join('\n  ')}`);
writeFileSync(path.join(root, 'e2e', 'last-run.json'), JSON.stringify({ at: new Date().toISOString(), results, consoleErrors: critical }, null, 2));
process.exit(failed.length || critical.length ? 1 : 0);
