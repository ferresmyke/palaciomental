/**
 * Acesso aos arquivos do Vault. Duas implementações: a pasta real do computador
 * (File System Access API, Chrome/Edge) e uma em memória, usada nos testes.
 */
export interface VaultEntry {
  path: string;
  size: number;
  mtime: number;
}

export interface VaultFs {
  readonly name: string;
  /** Todos os arquivos, recursivamente. Pastas que começam com ponto (.obsidian, .trash) ficam de fora. */
  list(): Promise<VaultEntry[]>;
  readText(path: string): Promise<string>;
  readBytes(path: string): Promise<Uint8Array>;
  writeText(path: string, text: string): Promise<void>;
  writeBytes(path: string, data: Uint8Array): Promise<void>;
  remove(path: string): Promise<void>;
}

export const dirname = (p: string): string => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '');
export const basename = (p: string): string => p.slice(p.lastIndexOf('/') + 1);
export const stemOf = (p: string): string => basename(p).replace(/\.[^.]+$/, '');
export const extOf = (p: string): string => (/\.([^./]+)$/.exec(p)?.[1] ?? '').toLowerCase();
export const joinPath = (...parts: string[]): string => parts.filter(Boolean).join('/');

// ───────────────────────────── Memória (testes) ─────────────────────────────

export class MemoryVault implements VaultFs {
  files = new Map<string, { data: Uint8Array; mtime: number }>();
  clock = 1000;
  constructor(readonly name = 'Vault de teste') {}

  private touch(path: string, data: Uint8Array): void {
    this.files.set(path, { data, mtime: ++this.clock });
  }
  async list(): Promise<VaultEntry[]> {
    return [...this.files.entries()]
      .filter(([p]) => !p.split('/').some((seg) => seg.startsWith('.')))
      .map(([path, f]) => ({ path, size: f.data.length, mtime: f.mtime }));
  }
  async readText(path: string): Promise<string> {
    const f = this.files.get(path);
    if (!f) throw new Error(`Arquivo não encontrado: ${path}`);
    return new TextDecoder().decode(f.data);
  }
  async readBytes(path: string): Promise<Uint8Array> {
    const f = this.files.get(path);
    if (!f) throw new Error(`Arquivo não encontrado: ${path}`);
    return f.data;
  }
  async writeText(path: string, text: string): Promise<void> {
    this.touch(path, new TextEncoder().encode(text));
  }
  async writeBytes(path: string, data: Uint8Array): Promise<void> {
    this.touch(path, data);
  }
  async remove(path: string): Promise<void> {
    this.files.delete(path);
  }
  /** Atalhos para os testes. */
  put(path: string, text: string): void {
    this.touch(path, new TextEncoder().encode(text));
  }
  text(path: string): string | null {
    const f = this.files.get(path);
    return f ? new TextDecoder().decode(f.data) : null;
  }
  paths(): string[] {
    return [...this.files.keys()].sort();
  }
}

// ───────────────────────────── Pasta real do computador ─────────────────────────────

type DirHandle = FileSystemDirectoryHandle;
type FileHandle = FileSystemFileHandle;

async function walk(dir: DirHandle, prefix: string, out: VaultEntry[]): Promise<void> {
  const it = (dir as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries();
  for await (const [name, handle] of it) {
    if (name.startsWith('.')) continue;
    const path = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === 'directory') await walk(handle as DirHandle, path, out);
    else {
      const f = await (handle as FileHandle).getFile();
      out.push({ path, size: f.size, mtime: f.lastModified });
    }
  }
}

export class HandleVault implements VaultFs {
  constructor(
    private root: DirHandle,
    readonly name = root.name,
  ) {}

  private async dir(path: string, create: boolean): Promise<DirHandle> {
    let cur = this.root;
    for (const seg of path.split('/').filter(Boolean)) cur = await cur.getDirectoryHandle(seg, { create });
    return cur;
  }
  private async file(path: string, create: boolean): Promise<FileHandle> {
    return (await this.dir(dirname(path), create)).getFileHandle(basename(path), { create });
  }
  async list(): Promise<VaultEntry[]> {
    const out: VaultEntry[] = [];
    await walk(this.root, '', out);
    return out;
  }
  async readText(path: string): Promise<string> {
    return (await (await this.file(path, false)).getFile()).text();
  }
  async readBytes(path: string): Promise<Uint8Array> {
    return new Uint8Array(await (await (await this.file(path, false)).getFile()).arrayBuffer());
  }
  private async write(path: string, data: string | Uint8Array): Promise<void> {
    const w = await (await this.file(path, true)).createWritable();
    await w.write(data as unknown as FileSystemWriteChunkType);
    await w.close();
  }
  writeText(path: string, text: string): Promise<void> {
    return this.write(path, text);
  }
  writeBytes(path: string, data: Uint8Array): Promise<void> {
    return this.write(path, data);
  }
  async remove(path: string): Promise<void> {
    await (await this.dir(dirname(path), false)).removeEntry(basename(path));
  }
}

export type PermissionState = 'granted' | 'prompt' | 'denied';

export async function permissionOf(handle: DirHandle, request = false): Promise<PermissionState> {
  const h = handle as unknown as {
    queryPermission?(o: { mode: string }): Promise<PermissionState>;
    requestPermission?(o: { mode: string }): Promise<PermissionState>;
  };
  const opts = { mode: 'readwrite' };
  let state = (await h.queryPermission?.(opts)) ?? 'granted';
  if (state !== 'granted' && request) state = (await h.requestPermission?.(opts)) ?? state;
  return state;
}

export const hasDirectoryPicker = (): boolean => typeof (globalThis as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';
