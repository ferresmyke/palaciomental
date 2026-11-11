/**
 * Componentes básicos da interface: painel lateral, edição no lugar, campos com
 * salvamento automático, ícones em pixel e pequenos utilitários visuais.
 */
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { useStore } from 'zustand';
import type { Db, ID } from '@/domain/types';
import { iconUrl } from '@/game/art/icons';
import { cssColor } from '@/game/art/palette';
import { blobUrl } from '@/store/actions';
import { dbStore } from '@/store/db';
import { ui, uiStore, type UiState } from '@/store/ui';

export function useDb(): Db {
  return useStore(dbStore, (s) => s.db);
}

export function useUi<T>(selector: (s: UiState) => T): T {
  return useStore(uiStore, selector);
}

/** Relógio que avança a cada minuto, para prazos e luz. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function useBlobUrl(id: ID | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setUrl(null);
    if (id) void blobUrl(id).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [id]);
  return url;
}

export function Icon({ name, size = 18, tone = 'reboco' }: { name: string; size?: number; tone?: Parameters<typeof iconUrl>[1] }) {
  return <img className="px-icon" src={iconUrl(name, tone)} width={size} height={size} alt="" aria-hidden="true" />;
}

interface PanelProps {
  title: ReactNode;
  kicker?: ReactNode;
  icon?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  actions?: ReactNode;
  label: string;
}

/** Painel contextual sobre a cena. No celular vira folha inferior. */
export function Panel({ title, kicker, icon, children, footer, wide, actions, label }: PanelProps) {
  const depth = useUi((s) => s.panels.length);
  return (
    <aside className={`panel${wide ? ' wide' : ''}`} role="dialog" aria-label={label}>
      <header className="panel-head">
        {depth > 1 && (
          <button className="icon-btn" onClick={() => ui.back()} aria-label="Voltar" title="Voltar">
            ‹
          </button>
        )}
        {icon && <Icon name={icon} size={27} tone="papel" />}
        <div className="panel-title">
          {kicker && <div className="kicker">{kicker}</div>}
          <h2>{title}</h2>
        </div>
        {actions}
        <button className="icon-btn" onClick={() => ui.closeAll()} aria-label="Fechar" title="Fechar (Esc)">
          ×
        </button>
      </header>
      <div className="panel-body">{children}</div>
      {footer && <footer className="panel-foot">{footer}</footer>}
    </aside>
  );
}

export function Section({ title, children, aside, count }: { title: ReactNode; children: ReactNode; aside?: ReactNode; count?: number }) {
  return (
    <section className="section">
      <div className="section-head">
        <h3>
          {title}
          {count !== undefined && <span className="count">{count}</span>}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

/** Texto que vira campo com duplo clique (ou Enter/F2 quando focado). */
export function InlineEdit({ value, onCommit, className, label, placeholder }: { value: string; onCommit: (v: string) => void; className?: string; label: string; placeholder?: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) ref.current?.select();
  }, [editing]);
  const commit = () => {
    setEditing(false);
    const v = draft.trim();
    if (v && v !== value) onCommit(v);
  };
  if (editing)
    return (
      <input
        ref={ref}
        className={`inline-input ${className ?? ''}`}
        value={draft}
        aria-label={label}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            e.stopPropagation();
            setEditing(false);
          }
        }}
      />
    );
  const start = () => {
    setDraft(value);
    setEditing(true);
  };
  return (
    <span
      className={`inline-edit ${className ?? ''}`}
      tabIndex={0}
      role="button"
      aria-label={`${label}: ${value}. Duplo clique ou Enter para renomear`}
      title="Duplo clique para renomear"
      onDoubleClick={start}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === 'F2') && start()}
    >
      {value || <em>{placeholder}</em>}
    </span>
  );
}

interface AutoProps {
  value: string;
  onCommit: (v: string) => void;
  label: string;
  placeholder?: string;
  type?: string;
  multiline?: boolean;
  rows?: number;
  className?: string;
  inputMode?: 'text' | 'decimal' | 'tel' | 'email' | 'url';
}

