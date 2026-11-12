import { produce } from 'immer';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderIndex, syncVault, type SyncDeps, type SyncReport } from '@/integrations/obsidian/sync';
import { hashText, parseBlocks, parseNote, renderNote, sanitizeName } from '@/integrations/obsidian/markdown';
import { MemoryVault } from '@/integrations/obsidian/vault';
import { emitEntry, parseYaml, splitFrontmatter } from '@/integrations/obsidian/yaml';
import * as ops from '@/domain/ops';
import { outLinks } from '@/domain/links';
import { emptyDb, type Db, type ID } from '@/domain/types';

const NOW = new Date(2026, 10, 12, 9, 30).getTime();
let db: Db;
let vault: MemoryVault;
let blobs: Map<ID, { id: ID; mime: string; data: ArrayBuffer }>;
let t = NOW;

function run<T>(fn: (d: Db) => T): T {
  let out!: T;
  db = produce(db, (d) => {
    out = fn(d as Db);
  });
  return out;
}
const deps = (): SyncDeps => ({
  vault,
  getDb: () => db,
  commit: (_l, fn) => {
    db = produce(db, (d) => fn(d as Db));
  },
  getBlob: async (id) => blobs.get(id),
  putBlob: async (b) => void blobs.set(b.id, b),
  now: () => t,
});
const sync = (): Promise<SyncReport> => syncVault(deps());
const house = (n: string) => Object.values(db.houses).find((h) => h.name === n)!;
const shelf = (h: string, n: string) => Object.values(db.furniture).find((f) => f.houseId === house(h).id && f.name === n)!;
const book = (title: string) => Object.values(db.books).find((b) => b.title === title)!;

beforeEach(() => {
  ops.clock.now = () => NOW;
  t = NOW;
  db = emptyDb();
  vault = new MemoryVault('Meu Vault');
  blobs = new Map();
  run((d) => ops.initWorld(d));
  run((d) => ops.completeOnboarding(d, { name: 'Recanto', mode: 'six' }));
});

describe('YAML', () => {
  it('lê e escreve textos, números, datas e listas, e preserva o que não conhece', () => {
    const text = '---\nrecanto_id: lv_1\ntags:\n  - a\n  - b c\nfoo: "x: y"\nvalor: 12.5\ncomplexo:\n  chave: 1\nlista: [um, "dois, três"]\n---\ncorpo';
    const { yaml, body } = splitFrontmatter(text);
    expect(body).toBe('corpo');
    const e = parseYaml(yaml!);
    const get = (k: string) => e.find((x) => x.key === k);
    expect(get('recanto_id')!.value).toBe('lv_1');
    expect(get('tags')!.value).toEqual(['a', 'b c']);
    expect(get('foo')!.value).toBe('x: y');
    expect(get('valor')!.value).toBe(12.5);
    expect(get('complexo')!.value).toBeUndefined();
    expect(get('complexo')!.raw).toHaveLength(2);
    expect(get('lista')!.value).toEqual(['um', 'dois, três']);
    expect(emitEntry('Nome', 'Ana')).toEqual(['Nome: Ana']);
    expect(emitEntry('Tel', '(11) 98888-1234')).toEqual(['Tel: "(11) 98888-1234"']);
    expect(emitEntry('Data', '2026-11-12')).toEqual(['Data: 2026-11-12']);
    expect(emitEntry('L', ['[x] a'])).toEqual(['L:', '  - "[x] a"']);
    expect(emitEntry('Vazio', null)).toEqual(['Vazio:']);
    expect(sanitizeName('Contrato: 2026/11 *novo*?')).toBe('Contrato- 2026-11 -novo--');
  });
});

