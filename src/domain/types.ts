/**
 * Modelo de dados do Recanto. Ver docs/DATA_MODEL.md.
 * Tudo aqui é dado puro e serializável: nenhuma dependência de React ou Phaser.
 */

export type ID = string;
/** Data de calendário no formato AAAA-MM-DD. */
export type ISODate = string;
export type Timestamp = number;

export const SCHEMA_VERSION = 2;

export type TaskStatus = 'planning' | 'pending' | 'doing' | 'waiting' | 'done' | 'archived';
export type Priority = 'low' | 'normal' | 'high' | 'critical';
export type Horizon = 'quarter' | 'year' | 'long';
export type ContainerType = 'shelf' | 'drawer' | 'cork' | 'box' | 'cabinet' | 'bureau';
export type EssentialRole = 'desk' | 'board' | 'chest';
export type Rot = 0 | 1 | 2 | 3;
export type LightMode = 'auto' | 'morning' | 'afternoon' | 'dusk' | 'night';
export type SortMode = 'manual' | 'name' | 'date' | 'type';

/** Marca de item na lixeira. Itens excluídos juntos compartilham o mesmo lote. */
export interface TrashInfo {
  deletedAt: Timestamp;
  batchId: ID;
}

export interface AvatarLook {
  skin: number;
  hair: number;
  hairStyle: number;
  shirt: number;
  pants: number;
}

export interface Settings {
  reduceMotion: boolean;
  showAvatar: boolean;
  light: LightMode;
  avatar: AvatarLook;
}

/** Pasta do Obsidian ligada ao Recanto (a pasta em si fica guardada à parte, no navegador). */
export interface VaultSettings {
  name: string;
  /** Sincroniza sozinho ao abrir o app e ao voltar para a janela. */
  auto: boolean;
  lastSync: number | null;
  lastSummary?: string;
}

export interface WorldMeta {
  id: 'world';
  vault?: VaultSettings;
  /** Última cópia de segurança automática (ou exportação) feita. */
  lastBackupAt?: number;
  name: string;
  createdAt: Timestamp;
  onboarded: boolean;
  /** Quantas fileiras extras de terrenos o usuário liberou. */
  expansion: number;
  settings: Settings;
  schemaVersion: number;
}

export interface House {
  id: ID;
  name: string;
  /** Tema (interior, emblema, sugestões). */
  themeId: string;
  /** Modelo de exterior no catálogo. */
  modelId: string;
  /** Variação de cor do telhado. */
  color: string;
  /** Terreno ocupado na cidade. */
  lotId: string;
  hidden: boolean;
  order: number;
  createdAt: Timestamp;
  trash?: TrashInfo;
}

/** Móvel lógico: o que dá endereço aos livros. A posição fica em Placement. */
export interface Furniture {
  id: ID;
  houseId: ID;
  name: string;
  kind: 'container' | 'essential';
  containerType?: ContainerType;
  role?: EssentialRole;
  sort: SortMode;
  order: number;
  createdAt: Timestamp;
  trash?: TrashInfo;
}

/** Layout: um objeto posicionado na grade da cidade ('city') ou de uma casa. */
export interface Placement {
  id: ID;
  scope: ID;
  catalogId: string;
  x: number;
  y: number;
  rot: Rot;
  variant: number;
  color: string | null;
  /** Presente quando o objeto é um móvel (essencial ou contêiner). */
  furnitureId?: ID;
  /** Imagem do usuário exibida em quadros. */
  imageId?: ID;
  createdAt: Timestamp;
}

export type FieldType =
  | 'text'
  | 'longtext'
  | 'number'
  | 'currency'
  | 'date'
  | 'recurring'
  | 'phone'
  | 'email'
  | 'link'
  | 'select'
  | 'multiselect'
  | 'checklist'
  | 'file'
  | 'image'
  | 'bookref';

export interface FieldOption {
  id: ID;
  label: string;
}