/** Campo com salvamento automático: grava enquanto o usuário digita, sem botão salvar. */
export function AutoInput({ value, onCommit, label, placeholder, type = 'text', multiline, rows = 3, className, inputMode }: AutoProps) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef({ draft, value, onCommit });
  latest.current = { draft, value, onCommit };
  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);
  const flush = () => {
    clearTimeout(timer.current);
    const l = latest.current;
    if (l.draft !== l.value) l.onCommit(l.draft);
  };
  useEffect(() => () => flush(), []); // eslint-disable-line react-hooks/exhaustive-deps
  const change = (v: string) => {
    setDraft(v);
    latest.current.draft = v;
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 350);
  };
  const common = {
    value: draft,
    placeholder,
    'aria-label': label,
    className: `field-input ${className ?? ''}`,
    onFocus: () => (focused.current = true),
    onBlur: () => {
      focused.current = false;
      flush();
    },
  };
  if (multiline) return <textarea {...common} rows={rows} onChange={(e) => change(e.target.value)} />;
  return <input {...common} type={type} inputMode={inputMode} onChange={(e) => change(e.target.value)} />;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Chip({ children, tone, title, onClick, symbol }: { children: ReactNode; tone?: 'alert' | 'ok' | 'muted' | 'gold'; title?: string; onClick?: () => void; symbol?: string }) {
  const cls = `chip ${tone ?? ''}`;
  const inner = (
    <>
      {symbol && <span aria-hidden="true">{symbol}</span>}
      {children}
    </>
  );
  return onClick ? (
    <button className={cls} title={title} onClick={onClick}>
      {inner}
    </button>
  ) : (
    <span className={cls} title={title}>
      {inner}
    </span>
  );
}

export function Progress({ ratio, label }: { ratio: number; label: string }) {
  const pct = Math.round(ratio * 100);
  return (
    <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="progress-bar" style={{ width: `${pct}%` }} />
      <span className="progress-text">{label}</span>
    </div>
  );
}

export function Swatches({ options, value, onChange, label }: { options: string[]; value: string | null; onChange: (v: string) => void; label: string }) {
  return (
    <div className="swatches" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o}
          role="radio"
          aria-checked={value === o}
          className={`swatch${value === o ? ' on' : ''}`}
          style={{ '--c': cssColor(o, 2, 'carvalho'), '--c2': cssColor(o, 0, 'carvalho') } as CSSProperties}
          title={o}
          aria-label={o}
          onClick={() => onChange(o)}
        />
      ))}
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string; symbol?: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.symbol && <span aria-hidden="true">{o.symbol} </span>}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Lista longa em páginas: mantém a interface leve com centenas de itens. */
export function Paged<T>({ items, size = 40, render, empty }: { items: T[]; size?: number; render: (item: T, index: number) => ReactNode; empty?: ReactNode }) {
  const [shown, setShown] = useState(size);
  useEffect(() => setShown(size), [items.length > size, size]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!items.length) return <>{empty}</>;
  return (
    <>
      {items.slice(0, shown).map(render)}
      {items.length > shown && (
        <button className="btn ghost wide" onClick={() => setShown(shown + size)}>
          Mostrar mais ({items.length - shown} restantes)
        </button>
      )}
    </>
  );
}

export function onEnter(fn: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      fn();
    }
  };
}

/** Linha de criação mínima: só um nome. */
export function QuickAdd({ placeholder, onAdd, label, autoFocus }: { placeholder: string; onAdd: (text: string) => void; label: string; autoFocus?: boolean }) {
  const [text, setText] = useState('');
  const add = () => {
    const t = text.trim();
    if (!t) return;
    onAdd(t);
    setText('');
  };
  return (
    <div className="quick-add">
      <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onEnter(add)} placeholder={placeholder} aria-label={label} autoFocus={autoFocus} />
      <button className="btn" onClick={add} disabled={!text.trim()} aria-label={label}>
        +
      </button>
    </div>
  );
}

export function Menu({ label, children, symbol = '⋯' }: { label: string; children: ReactNode; symbol?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);
  return (
    <div className="menu" ref={ref}>
      <button className="icon-btn" aria-haspopup="menu" aria-expanded={open} aria-label={label} title={label} onClick={() => setOpen(!open)}>
        {symbol}
      </button>
      {open && (
        <div className="menu-list" role="menu" onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ children, onClick, danger }: { children: ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button role="menuitem" className={danger ? 'danger' : ''} onClick={onClick}>
      {children}
    </button>
  );
}
