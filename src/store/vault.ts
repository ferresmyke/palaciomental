/**
 * Conexão com o Vault do Obsidian: escolher a pasta, reconectar, sincronizar (à mão ou sozinho).
 * O handle da pasta fica guardado no navegador; a permissão precisa ser reconfirmada a cada sessão
 * (um clique), a menos que o navegador a mantenha.
 */
import { createStore } from 'zustand/vanilla';
import { syncVault, type SyncReport } from '@/integrations/obsidian/sync';
import { HandleVault, hasDirectoryPicker, permissionOf, type VaultFs } from '@/integrations/obsidian/vault';
import { takeSnapshot } from '@/persistence/snapshots';
import { dbStore, exec, flush, getDb, getRepo } from './db';
import { ui } from './ui';

export type VaultStatus = 'none' | 'unsupported' | 'needs-permission' | 'ready' | 'syncing' | 'error';

export interface VaultState {
  status: VaultStatus;
  name: string | null;
  message: string | null;
  report: SyncReport | null;
  lastSync: number | null;
}

export const vaultStore = createStore<VaultState>(() => ({
  status: hasDirectoryPicker() ? 'none' : 'unsupported',
  name: null,
  message: null,
  report: null,
  lastSync: null,
}));

const set = vaultStore.setState;
let vault: VaultFs | null = null;
let running = false;
let again = false;
let ignoreRev = -1;
let debounce: ReturnType<typeof setTimeout> | undefined;

function setReady(v: VaultFs): void {
  vault = v;
  set({ status: 'ready', name: v.name, message: null });
}

/** Chamado ao abrir o app: religa a pasta guardada, se o navegador ainda permitir. */
export async function initVault(): Promise<void> {
  const cfg = getDb().meta.world?.vault;
  if (!cfg) return;
  try {
    const handle = (await getRepo().getHandle('vault')) as FileSystemDirectoryHandle | undefined;
    if (!handle) return void set({ status: 'needs-permission', name: cfg.name, message: 'A pasta do Obsidian precisa ser escolhida de novo neste navegador.' });
    const perm = await permissionOf(handle, false);
    if (perm === 'granted') {
      setReady(new HandleVault(handle));
      if (cfg.auto) void syncNow();
    } else set({ status: 'needs-permission', name: cfg.name, message: null });
  } catch (e) {
    set({ status: 'error', message: (e as Error).message });
  }
  installAutoSync();
}

/** Liga uma pasta (escolhida pelo usuário). Também usada pelos testes, com uma pasta virtual. */
export async function connectHandle(handle: FileSystemDirectoryHandle, name = handle.name): Promise<void> {
  const perm = await permissionOf(handle, true);
  if (perm !== 'granted') return void set({ status: 'error', message: 'Sem permissão para ler e escrever na pasta escolhida.' });
  await flush();
  try {
    await takeSnapshot(getDb(), getRepo(), 'antes de ligar o Obsidian');
  } catch {
    /* a cópia é uma proteção extra; não impede a conexão */
  }
  await getRepo().putHandle('vault', handle);
  exec('Ligar o Obsidian', (d) => {
    if (d.meta.world) d.meta.world.vault = { name, auto: d.meta.world.vault?.auto ?? true, lastSync: null };
  }, { transient: true });
  setReady(new HandleVault(handle, name));
  installAutoSync();
  await syncNow();
}

export async function chooseVault(): Promise<void> {
  if (!hasDirectoryPicker()) return void set({ status: 'unsupported' });
  try {
    const picker = (globalThis as unknown as { showDirectoryPicker(o: object): Promise<FileSystemDirectoryHandle> }).showDirectoryPicker;
    const handle = await picker({ mode: 'readwrite', id: 'recanto-vault' });
    await connectHandle(handle);
  } catch (e) {
    if ((e as Error).name !== 'AbortError') set({ status: 'error', message: (e as Error).message });
  }
}

/** Pede de novo a permissão (precisa de um clique do usuário). */
export async function reconnectVault(): Promise<void> {
  try {
    const handle = (await getRepo().getHandle('vault')) as FileSystemDirectoryHandle | undefined;
    if (!handle) return void (await chooseVault());
    const perm = await permissionOf(handle, true);
    if (perm !== 'granted') return void set({ status: 'needs-permission', message: 'A permissão não foi concedida.' });
    setReady(new HandleVault(handle));
    await syncNow();
  } catch (e) {
    set({ status: 'error', message: (e as Error).message });
  }
}

export async function disconnectVault(): Promise<void> {
  vault = null;
  await getRepo().deleteHandle('vault');
  exec('Desligar o Obsidian', (d) => {
    if (d.meta.world) delete d.meta.world.vault;
    for (const b of Object.values(d.books)) delete b.note;
    for (const a of Object.values(d.attachments)) delete a.vaultPath;
  }, { transient: true });
  set({ status: hasDirectoryPicker() ? 'none' : 'unsupported', name: null, message: null, report: null, lastSync: null });
}

export function setAutoSync(auto: boolean): void {
  exec('Sincronização automática', (d) => {
    if (d.meta.world?.vault) d.meta.world.vault.auto = auto;
  }, { transient: true });
}

export async function syncNow(): Promise<SyncReport | null> {
  if (!vault) return null;
  if (running) {
    again = true;
    return null;
  }
  running = true;
  set({ status: 'syncing', message: null });
  try {
    await flush();
    const repo = getRepo();
    const report = await syncVault({
      vault,
      getDb,
      commit: (label, fn) => void exec(label, fn, { transient: true }),
      getBlob: (id) => repo.getBlob(id),
      putBlob: (b) => repo.putBlob(b),
      now: () => Date.now(),
    });
    await flush();
    ignoreRev = dbStore.getState().rev;
    set({ status: 'ready', report, lastSync: Date.now(), message: null });
    if (report.conflicts.length) ui.toast(`Obsidian: ${report.conflicts.length} conflito(s) resolvido(s) sem perda. Veja os detalhes em Configurações › Obsidian.`, 'info');
    return report;
  } catch (e) {
    console.error('Falha na sincronização com o Obsidian', e);
    set({ status: 'error', message: (e as Error).message });
    return null;
  } finally {
    running = false;
    if (again) {
      again = false;
      schedule(2000);
    }
  }
}

function autoOn(): boolean {
  return !!getDb().meta.world?.vault?.auto && !!vault;
}

function schedule(ms: number): void {
  clearTimeout(debounce);
  debounce = setTimeout(() => {
    if (autoOn() && vaultStore.getState().status === 'ready') void syncNow();
  }, ms);
}

let installed = false;
function installAutoSync(): void {
  if (installed) return;
  installed = true;
  // Alterações no Recanto vão para o Vault pouco depois de você parar de mexer.
  dbStore.subscribe((s) => {
    if (s.rev !== ignoreRev && autoOn()) schedule(12000);
  });
  // Ao voltar para a janela, traz o que mudou no Obsidian.
  window.addEventListener('focus', () => autoOn() && schedule(1500));
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && autoOn() && schedule(1500));
  setInterval(() => autoOn() && document.visibilityState === 'visible' && schedule(500), 90000);
}

/** Link para abrir uma nota no aplicativo Obsidian. */
export function obsidianLink(path: string): string | null {
  const name = vaultStore.getState().name ?? getDb().meta.world?.vault?.name;
  if (!name) return null;
  return `obsidian://open?vault=${encodeURIComponent(name)}&file=${encodeURIComponent(path.replace(/\.md$/i, ''))}`;
}
