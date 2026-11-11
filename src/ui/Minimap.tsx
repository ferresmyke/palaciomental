import { useEffect, useRef } from 'react';
import { cityPlan, T, TILE } from '@/domain/city';
import { liveHouses } from '@/domain/selectors';
import { gameApi } from '@/store/gameApi';
import { useDb, useUi } from './kit';

const COLORS: Record<number, string> = {
  [T.GRASS]: '#5a9148',
  [T.ROAD]: '#bd9a65',
  [T.PLAZA]: '#b0a390',
  [T.WATER]: '#3b86b0',
  [T.BRIDGE]: '#8c5c32',
  [T.HIGH]: '#76994a',
  [T.CLIFF]: '#766a5c',
  [T.STAIRS]: '#cdc2ae',
  [T.HIGHROAD]: '#bd9a65',
};

/** Minimapa da cidade: terreno, casas, avatar e a área visível. Clique para centralizar. */
export function Minimap() {
  const db = useDb();
  const view = useUi((s) => s.view);
  const avatar = useUi((s) => s.avatar);
  const ref = useRef<HTMLCanvasElement>(null);
  const plan = cityPlan(db.meta.world?.expansion ?? 0);
  const S = 2.5;
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    for (let y = 0; y < plan.h; y++)
      for (let x = 0; x < plan.w; x++) {
        ctx.fillStyle = COLORS[plan.terrain[y * plan.w + x]] ?? '#5a9148';
        ctx.fillRect(x * S, y * S, S + 0.5, S + 0.5);
      }
    ctx.fillStyle = '#2f5a38';
    for (const s of plan.scenery) if (s.solid && s.kind !== 'lantern' && s.kind !== 'bench') ctx.fillRect(s.x * S, s.y * S, S, S);
    const o = plan.sites.observatorio;
    ctx.fillStyle = '#435d76';
    ctx.fillRect(o.x * S, o.y * S, o.w * S, o.h * S);
    ctx.fillStyle = '#3b86b0';
    ctx.fillRect(plan.sites.fonte.x * S, plan.sites.fonte.y * S, 3 * S, 3 * S);
    for (const h of liveHouses(db)) {
      const lot = plan.lots.find((l) => l.id === h.lotId);
      if (!lot) continue;
      ctx.fillStyle = '#2a1c18';
      ctx.fillRect((lot.x + 1) * S - 1, (lot.y + 1) * S - 1, 5 * S + 2, 3 * S + 2);
      ctx.fillStyle = '#e8d5a8';
      ctx.fillRect((lot.x + 1) * S, (lot.y + 1) * S, 5 * S, 3 * S);
      ctx.fillStyle = '#a8472a';
      ctx.fillRect((lot.x + 1) * S, (lot.y + 1) * S, 5 * S, 1.4 * S);
    }
    if (avatar) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(avatar.x * S - 2, avatar.y * S - 2, 5, 5);
      ctx.fillStyle = '#b3402e';
      ctx.fillRect(avatar.x * S - 1, avatar.y * S - 1, 3, 3);
    }
    ctx.strokeStyle = '#fff9e0';
    ctx.lineWidth = 1.5;
    ctx.strokeRect((view.x / TILE) * S + 0.5, (view.y / TILE) * S + 0.5, (view.w / TILE) * S - 1, (view.h / TILE) * S - 1);
  }, [db, plan, view, avatar]);
  return (
    <canvas
      ref={ref}
      className="minimap"
      width={plan.w * S}
      height={plan.h * S}
      role="img"
      aria-label="Minimapa da cidade. Clique para centralizar."
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        gameApi.city?.focusCell(Math.floor(((e.clientX - r.left) / r.width) * plan.w), Math.floor(((e.clientY - r.top) / r.height) * plan.h));
      }}
    />
  );
}
