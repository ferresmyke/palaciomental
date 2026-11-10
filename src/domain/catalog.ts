/**
 * Catálogo por manifesto: os objetos disponíveis vêm de arquivos de dados em src/catalog.
 * Novos itens que usem uma receita de sprite existente entram sem alterar código.
 */
import objectsJson from '@/catalog/objects.json';
import housesJson from '@/catalog/houses.json';
import themesJson from '@/catalog/themes.json';
import type { ContainerType, EssentialRole, Rot } from './types';

export type Mount = 'floor' | 'wall' | 'rug' | 'city' | 'ground';

export interface CatalogItem {
  id: string;
  name: string;
  category: string;
  scope: 'interior' | 'city';
  kind: 'essential' | 'container' | 'decor';
  mount: Mount;
  w: number;
  h: number;
  recipe: string;
  variants: string[];
  colors: string[];
  role?: EssentialRole;
  containerType?: ContainerType;
  rotatable?: boolean;
  solid?: boolean;
  light?: boolean;
  animated?: boolean;
  acceptsImage?: boolean;
}

export interface HouseModel {
  id: string;
  name: string;
  desc: string;
  walls: 'timber' | 'plaster' | 'stone' | 'wood';
  roof: 'tile' | 'gable' | 'thatch';
  colors: string[];
}

export interface ThemeDecor {
  catalogId: string;
  x: number;
  y: number;
  rot: Rot;
  variant: number;
  color: string | null;
}

export interface Theme {
  id: string;
  name: string;
  area: string;
  desc: string;
  emblem: string;
  model: string;
  color: string;
  wall: string;
  floor: string;
  shelves: string[];
  decor: ThemeDecor[];
  loose: string;
}

export const CATALOG = objectsJson as CatalogItem[];
export const HOUSE_MODELS = housesJson as HouseModel[];
export const THEMES = themesJson as Theme[];

const byId = new Map(CATALOG.map((i) => [i.id, i]));
const modelById = new Map(HOUSE_MODELS.map((m) => [m.id, m]));
const themeMap = new Map(THEMES.map((t) => [t.id, t]));

export function catalogItem(id: string): CatalogItem {
  const item = byId.get(id);
  if (!item) throw new Error(`Objeto de catálogo desconhecido: ${id}`);
  return item;
}

export function findCatalogItem(id: string): CatalogItem | undefined {
  return byId.get(id);
}

export function houseModel(id: string): HouseModel {
  return modelById.get(id) ?? HOUSE_MODELS[0];
}

export function themeById(id: string): Theme {
  return themeMap.get(id) ?? themeMap.get('simples')!;
}

/** Temas que formam o conjunto inicial de casas (seção 6 do documento mestre). */
export const STARTER_THEMES = ['oficina', 'lar', 'tesouraria', 'ginasio', 'hospedaria', 'atelie'];

export function containerCatalogId(type: ContainerType): string {
  const item = CATALOG.find((i) => i.kind === 'container' && i.containerType === type);
  if (!item) throw new Error(`Sem objeto de catálogo para ${type}`);
  return item.id;
}

export function essentialCatalogId(role: EssentialRole): string {
  return CATALOG.find((i) => i.kind === 'essential' && i.role === role)!.id;
}

export const CATEGORY_LABEL: Record<string, string> = {
  essenciais: 'Essenciais',
  moveis: 'Móveis',
  decoracao: 'Decoração',
  tematicos: 'Temáticos',
  parede: 'Parede',
  tapetes: 'Tapetes',
  natureza: 'Natureza',
  objetos: 'Objetos',
};

export const EMBLEMS = ['hammer', 'pot', 'coin', 'heart', 'mug', 'brush', 'leaf', 'star', 'key', 'book', 'person', 'note'];
