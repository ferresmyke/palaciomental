/**
 * Ações de interface: executam operações de domínio como comandos,
 * mostram erros de regra em avisos e oferecem "Desfazer" quando faz sentido.
 */
import { addAttachment, OpError } from '@/domain/ops';
import type { Db, ID } from '@/domain/types';
import { newId } from '@/domain/util';
import { exec, getRepo, redo, undo, type ExecOptions } from './db';
import { ui } from './ui';

/** Executa um comando; regras violadas viram aviso em vez de exceção. */
export function run<T>(label: string, fn: (draft: Db) => T, opts?: ExecOptions): T | undefined {
  try {
    return exec(label, fn, opts);
  } catch (e) {
    if (e instanceof OpError) {
      ui.toast(e.message, 'error');
      return undefined;
    }
    throw e;
  }
}

/** Executa e avisa, com a opção de desfazer no próprio aviso. */
export function runWithUndo<T>(label: string, fn: (draft: Db) => T, message: string): T | undefined {
  let failed = false;
  let result: T | undefined;
  try {
    result = exec(label, fn);
  } catch (e) {
    if (!(e instanceof OpError)) throw e;
    ui.toast(e.message, 'error');
    failed = true;
  }
  if (!failed) ui.toast(message, 'ok', 'Desfazer', () => doUndo());
  return result;
}

export function doUndo(): void {
  const label = undo();
  ui.toast(label ? `Desfeito: ${label}` : 'Nada para desfazer.', 'info');
}

export function doRedo(): void {
  const label = redo();
  ui.toast(label ? `Refeito: ${label}` : 'Nada para refazer.', 'info');
}

const MAX_FILE = 25 * 1024 * 1024;

/** Guarda arquivos como anexos (o conteúdo vai para o repositório, o registro para o banco). */
export async function addFiles(files: File[]): Promise<ID[]> {
  const ids: ID[] = [];
  for (const file of files) {
    if (file.size > MAX_FILE) {
      ui.toast(`"${file.name}" passa de 25 MB e não foi anexado.`, 'error');
      continue;
    }
    const id = newId('anx');
    try {
      await getRepo().putBlob({ id, mime: file.type || 'application/octet-stream', data: await file.arrayBuffer() });
    } catch {
      ui.toast('Não foi possível guardar o arquivo neste navegador.', 'error');
      continue;
    }
    exec('Anexar arquivo', (d) => addAttachment(d, { id, name: file.name, mime: file.type || 'application/octet-stream', size: file.size }), { transient: true });
    ids.push(id);
  }
  return ids;
}

const urlCache = new Map<ID, string>();

/** URL temporária para exibir ou baixar um anexo. */
export async function blobUrl(id: ID): Promise<string | null> {
  const hit = urlCache.get(id);
  if (hit) return hit;
  const b = await getRepo().getBlob(id);
  if (!b) return null;
  const url = URL.createObjectURL(new Blob([b.data], { type: b.mime }));
  urlCache.set(id, url);
  return url;
}

export function clearBlobUrls(): void {
  for (const url of urlCache.values()) URL.revokeObjectURL(url);
  urlCache.clear();
}
