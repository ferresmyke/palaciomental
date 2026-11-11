import { useEffect, useState } from 'react';
import * as ops from '@/domain/ops';
import { IndexedDbRepository } from '@/persistence/idb';
import { MemoryRepository } from '@/persistence/memory';
import type { Repository } from '@/persistence/repository';
import { dbStore, exec, initStore } from '@/store/db';
import { gameApi } from '@/store/gameApi';
import * as nav from '@/store/nav';
import { ui, uiStore } from '@/store/ui';
import { GameCanvas } from './GameCanvas';
import { Hud } from './Hud';
import { useDb, useUi } from './kit';
import { Onboarding } from './Onboarding';
import { Dialog, PanelHost, Toasts } from './PanelHost';
import { ReformDock } from './Reform';
import { installShortcuts } from './shortcuts';

async function openRepository(): Promise<{ repo: Repository; persistent: boolean }> {
  try {
    if (!('indexedDB' in globalThis)) throw new Error('sem IndexedDB');
    const repo = new IndexedDbRepository();
    await repo.load();
    return { repo, persistent: true };
  } catch (e) {
    console.warn('IndexedDB indisponível; usando memória', e);
    return { repo: new MemoryRepository(), persistent: false };
  }
}

function Shell() {
  const db = useDb();
  const reform = useUi((s) => s.reform);
  const hasPanel = useUi((s) => s.panels.length > 0);
  const settings = db.meta.world?.settings;
  useEffect(() => {
    const os = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    document.documentElement.dataset.motion = settings?.reduceMotion || os ? 'reduce' : 'full';
  }, [settings?.reduceMotion]);
  useEffect(() => installShortcuts(), []);
  const onboarded = !!db.meta.world?.onboarded;
  return (
    <div className={`app${reform ? ' is-reform' : ''}${hasPanel ? ' has-panel' : ''}`}>
      <GameCanvas />
      {onboarded ? (
        <>
          <Hud />
          {reform && <ReformDock />}
          <PanelHost />
        </>
      ) : (
        <Onboarding />
      )}
      <Toasts />
      <Dialog />
    </div>
  );
}

export function App() {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  useEffect(() => {
    let alive = true;
    void openRepository()
      .then(async ({ repo, persistent }) => {
        await initStore(repo);
        if (!alive) return;
        setState('ready');
        if (!persistent) ui.toast('Este navegador não permitiu guardar dados. O que você fizer vale só nesta sessão.', 'error');
        void navigator.storage?.persist?.();
      })
      .catch((e) => {
        console.error(e);
        if (alive) setState('error');
      });
    Object.assign(window, { __pm: { ops, exec, dbStore, uiStore, ui, nav, gameApi } });
    return () => {
      alive = false;
    };
  }, []);
  if (state === 'error') return <div className="boot">Não foi possível abrir o Recanto. Recarregue a página.</div>;
  if (state === 'loading') return <div className="boot">Abrindo o Recanto…</div>;
  return <Shell />;
}
