import type { Db, FieldDef, FieldType, Template, WorldMeta } from './types';
import { SCHEMA_VERSION } from './types';

export const TPL_NOTE = 'tpl_note';
export const TPL_PROJECT = 'tpl_project';

function f(id: string, name: string, type: FieldType, options?: string[]): FieldDef {
  return {
    id,
    name,
    type,
    ...(options ? { options: options.map((label, i) => ({ id: `${id}_o${i}`, label })) } : {}),
  };
}

function tpl(
  id: string,
  name: string,
  behavior: Template['behavior'],
  color: string,
  emblem: string,
  fields: FieldDef[],
): Template {
  return { id, name, system: true, behavior, fields, cover: { color, emblem }, version: 1, createdAt: 0 };
}

/** Modelos prontos de sistema (seção 8.7). */
export function systemTemplates(): Template[] {
  return [
    tpl(TPL_NOTE, 'Nota', 'note', 'ocre', 'note', []),
    tpl(TPL_PROJECT, 'Projeto', 'project', 'azul', 'star', []),
    tpl('tpl_person', 'Pessoa', 'none', 'vinho', 'person', [
      f('p_phone', 'Telefone', 'phone'),
      f('p_email', 'E-mail', 'email'),
      f('p_birthday', 'Aniversário', 'recurring'),
      f('p_relation', 'Relação', 'select', ['Família', 'Amizade', 'Trabalho', 'Vizinhança', 'Outra']),
      f('p_gifts', 'Presentes que gostaria', 'longtext'),
      f('p_notes', 'Notas', 'longtext'),
    ]),
    tpl('tpl_contract', 'Contrato', 'none', 'verde', 'key', [
      f('c_party', 'Com quem', 'text'),
      f('c_value', 'Valor', 'currency'),
      f('c_start', 'Início', 'date'),
      f('c_end', 'Vencimento', 'date'),
      f('c_file', 'Documento', 'file'),
      f('c_notes', 'Observações', 'longtext'),
    ]),
    tpl('tpl_receipt', 'Comprovante', 'none', 'cinza', 'coin', [
      f('r_value', 'Valor', 'currency'),
      f('r_date', 'Data', 'date'),
      f('r_category', 'Categoria', 'select', ['Casa', 'Saúde', 'Transporte', 'Estudos', 'Lazer', 'Outros']),
      f('r_file', 'Arquivo', 'file'),
    ]),
    tpl('tpl_appointment', 'Consulta', 'none', 'rosa', 'heart', [
      f('a_date', 'Data', 'date'),
      f('a_who', 'Profissional', 'bookref'),
      f('a_place', 'Local', 'text'),
      f('a_prep', 'Levar ou preparar', 'checklist'),
      f('a_notes', 'Anotações', 'longtext'),
    ]),
    tpl('tpl_routine', 'Rotina', 'none', 'musgo', 'leaf', [
      f('t_freq', 'Frequência', 'select', ['Diária', 'Semanal', 'Mensal', 'Quando der']),
      f('t_steps', 'Passos', 'checklist'),
      f('t_notes', 'Notas', 'longtext'),
    ]),
    tpl('tpl_info', 'Informação útil', 'none', 'ebano', 'book', [
      f('i_what', 'O que é', 'text'),
      f('i_link', 'Link', 'link'),
      f('i_notes', 'Detalhes', 'longtext'),
    ]),
  ];
}

export function defaultWorld(now: number): WorldMeta {
  return {
    id: 'world',
    name: 'Recanto',
    createdAt: now,
    onboarded: false,
    expansion: 0,
    schemaVersion: SCHEMA_VERSION,
    settings: {
      reduceMotion: false,
      showAvatar: true,
      light: 'auto',
      avatar: { skin: 1, hair: 2, hairStyle: 0, shirt: 1, pants: 0 },
    },
  };
}

/** Garante mundo e modelos de sistema. Idempotente. */
export function ensureSeed(db: Db, now: number): void {
  if (!db.meta.world) db.meta.world = defaultWorld(now);
  for (const t of systemTemplates()) if (!db.templates[t.id]) db.templates[t.id] = { ...t, createdAt: now };
}
