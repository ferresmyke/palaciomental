import { useEffect, useRef } from 'react';

/** Área do mundo. O Phaser é carregado sob demanda para não pesar na abertura da interface. */
export function GameCanvas() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let dispose: (() => void) | undefined;
    let cancelled = false;
    void import('@/game').then(({ mountGame }) => {
      if (cancelled || !ref.current) return;
      dispose = mountGame(ref.current);
    });
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, []);
  return <div ref={ref} className="world" aria-label="Mapa do Recanto" role="application" />;
}
