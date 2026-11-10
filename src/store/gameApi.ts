/**
 * Contrato entre a navegação e as cenas. As cenas registram sua API ao iniciar;
 * a interface nunca importa o Phaser.
 */
import type { Cell, SiteId } from '@/domain/city';
import type { ID } from '@/domain/types';
import { Emitter } from './bus';

export interface CityApi {
  walkToCell(cell: Cell): Promise<boolean>;
  walkToHouse(houseId: ID): Promise<boolean>;
  walkToSite(site: SiteId): Promise<boolean>;
  /** Animação de entrada: aproxima a câmera e some com o telhado. */
  enterHouse(houseId: ID): Promise<void>;
  focusCell(x: number, y: number): void;
  focusHouse(houseId: ID): void;
  placeAvatarAtHouse(houseId: ID): void;
  placeAvatarAtSite(site: SiteId): void;
  zoomBy(factor: number): void;
  panBy(dx: number, dy: number): void;
}

export interface InteriorApi {
  walkToFurniture(furnitureId: ID): Promise<boolean>;
  walkToDoor(): Promise<boolean>;
  zoomBy(factor: number): void;
  panBy(dx: number, dy: number): void;
}

export interface ObservatoryApi {
  focusGoal(goalId: ID): void;
}

export const gameApi: { city: CityApi | null; interior: InteriorApi | null; observatory: ObservatoryApi | null } = {
  city: null,
  interior: null,
  observatory: null,
};

export const gameBus = new Emitter<{
  'scene:ready': 'city' | 'house' | 'observatory';
  /** Pedido para soltar na cena o objeto que vinha sendo arrastado do catálogo. */
  'reform:drop': { clientX: number; clientY: number };
  'reform:pointer': { clientX: number; clientY: number };
  'item:drop': { clientX: number; clientY: number };
  'item:pointer': { clientX: number; clientY: number };
}>();