export interface FieldDef {
  id: ID;
  name: string;
  type: FieldType;
  options?: FieldOption[];
  /** Campo removido do modelo: dados preservados até a remoção definitiva. */
  hidden?: boolean;
}

export interface ChecklistItem {
  id: ID;
  text: string;
  done: boolean;
}

export type FieldValue = string | number | string[] | ChecklistItem[] | null;

export interface Template {
  id: ID;
  name: string;
  system: boolean;
  behavior: 'none' | 'project' | 'note';
  fields: FieldDef[];
  cover: { color: string; emblem: string };
  version: number;
  createdAt: Timestamp;
  trash?: TrashInfo;
}

export type Block =
  | { id: ID; type: 'text'; text: string }
  | { id: ID; type: 'heading'; text: string }
  | { id: ID; type: 'checklist'; items: ChecklistItem[] }
  | { id: ID; type: 'link'; url: string; label: string }
  | { id: ID; type: 'file'; attachmentId: ID | null; caption: string }
  | { id: ID; type: 'image'; attachmentId: ID | null; caption: string }
  | { id: ID; type: 'table'; rows: string[][] }
  | { id: ID; type: 'date'; date: ISODate | null; label: string }
  | { id: ID; type: 'bookref'; bookId: ID | null };

export type BlockType = Block['type'];

export interface ProjectInfo {
  status: TaskStatus;
  dueDate: ISODate | null;
  description: string;
}

/** Ligação de um livro com uma nota Markdown do Obsidian. O caminho é só a localização atual. */
export interface NoteLink {
  path: string;
  /** Pasta esperada pelo Recanto na última sincronização. */
  dir: string;
  /** Hash do arquivo como ficou na última sincronização. */
  hash: string;
  /** Hash do conteúdo do livro (sem partes geradas) na última sincronização. */
  rhash: string;
  /** Hash da seção de tarefas geradas. */
  ghash: string;
  syncedAt: number;
}

export interface Book {
  id: ID;
  note?: NoteLink;
  title: string;
  templateId: ID;
  /** null = no Correio. */
  houseId: ID | null;
  /** null = solto (no chão da casa ou no Correio). */
  furnitureId: ID | null;
  order: number;
  fields: Record<ID, FieldValue>;
  blocks: Block[];
  cover: { color: string | null; emblem: string | null; ribbon: string | null };
  project?: ProjectInfo;
  /** Usuário deixou o livro aberto na mesa. */
  pinnedOpen: boolean;
  archivedAt: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  trash?: TrashInfo;
}

export interface TaskLink {
  id: ID;
  label: string;
  url: string;
}

export type RepeatUnit = 'day' | 'week' | 'month' | 'year';

export interface Repeat {
  every: RepeatUnit;
  interval: number;
}

