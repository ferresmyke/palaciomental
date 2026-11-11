import { useEffect, useState } from 'react';
import * as ops from '@/domain/ops';
import { IndexedDbRepository } from '@/persistence/idb';
import { MemoryRepository } from '@/persistence/memory';
import { dbStore, exec, initStore } from '@/store/db';
import { gameApi } from '@/store/gameApi';
import * as nav from '@/store/nav';
import { ui, uiStore } from '@/store/ui';
import { GameCanvas } from './GameCanvas';

export function App() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let repo;
    try {
      repo = new IndexedDbRepository();
    } catch {
      repo = new MemoryRepository();
    }
    void initStore(repo).then(() => setReady(true));
  }, []);
  useEffect(() => {
    if (import.meta.env.DEV) Object.assign(window, { __pm: { ops, exec, dbStore, uiStore, ui, nav, gameApi } });
  }, []);
  if (!ready) return <div className="boot">Abrindo o Recanto…</div>;
  return (
    <div className="app">
      <GameCanvas />
    </div>
  );
}
