/**
 * Hospeda o Phaser: uma instância de jogo com três cenas (Cidade, Interior, Observatório).
 * A cena ativa segue `ui.place`; a interface em React nunca toca nos objetos do Phaser.
 */
import Phaser from 'phaser';
import { uiStore, type Place } from '@/store/ui';
import { CityScene } from './scenes/CityScene';
import { InteriorScene } from './scenes/InteriorScene';
import { ObservatoryScene } from './scenes/ObservatoryScene';

const KEYS: Place['kind'][] = ['city', 'house', 'observatory'];

export function mountGame(parent: HTMLElement): () => void {
  const game = new Phaser.Game({
    type: Phaser.WEBGL,
    parent,
    backgroundColor: '#17110f',
    banner: false,
    disableContextMenu: true,
    audio: { noAudio: true },
    input: { keyboard: false, activePointers: 2 },
    scale: { mode: Phaser.Scale.RESIZE, width: parent.clientWidth || 800, height: parent.clientHeight || 600 },
    render: { smoothPixelArt: true, antialias: false, powerPreference: 'high-performance' },
    fps: { target: 60 },
  });
  const hook = (window as unknown as { __pm?: Record<string, unknown> }).__pm;
  if (hook) hook.game = game;
  game.scene.add('city', CityScene);
  game.scene.add('house', InteriorScene);
  game.scene.add('observatory', ObservatoryScene);

  let current = '';
  const show = (place: Place) => {
    const sig = JSON.stringify(place);
    if (sig === current) return;
    current = sig;
    for (const k of KEYS) if (game.scene.isActive(k) || game.scene.isPaused(k)) game.scene.stop(k);
    game.scene.start(place.kind);
  };
  let unsub = () => {};
  const boot = () => {
    show(uiStore.getState().place);
    unsub = uiStore.subscribe((s) => show(s.place));
  };
  if (game.isBooted) boot();
  else game.events.once(Phaser.Core.Events.READY, boot);

  const ro = new ResizeObserver(() => game.scale.refresh());
  ro.observe(parent);
  return () => {
    unsub();
    ro.disconnect();
    game.destroy(true);
  };
}
