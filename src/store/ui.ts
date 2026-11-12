/**
 * Estado de interface (não persistido, não reversível): onde o usuário está,
 * painéis abertos, Modo Reforma, avisos. React e Phaser leem daqui sem se conhecerem.
 */
import { createStore } from 'zustand/vanilla';
import type { ID, Rot } from '@/domain/types';

export type Place = { kind: 'city' } | { kind: 'house'; houseId: ID } | { kind: 'observatory' };

export type Panel =
  | { type: 'book'; id: ID }
  | { type: 'task'; id: ID }
  | { type: 'furniture'; id: ID }
  | { type: 'desk'; houseId: ID }
  | { type: 'board'; houseId: ID }
  | { type: 'chest'; houseId: ID | null }
  | { type: 'house'; id: ID }
  | { type: 'houses' }
  | { type: 'newHouse'; lotId?: string }
  | { type: 'correio' }
  | { type: 'mesa' }
  | { type: 'quadro' }
  | { type: 'search' }
  | { type: 'ronda' }
  | { type: 'goals' }
  | { type: 'goal'; id: ID }
  | { type: 'settings' }
  | { type: 'trash' }
  | { type: 'templates'; id?: ID }
  | { type: 'store'; kind: 'book' | 'task'; id: ID }
  | { type: 'deleteHouse'; id: ID }
  | { type: 'deleteFurniture'; id: ID }
  | { type: 'deleteTemplate'; id: ID }
  | { type: 'deleteConstellation'; id: ID }
  | { type: 'restoreDest'; items: { kind: 'book' | 'task'; id: ID }[] }
  | { type: 'obsidian' }
  | { type: 'map'; id?: ID }
  | { type: 'help' };

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error' | 'ok';
  actionLabel?: string;
  action?: () => void;
}

export interface ConfirmDialog {
  title: string;
  body?: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
}

export interface Placing {
  catalogId: string;
  variant: number;
  color: string | null;
  rot: Rot;
}

export interface ViewRect {
  x: number;
  y: number;
  w: number;
  h: number;
  worldW: number;
  worldH: number;
}

export interface Highlight {
  kind: 'book' | 'task' | 'furniture' | 'house' | 'goal';
  id: ID;
}

export interface UiState {
  place: Place;
  panels: Panel[];
  reform: boolean;
  /** Objeto (placement) selecionado no Modo Reforma. */
  selectedId: ID | null;
  /** Casa selecionada na reforma da cidade. */
  selectedHouseId: ID | null;
  placing: Placing | null;
  movingHouseId: ID | null;
  capture: boolean;
  toasts: Toast[];
  dialog: ConfirmDialog | null;
  highlight: Highlight | null;
  view: ViewRect;
  avatar: { x: number; y: number } | null;
  traveling: boolean;
  /** Item solto sendo arrastado até um móvel. */
  dragItem: { kind: 'book' | 'task'; id: ID } | null;
  hint: string | null;
  /** Hora simulada para a luz (testes e pré-visualização); null = relógio real. */
  lightPreview: number | null;
  /** De onde o usuário veio ao trocar de cena (para posicionar o avatar). */
  cameFrom: Place | null;
}

export const uiStore = createStore<UiState>(() => ({
  place: { kind: 'city' },
  panels: [],
  reform: false,
  selectedId: null,
  selectedHouseId: null,
  placing: null,
  movingHouseId: null,
  capture: false,
  toasts: [],
  dialog: null,
  highlight: null,
  view: { x: 0, y: 0, w: 1, h: 1, worldW: 1, worldH: 1 },
  avatar: null,
  traveling: false,
  dragItem: null,
  hint: null,
  lightPreview: null,
  cameFrom: null,
}));

const set = uiStore.setState;
const get = uiStore.getState;
let toastSeq = 1;

export const ui = {
  get,
  /** Abre um painel substituindo os atuais. */
  open(panel: Panel): void {
    set({ panels: [panel], capture: false });
  },
  /** Empilha um painel (o botão voltar retorna ao anterior). */
  push(panel: Panel): void {
    const cur = get().panels;
    const top = cur[cur.length - 1];
    if (top && JSON.stringify(top) === JSON.stringify(panel)) return;
    set({ panels: [...cur, panel] });
  },
  back(): void {
    set({ panels: get().panels.slice(0, -1) });
  },
  closeAll(): void {
    if (get().panels.length) set({ panels: [] });
  },
  toast(text: string, kind: Toast['kind'] = 'info', actionLabel?: string, action?: () => void): void {
    const id = toastSeq++;
    set({ toasts: [...get().toasts.slice(-3), { id, text, kind, actionLabel, action }] });
    setTimeout(() => ui.dismissToast(id), action ? 8000 : 4200);
  },
  dismissToast(id: number): void {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
  confirm(dialog: ConfirmDialog): void {
    set({ dialog });
  },
  closeDialog(): void {
    set({ dialog: null });
  },
  setReform(on: boolean): void {
    set({ reform: on, selectedId: null, selectedHouseId: null, placing: null, movingHouseId: null, hint: null, ...(on ? { panels: [] } : {}) });
  },
  select(id: ID | null): void {
    set({ selectedId: id, selectedHouseId: null, placing: null, movingHouseId: null, hint: null });
  },
  selectHouse(id: ID | null): void {
    set({ selectedHouseId: id, selectedId: null, placing: null, movingHouseId: null, hint: null });
  },
  startPlacing(p: Placing | null): void {
    set({ placing: p, selectedId: null, selectedHouseId: null, movingHouseId: null, hint: null });
  },
  highlight(h: Highlight | null, ms = 3500): void {
    set({ highlight: h });
    if (h) setTimeout(() => get().highlight === h && set({ highlight: null }), ms);
  },
  setCapture(on: boolean): void {
    set({ capture: on });
  },
};