export interface Task {
  id: ID;
  /** Ao concluir, cria a próxima ocorrência. */
  repeat?: Repeat | null;
  title: string;
  description: string;
  /** null = no Correio. */
  houseId: ID | null;
  bookId: ID | null;
  /** Tarefa avulsa guardada na mesa de trabalho da casa. */
  onDesk: boolean;
  status: TaskStatus;
  priority: Priority;
  tagIds: ID[];
  startDate: ISODate | null;
  dueDate: ISODate | null;
  checklist: ChecklistItem[];
  notes: string;
  links: TaskLink[];
  /** Referências a livros de qualquer casa (sem cópia). */
  refs: ID[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
  completedAt: Timestamp | null;
  archivedAt: Timestamp | null;
  trash?: TrashInfo;
}

export interface Tag {
  id: ID;
  name: string;
  color: string;
}

export interface Goal {
  id: ID;
  title: string;
  description: string;
  horizon: Horizon;
  constellationId: ID;
  /** Livros do modelo Projeto ligados a este objetivo. */
  projectIds: ID[];
  dormant: boolean;
  createdAt: Timestamp;
  trash?: TrashInfo;
}

export interface Constellation {
  id: ID;
  name: string;
  houseId: ID | null;
  order: number;
  createdAt: Timestamp;
}

export interface Attachment {
  id: ID;
  /** Caminho do arquivo dentro do Vault do Obsidian, quando já foi enviado. */
  vaultPath?: string;
  name: string;
  mime: string;
  size: number;
  createdAt: Timestamp;
}

export interface Db {
  meta: Record<string, WorldMeta>;
  houses: Record<ID, House>;
  furniture: Record<ID, Furniture>;
  placements: Record<ID, Placement>;
  books: Record<ID, Book>;
  templates: Record<ID, Template>;
  tasks: Record<ID, Task>;
  tags: Record<ID, Tag>;
  goals: Record<ID, Goal>;
  constellations: Record<ID, Constellation>;
  attachments: Record<ID, Attachment>;
}

export type TableName = keyof Db;

export const TABLES: TableName[] = [
  'meta',
  'houses',
  'furniture',
  'placements',
  'books',
  'templates',
  'tasks',
  'tags',
  'goals',
  'constellations',
  'attachments',
];

export const CITY_SCOPE = 'city';

export function emptyDb(): Db {
  return {
    meta: {},
    houses: {},
    furniture: {},
    placements: {},
    books: {},
    templates: {},
    tasks: {},
    tags: {},
    goals: {},
    constellations: {},
    attachments: {},
  };
}

export const STATUS_LABEL: Record<TaskStatus, string> = {
  planning: 'A planejar',
  pending: 'Pendente',
  doing: 'Em andamento',
  waiting: 'Aguardando',
  done: 'Concluída',
  archived: 'Arquivada',
};
export const STATUS_SYMBOL: Record<TaskStatus, string> = {
  planning: '◌',
  pending: '○',
  doing: '◐',
  waiting: '⧖',
  done: '✓',
  archived: '▣',
};
export const PRIORITY_LABEL: Record<Priority, string> = {
  low: 'Baixa',
  normal: 'Normal',
  high: 'Alta',
  critical: 'Crítica',
};
export const PRIORITY_SYMBOL: Record<Priority, string> = {
  low: '▽',
  normal: '◇',
  high: '△',
  critical: '▲',
};
export const HORIZON_LABEL: Record<Horizon, string> = {
  quarter: 'Este trimestre',
  year: 'Este ano',
  long: 'Longo prazo',
};
export const CONTAINER_LABEL: Record<ContainerType, string> = {
  shelf: 'Estante',
  drawer: 'Gaveteiro',
  cork: 'Mural de cortiça',
  box: 'Caixa',
  cabinet: 'Armário',
  bureau: 'Escrivaninha',
};
export const ROLE_LABEL: Record<EssentialRole, string> = {
  desk: 'Mesa de trabalho',
  board: 'Quadro de avisos',
  chest: 'Baú',
};
export const FIELD_TYPE_LABEL: Record<FieldType, string> = {
  text: 'Texto curto',
  longtext: 'Texto longo',
  number: 'Número',
  currency: 'Valor em moeda',
  date: 'Data',
  recurring: 'Data recorrente',
  phone: 'Telefone',
  email: 'E-mail',
  link: 'Link',
  select: 'Opção única',
  multiselect: 'Opções múltiplas',
  checklist: 'Checklist',
  file: 'Arquivo',
  image: 'Imagem',
  bookref: 'Referência a outro livro',
};
export const STATUSES: TaskStatus[] = ['planning', 'pending', 'doing', 'waiting', 'done', 'archived'];
export const PRIORITIES: Priority[] = ['low', 'normal', 'high', 'critical'];
export const HORIZONS: Horizon[] = ['quarter', 'year', 'long'];

export const REPEAT_LABEL: Record<RepeatUnit, [string, string]> = {
  day: ['dia', 'dias'],
  week: ['semana', 'semanas'],
  month: ['mês', 'meses'],
  year: ['ano', 'anos'],
};