describe('livro → nota → livro', () => {
  it('blocos de todos os tipos sobrevivem ao ciclo completo', () => {
    const b = run((d) => ops.createBook(d, { title: 'Projeto X', furnitureId: shelf('Oficina', 'Projetos').id }));
    const other = run((d) => ops.createBook(d, { title: 'Fornecedor Y', furnitureId: shelf('Oficina', 'Equipes').id }));
    run((d) => {
      ops.addBlock(d, b, 'heading', undefined, { text: 'Objetivo' });
      ops.addBlock(d, b, 'text', undefined, { text: 'Primeira linha\nsegunda linha' });
      ops.addBlock(d, b, 'checklist', undefined, { items: [{ id: 'a', text: 'Levantar', done: true }, { id: 'b', text: 'Orçar', done: false }] });
      ops.addBlock(d, b, 'link', undefined, { url: 'https://exemplo.org/a b', label: 'Site' });
      ops.addBlock(d, b, 'table', undefined, { rows: [['Item', 'Valor'], ['A | B', '10']] });
      ops.addBlock(d, b, 'date', undefined, { date: '2026-12-01', label: 'Entrega' });
      ops.addBlock(d, b, 'bookref', undefined, { bookId: other });
    });
    const r1 = renderNote(db, db.books[b], { attachmentPath: () => null, now: NOW });
    expect(r1.text).toContain('- [x] Levantar');
    expect(r1.text).toContain('| Item | Valor |\n| --- | --- |');
    expect(r1.text).toContain('[[Fornecedor Y]]');
    const parsed = parseNote(r1.text);
    const blocks = parseBlocks(parsed.body.replace(/^\s*# .*\n/, ''), { resolveBook: (title) => (title === 'Fornecedor Y' ? other : null), resolveAttachment: () => null }, null);
    expect(blocks.map((x) => x.type)).toEqual(['heading', 'text', 'checklist', 'link', 'table', 'date', 'bookref']);
    run((d) => {
      d.books[b].blocks = blocks;
    });
    const r2 = renderNote(db, db.books[b], { attachmentPath: () => null, now: NOW });
    expect(r2.content).toBe(r1.content);
  });
});

describe('sincronização com o Vault', () => {
  it('cria as notas nas pastas certas, com propriedades e índice', async () => {
    const tpl = 'tpl_person';
    const b = run((d) => ops.createBook(d, { title: 'Dra. Helena', templateId: tpl, furnitureId: shelf('Hospedaria', 'Pessoas').id }));
    run((d) => {
      ops.setBookField(d, b, 'p_phone', '(11) 98888-1234');
      ops.setBookField(d, b, 'p_birthday', '2026-11-20');
      ops.setBookField(d, b, 'p_relation', 'p_relation_o2');
    });
    run((d) => ops.createBook(d, { title: 'Ideia solta' }));
    const r = await sync();
    expect(r.created).toBe(2);
    const path = '10 - Áreas da Vida/Hospedaria/Pessoas/Dra. Helena.md';
    const text = vault.text(path)!;
    expect(text).toContain(`recanto_id: ${b}`);
    expect(text).toContain('tipo: Pessoa');
    expect(text).toContain('casa: Hospedaria');
    expect(text).toContain('movel: Pessoas');
    expect(text).toContain('Telefone: "(11) 98888-1234"');
    expect(text).toContain('Aniversário: 2026-11-20');
    expect(text).toContain('Relação: Trabalho');
    expect(text).toContain('# Dra. Helena');
    expect(vault.text('00 - Caixa de Entrada/Ideia solta.md')).toContain('casa: Correio');
    expect(vault.text('90 - Sistema/Recanto/ÍNDICE.md')).toContain('[[Dra. Helena]] — Pessoa');
    expect(vault.text('90 - Sistema/Recanto/LEIA-ME para agentes de IA.md')).toContain('recanto_id');
    expect(db.books[b].note!.path).toBe(path);
  });

  it('é idempotente: sincronizar de novo não muda nada', async () => {
    run((d) => ops.createBook(d, { title: 'A', furnitureId: shelf('Lar', 'Documentos').id }));
    await sync();
    const snapshot = new Map([...vault.files].map(([p, f]) => [p, f.mtime]));
    t += 60000;
    const r = await sync();
    expect(r).toMatchObject({ created: 0, exported: 0, imported: 0, moved: 0, newNotes: 0 });
    expect(r.conflicts).toHaveLength(0);
    expect(new Map([...vault.files].map(([p, f]) => [p, f.mtime]))).toEqual(snapshot);
  });

  it('traz para o Recanto o que foi editado no Obsidian, sem reformatar o arquivo do usuário', async () => {
    const b = run((d) => ops.createBook(d, { title: 'Contrato', templateId: 'tpl_contract', furnitureId: shelf('Lar', 'Documentos').id }));
    await sync();
    const path = db.books[b].note!.path;
    const edited = vault.text(path)!
      .replace('Valor:', 'Valor: 2350\nVALOR_ANTIGO:')
      .replace(/\n# Contrato\n/, '\n# Contrato\n\n### Cláusulas\n\nPagamento no dia 5.\n\n- [ ] Assinar\n- [x] Reconhecer firma\n')
      .replace('Com quem:', 'tags:\n  - importante\nCom quem: Imobiliária Sol\nANTIGO:');
    vault.put(path, edited);
    t += 60000;
    const r = await sync();
    expect(r.imported).toBe(1);
    const nb = db.books[b];
    expect(nb.fields['c_value']).toBe(2350);
    expect(nb.fields['c_party']).toBe('Imobiliária Sol');
    expect(nb.blocks.map((x) => x.type)).toEqual(['heading', 'text', 'checklist']);
    expect(nb.blocks[2].type === 'checklist' && nb.blocks[2].items.map((i) => i.done)).toEqual([false, true]);
    // o arquivo do usuário não foi reformatado
    expect(vault.text(path)).toContain('### Cláusulas');
    // e a próxima sincronização não vê mais nada para fazer
    t += 60000;
    expect(await sync()).toMatchObject({ imported: 0, exported: 0, created: 0, moved: 0 });
  });

  it('leva para o Vault o que mudou no Recanto e preserva propriedades desconhecidas', async () => {
    const b = run((d) => ops.createBook(d, { title: 'Receita', furnitureId: shelf('Lar', 'Compras').id }));
    await sync();
    const path = db.books[b].note!.path;
    vault.put(path, vault.text(path)!.replace('tipo: Nota', 'tipo: Nota\naliases:\n  - bolo\ncor: azul'));
    t += 1000;
    await sync(); // importa a propriedade nova
    run((d) => ops.addBlock(d, b, 'text', undefined, { text: 'Misturar tudo.' }));
    t += 60000;
    const r = await sync();
    expect(r.exported).toBe(1);
    const text = vault.text(path)!;
    expect(text).toContain('Misturar tudo.');
    expect(text).toContain('aliases:\n  - bolo');
    expect(text).toContain('cor: azul');
  });

  it('conflito: o Obsidian vence e a versão do Recanto fica guardada em uma cópia', async () => {
    const b = run((d) => ops.createBook(d, { title: 'Plano', furnitureId: shelf('Oficina', 'Projetos').id }));
    run((d) => ops.addBlock(d, b, 'text', undefined, { text: 'Versão inicial.' }));
    await sync();
    const path = db.books[b].note!.path;
    vault.put(path, vault.text(path)!.replace('Versão inicial.', 'Editado no Obsidian.'));
    run((d) => ops.updateBlock(d, b, db.books[b].blocks[0].id, { text: 'Editado no Recanto.' }));
    t += 60000;
    const r = await sync();
    expect(r.conflicts).toHaveLength(1);
    expect(db.books[b].blocks[0].type === 'text' && db.books[b].blocks[0].text).toBe('Editado no Obsidian.');
    const copy = vault.text(r.conflicts[0].copyPath)!;
    expect(copy).toContain('Editado no Recanto.');
    expect(copy).toContain('recanto_conflito_de');
    expect(copy).not.toContain(`recanto_id: ${b}`);
    expect(vault.text(path)).toContain('Editado no Obsidian.');
    // a cópia de conflito não é sincronizada como livro
    t += 60000;
    const again = await sync();
    expect(again.newNotes).toBe(0);
    expect(Object.values(db.books).filter((x) => x.title.includes('conflito'))).toHaveLength(0);
  });

  it('mover o móvel de lugar no Recanto move a nota; mudar de pasta no Obsidian não move o livro', async () => {
    const b = run((d) => ops.createBook(d, { title: 'Manual', furnitureId: shelf('Lar', 'Manutenção').id }));
    await sync();
    const old = db.books[b].note!.path;
    run((d) => ops.moveBook(d, b, { houseId: house('Lar').id, furnitureId: shelf('Lar', 'Compras').id }));
    t += 60000;
    const r = await sync();
    expect(r.moved).toBe(1);
    expect(vault.text(old)).toBeNull();
    expect(vault.text('10 - Áreas da Vida/Lar/Compras/Manual.md')).toContain(`recanto_id: ${b}`);
    // o usuário reorganiza por conta própria no Obsidian
    const p = db.books[b].note!.path;
    const text = vault.text(p)!;
    await vault.remove(p);
    vault.put('20 - Conhecimento/Gestão/Manual.md', text);
    t += 60000;
    await sync();
    expect(db.books[b].furnitureId).toBe(shelf('Lar', 'Compras').id);
    expect(db.books[b].note!.path).toBe('20 - Conhecimento/Gestão/Manual.md');
    expect(vault.paths().filter((x) => x.endsWith('Manual.md'))).toEqual(['20 - Conhecimento/Gestão/Manual.md']);
  });

  it('renomear o arquivo no Obsidian renomeia o livro; renomear o livro renomeia o arquivo', async () => {
    const b = run((d) => ops.createBook(d, { title: 'Nome velho', furnitureId: shelf('Lar', 'Compras').id }));
    await sync();
    const p = db.books[b].note!.path;
    const text = vault.text(p)!;
    await vault.remove(p);
    vault.put(p.replace('Nome velho', 'Nome novo'), text);
    t += 60000;
    await sync();
    expect(db.books[b].title).toBe('Nome novo');
    t += 60000;
    run((d) => ops.updateBook(d, b, { title: 'Nome do Recanto' }));
    const r = await sync();
    expect(r.exported).toBe(1);
    expect(vault.text('10 - Áreas da Vida/Lar/Compras/Nome do Recanto.md')).toContain('# Nome do Recanto');
    expect(vault.text('10 - Áreas da Vida/Lar/Compras/Nome novo.md')).toBeNull();
  });

  it('nota criada no Obsidian vira livro no lugar certo, com o recanto_id acrescentado sem perder nada', async () => {
    run((d) => ops.createBook(d, { title: 'Base', furnitureId: shelf('Lar', 'Documentos').id }));
    await sync();
    vault.put('10 - Áreas da Vida/Lar/Documentos/Escritura.md', '---\ntags: [casa]\n---\n\nTexto da escritura.\n\n- [ ] Registrar\n');
    vault.put('00 - Caixa de Entrada/Ideia rápida.md', 'Só uma ideia.');
    vault.put('20 - Conhecimento/Outro.md', 'Isto não é do Recanto.');
    t += 60000;
    const r = await sync();
    expect(r.newNotes).toBe(2);
    const e = book('Escritura');
    expect(e.furnitureId).toBe(shelf('Lar', 'Documentos').id);
    expect(e.blocks.map((x) => x.type)).toEqual(['text', 'checklist']);
    const text = vault.text('10 - Áreas da Vida/Lar/Documentos/Escritura.md')!;
    expect(text).toContain(`recanto_id: ${e.id}`);
    expect(text).toContain('tags: [casa]');
    expect(book('Ideia rápida').houseId).toBeNull();
    expect(vault.text('20 - Conhecimento/Outro.md')).toBe('Isto não é do Recanto.');
    t += 60000;
    expect(await sync()).toMatchObject({ newNotes: 0, imported: 0, exported: 0 });
  });

  it('nota apagada do Vault é recriada, com aviso; nada é apagado do Vault', async () => {
    const b = run((d) => ops.createBook(d, { title: 'Importante', furnitureId: shelf('Lar', 'Documentos').id }));
    await sync();
    await vault.remove(db.books[b].note!.path);
    t += 60000;
    const r = await sync();
    expect(r.created).toBe(1);
    expect(r.warnings.join(' ')).toContain('recriada');
    // livro na lixeira: a nota continua no Vault
    run((d) => ops.deleteBook(d, b));
    t += 60000;
    await sync();
    expect(vault.text('10 - Áreas da Vida/Lar/Documentos/Importante.md')).toContain('recanto_id');
  });

  it('wikilinks viram referências a livros e os campos de referência saem como [[links]]', async () => {
    const pessoa = run((d) => ops.createBook(d, { title: 'Dr. Paulo', templateId: 'tpl_person', furnitureId: shelf('Hospedaria', 'Pessoas').id }));
    const consulta = run((d) => ops.createBook(d, { title: 'Consulta de rotina', templateId: 'tpl_appointment', furnitureId: shelf('Ginásio', 'Consultas').id }));
    run((d) => ops.setBookField(d, consulta, 'a_who', pessoa));
    await sync();
    const p = db.books[consulta].note!.path;
    expect(vault.text(p)).toContain('Profissional: "[[Dr. Paulo]]"');
    vault.put(p, vault.text(p)!.replace('# Consulta de rotina\n', '# Consulta de rotina\n\n[[Dr. Paulo]]\n\nLevar exames.\n'));
    t += 60000;
    await sync();
    expect(db.books[consulta].blocks[0]).toMatchObject({ type: 'bookref', bookId: pessoa });
    expect(db.books[consulta].fields['a_who']).toBe(pessoa);
  });

  it('anexos vão para _Anexos e voltam como anexos do Recanto', async () => {
    const b = run((d) => ops.createBook(d, { title: 'Com imagem', furnitureId: shelf('Ateliê', 'Ideias').id }));
    const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
    blobs.set('anx_a', { id: 'anx_a', mime: 'image/png', data: png.buffer.slice(0) as ArrayBuffer });
    run((d) => {
      ops.addAttachment(d, { id: 'anx_a', name: 'foto.png', mime: 'image/png', size: 7 });
      ops.addBlock(d, b, 'image', undefined, { attachmentId: 'anx_a', caption: 'Minha foto' });
    });
    await sync();
    expect(vault.text('_Anexos/foto.png')).not.toBeNull();
    const text = vault.text(db.books[b].note!.path)!;
    expect(text).toContain('![[_Anexos/foto.png|Minha foto]]');
    // uma imagem colada no Obsidian vira anexo
    vault.put(db.books[b].note!.path, text + '\n![[Pasted image.png]]\n');
    vault.files.set('Pasted image.png', { data: new Uint8Array([9, 9, 9]), mtime: 5 });
    t += 60000;
    await sync();
    const blocks = db.books[b].blocks;
    expect(blocks.filter((x) => x.type === 'image')).toHaveLength(2);
    const last = blocks[blocks.length - 1];
    expect(last.type === 'image' && db.attachments[last.attachmentId!].vaultPath).toBe('Pasted image.png');
    expect(new Uint8Array(blobs.get((last as { attachmentId: ID }).attachmentId!)!.data).length).toBe(3);
  });

  it('as tarefas do livro aparecem em uma seção gerada que não causa conflito', async () => {
    const p = run((d) => ops.createBook(d, { title: 'Reforma', templateId: 'tpl_project', furnitureId: shelf('Lar', 'Manutenção').id }));
    await sync();
    const path = db.books[p].note!.path;
    vault.put(path, vault.text(path)!.replace('# Reforma\n', '# Reforma\n\nAnotações minhas.\n'));
    run((d) => ops.createTask(d, { title: 'Pintar a sala', bookId: p, dueDate: '2026-12-10' }));
    t += 60000;
    const r = await sync();
    expect(r.conflicts).toHaveLength(0);
    const text = vault.text(path)!;
    expect(text).toContain('Anotações minhas.');
    expect(text).toContain('- [ ] Pintar a sala 📅 2026-12-10');
    expect(db.books[p].blocks.map((x) => x.type)).toEqual(['text']);
    // tarefa concluída no app: só a seção gerada muda, sem tocar no resto
    const id = Object.values(db.tasks)[0].id;
    run((d) => ops.updateTask(d, id, { status: 'done' }));
    t += 60000;
    await sync();
    expect(vault.text(path)).toContain('- [x] Pintar a sala');
    expect(vault.text(path)).toContain('Anotações minhas.');
  });

  it('notas com o mesmo recanto_id (cópia no Vault) são ignoradas com aviso', async () => {
    const b = run((d) => ops.createBook(d, { title: 'Original', furnitureId: shelf('Lar', 'Compras').id }));
    await sync();
    vault.put('Cópia de Original.md', vault.text(db.books[b].note!.path)!);
    t += 60000;
    const r = await sync();
    expect(r.warnings.join(' ')).toContain('repete o recanto_id');
    expect(Object.values(db.books).filter((x) => x.title === 'Original')).toHaveLength(1);
  });

  it('o índice lista casas, móveis e livros com wikilinks', () => {
    run((d) => ops.createBook(d, { title: 'Marina', templateId: 'tpl_person', furnitureId: shelf('Hospedaria', 'Pessoas').id }));
    const idx = renderIndex(db);
    expect(idx).toContain('## Hospedaria');
    expect(idx).toContain('### Pessoas');
    expect(idx).toContain('- [[Marina]] — Pessoa');
  });

  it('hash identifica alterações', () => {
    expect(hashText('a')).not.toBe(hashText('b'));
    expect(hashText('abc')).toBe(hashText('abc'));
  });
});

describe('Vault de exemplo (o que acompanha a versão pronta)', () => {
  it('as notas viram livros nos lugares certos e o conhecimento de fora fica intacto', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs');
    const path = await import('node:path');
    const root = path.resolve('versao-pronta/Vault-de-exemplo');
    const walk = (dir: string, rel = ''): void => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        const r = rel ? `${rel}/${name}` : name;
        if (statSync(full).isDirectory()) walk(full, r);
        else vault.files.set(r, { data: new Uint8Array(readFileSync(full)), mtime: 1 });
      }
    };
    walk(root);
    const outside = vault.text('20 - Conhecimento/Logística/Gestão de estoque.md');
    const r = await sync();
    expect(r.newNotes).toBe(3);
    const lista = book('Lista do mercado');
    expect(lista.furnitureId).toBe(shelf('Lar', 'Compras').id);
    expect(book('Ideia - mural de inspirações').furnitureId).toBe(shelf('Ateliê', 'Ideias').id);
    expect(lista.blocks.map((b) => b.type)).toEqual(['heading', 'checklist', 'heading', 'checklist', 'text']);
    expect(book('Ideia - app de receitas').houseId).toBeNull();
    const ideia = book('Ideia - mural de inspirações');
    // [[Lista do mercado]] ainda não existia quando esta nota foi lida: fica como texto, mas conta como conexão
    expect(ideia.blocks.map((b) => b.type)).toEqual(['text', 'text', 'table']);
    expect(outLinks(db, ideia).map((b) => b.title)).toEqual(['Lista do mercado']);
    expect(outLinks(db, lista).map((b) => b.title)).toEqual(['Ideia - mural de inspirações']);
    expect(vault.text('20 - Conhecimento/Logística/Gestão de estoque.md')).toBe(outside);
    expect(vault.text('10 - Áreas da Vida/Lar/Compras/Lista do mercado.md')).toContain('tags: [casa, semana]');
    t += 60000;
    expect(await sync()).toMatchObject({ newNotes: 0, imported: 0, exported: 0, created: 0 });
  });
});
