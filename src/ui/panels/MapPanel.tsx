/** Mapa de Conexões: como os livros se relacionam (referências e [[wikilinks]]). */
import { useMemo, useState } from 'react';
import { themeById } from '@/domain/catalog';
import { buildGraph, layoutGraph, MAX_GRAPH_NODES } from '@/domain/links';
import { liveHouses } from '@/domain/selectors';
import type { ID } from '@/domain/types';
import { cssColor } from '@/game/art/palette';
import { ui } from '@/store/ui';
import { BookPicker } from '../editors';
import { Empty, Field, Panel, Segmented, useDb } from '../kit';

const W = 520;
const H = 480;

export function MapPanel({ id }: { id?: ID }) {
  const db = useDb();
  const [center, setCenter] = useState<ID | null>(id ?? null);
  const [depth, setDepth] = useState<1 | 2 | 3>(2);
  const g = useMemo(() => buildGraph(db, center, depth), [db, center, depth]);
  const pos = useMemo(() => layoutGraph(g, W, H, center), [g, center]);
  const houses = liveHouses(db, true);
  const colorOf = (houseId: ID | null) => {
    const h = houseId ? db.houses[houseId] : undefined;
    return h ? cssColor(themeById(h.themeId).color === 'ardosia' ? 'azul' : themeById(h.themeId).color, 2) : '#9a8a70';
  };
  const centerBook = center ? db.books[center] : null;
  return (
    <Panel label="Mapa de Conexões" icon="search" wide kicker="Como as informações se relacionam" title="Mapa de Conexões">
      <p className="lede">
        Cada ponto é um livro. Uma linha aparece quando um livro cita o outro por uma <strong>referência a livro</strong> ou por um link <code>[[Nome do livro]]</code> no texto.
      </p>
      <div className="grid2">
        <Field label="Em volta de">
          {centerBook ? (
            <div className="ref-chip">
              <strong>{centerBook.title}</strong>
              <button className="mini" aria-label="Ver tudo" onClick={() => setCenter(null)}>
                ×
              </button>
            </div>
          ) : (
            <BookPicker value={null} label="Livro central" placeholder="Todo o Recanto — ou escolha um livro…" onChange={(b) => b && setCenter(b)} />
          )}
        </Field>
        {centerBook && (
          <Field label="Distância">
            <Segmented<'1' | '2' | '3'> label="Distância" value={String(depth) as '1' | '2' | '3'} onChange={(v) => setDepth(Number(v) as 1 | 2 | 3)} options={[{ value: '1', label: '1 passo' }, { value: '2', label: '2 passos' }, { value: '3', label: '3 passos' }]} />
          </Field>
        )}
      </div>
      {g.nodes.length === 0 ? (
        <Empty>
          Ainda não há conexões. Para criar uma, abra um livro e insira um bloco “Referência a livro”, ou escreva <code>[[Nome de outro livro]]</code> em um texto.
        </Empty>
      ) : (
        <>
          <svg className="graph" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Mapa com ${g.nodes.length} livros e ${g.edges.length} conexões`}>
            {g.edges.map((e) => {
              const a = pos.get(e.a)!;
              const b = pos.get(e.b)!;
              const hot = center && (e.a === center || e.b === center);
              return <line key={`${e.a}${e.b}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={hot ? 'edge hot' : 'edge'} />;
            })}
            {g.nodes.map((n) => {
              const p = pos.get(n.id)!;
              const r = 6 + Math.min(8, n.degree * 1.4) + (n.id === center ? 3 : 0);
              const label = n.title.length > 20 ? `${n.title.slice(0, 19)}…` : n.title;
              return (
                <g key={n.id} className={`node${n.id === center ? ' center' : ''}`} transform={`translate(${p.x} ${p.y})`} tabIndex={0} role="button" aria-label={`${n.title}, ${n.degree} conexões. Enter abre o livro.`} onClick={() => ui.push({ type: 'book', id: n.id })} onKeyDown={(e) => e.key === 'Enter' && ui.push({ type: 'book', id: n.id })}>
                  <title>{`${n.title} — ${n.degree} conexão(ões)${n.houseId ? ` · ${db.houses[n.houseId]?.name}` : ' · Correio'}`}</title>
                  <circle r={r} fill={colorOf(n.houseId)} />
                  <text y={r + 12} textAnchor="middle">
                    {label}
                  </text>
                </g>
              );
            })}
          </svg>
          <div className="chips legend" aria-label="Cores por casa">
            {houses.map((h) => (
              <span key={h.id} className="chip">
                <i className="dot" style={{ background: colorOf(h.id) }} aria-hidden="true" />
                {h.name}
              </span>
            ))}
            <span className="chip">
              <i className="dot" style={{ background: '#9a8a70' }} aria-hidden="true" />
              Correio
            </span>
          </div>
          <p className="muted">
            {g.nodes.length} livros, {g.edges.length} conexões. Clique em um livro para abri-lo.
            {g.truncated && ` Mostrando os ${MAX_GRAPH_NODES} mais conectados: escolha um livro para ver o entorno dele.`}
          </p>
        </>
      )}
    </Panel>
  );
}
