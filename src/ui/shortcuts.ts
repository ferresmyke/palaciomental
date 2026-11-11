/**
 * Atalhos globais de teclado. Ignorados enquanto o usuário digita em um campo.
 */
import { doRedo, doUndo } from '@/store/actions';
import { getDb } from '@/store/db';
import { gameApi } from '@/store/gameApi';
import { goBack, goToHouseByIndex, goToObservatory, goToPlaza } from '@/store/nav';
import { ui, uiStore } from '@/store/ui';
import { duplicateSelected, nudgeSelected, removeSelected, rotateSelected } from './Reform';

function typing(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable;
}

export function installShortcuts(): () => void {
  const onKey = (e: KeyboardEvent) => {
    const s = uiStore.getState();
    const mod = e.ctrlKey || e.metaKey;
    if (!getDb().meta.world?.onboarded) return;
    if (e.key === 'Escape') {
      if (typing(e) && !s.capture && !s.panels.some((p) => p.type === 'search')) return void (e.target as HTMLElement).blur();
      e.preventDefault();
      return goBack();
    }
    if (mod && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      return ui.push({ type: 'search' });
    }
    if (mod && e.key.toLowerCase() === 'z' && !typing(e)) {
      e.preventDefault();
      return e.shiftKey ? doRedo() : doUndo();
    }
    if (mod && e.key.toLowerCase() === 'y' && !typing(e)) {
      e.preventDefault();
      return doRedo();
    }
    if (typing(e) || mod || e.altKey || s.dialog) return;
    const k = e.key.toLowerCase();
    const api = s.place.kind === 'city' ? gameApi.city : s.place.kind === 'house' ? gameApi.interior : null;
    const arrows: Record<string, [number, number]> = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] };
    if (arrows[k]) {
      e.preventDefault();
      const [dx, dy] = arrows[k];
      if (s.reform && s.selectedId) nudgeSelected(dx, dy);
      else api?.panBy(dx * 96, dy * 96);
      return;
    }
    if (k === '+' || k === '=') return api?.zoomBy(1.2);
    if (k === '-' || k === '_') return api?.zoomBy(1 / 1.2);
    if (s.reform) {
      if (k === 'g') return rotateSelected();
      if (k === 'd') return duplicateSelected();
      if (k === 'delete' || k === 'backspace') return removeSelected();
    }
    switch (k) {
      case 'n':
        e.preventDefault();
        return ui.setCapture(true);
      case '/':
        e.preventDefault();
        return ui.push({ type: 'search' });
      case 'r':
        if (s.place.kind !== 'observatory') ui.setReform(!s.reform);
        return;
      case 'm':
        return ui.open({ type: 'mesa' });
      case 'o':
        return void goToObservatory();
      case '0':
        return void goToPlaza();
      case '?':
        return ui.open({ type: 'help' });
      default:
        if (/^[1-6]$/.test(k)) goToHouseByIndex(Number(k) - 1);
    }
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
