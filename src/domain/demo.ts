/**
 * Dados de exemplo para explorar o Recanto sem digitar nada: livros, tarefas, objetivos e conexões
 * espalhados pelas seis casas. Só adiciona; nada existente é alterado.
 */
import { addDays, today } from './util';
import * as ops from './ops';
import { TPL_PROJECT } from './seed';
import type { Db, ID } from './types';

export function loadDemo(d: Db, now: number = ops.clock.now()): number {
  const t0 = today(now);
  const house = (name: string) => Object.values(d.houses).find((h) => !h.trash && h.name === name);
  const shelf = (h: string, n: string): ID | null => {
    const hh = house(h);
    return hh ? (Object.values(d.furniture).find((f) => f.houseId === hh.id && !f.trash && f.name === n)?.id ?? null) : null;
  };
  const hid = (n: string): ID | null => house(n)?.id ?? null;
  const book = (title: string, tpl: string | undefined, h: string, f: string): ID => {
    const sid = shelf(h, f);
    return ops.createBook(d, { title, templateId: tpl, furnitureId: sid, houseId: sid ? undefined : hid(h) });
  };
  let n = 0;

  // Pessoas e contatos
  const helena = book('Dra. Helena Prado', 'tpl_person', 'Hospedaria', 'Pessoas');
  ops.setBookField(d, helena, 'p_phone', '(11) 98888-1234');
  ops.setBookField(d, helena, 'p_birthday', addDays(t0, 9));
  ops.setBookField(d, helena, 'p_relation', 'p_relation_o2');
  const marcos = book('Marcos Tavares', 'tpl_person', 'Hospedaria', 'Pessoas');
  ops.setBookField(d, marcos, 'p_relation', 'p_relation_o0');
  ops.setBookField(d, marcos, 'p_birthday', addDays(t0, 40));
  book('Vó Lurdes', 'tpl_person', 'Hospedaria', 'Pessoas');
  book('Júlia e Pedro', 'tpl_person', 'Hospedaria', 'Pessoas');
  const festa = book('Aniversário da Vó Lurdes', undefined, 'Hospedaria', 'Eventos');
  ops.addBlock(d, festa, 'text', undefined, { text: 'Almoço na casa da Vó. Levar a sobremesa e o presente combinado com [[Júlia e Pedro]].' });
  ops.addBlock(d, festa, 'checklist', undefined, { items: [{ id: 'f1', text: 'Comprar o presente', done: false }, { id: 'f2', text: 'Encomendar o bolo', done: false }] });

  // Saúde
  const consulta = book('Consulta de rotina', 'tpl_appointment', 'Ginásio', 'Consultas');
  ops.setBookField(d, consulta, 'a_date', addDays(t0, 6));
  ops.setBookField(d, consulta, 'a_who', helena);
  ops.setBookField(d, consulta, 'a_place', 'Clínica Vida, sala 4');
  ops.addBlock(d, consulta, 'text', undefined, { text: 'Pedir o resultado dos exames de [[Exames de sangue 2026]].' });
  const exames = book('Exames de sangue 2026', undefined, 'Ginásio', 'Exames');
  ops.addBlock(d, exames, 'text', undefined, { text: 'Jejum de 8 horas. Colesterol e glicemia dentro do esperado; repetir em 6 meses.' });
  const treino = book('Plano de treino', TPL_PROJECT, 'Ginásio', 'Rotinas');
  const corrida = ops.createTask(d, { title: 'Correr 5 km', bookId: treino, dueDate: addDays(t0, 1) });
  ops.setTaskRepeat(d, corrida, { every: 'day', interval: 2 });
  const alongar = ops.createTask(d, { title: 'Alongar por 10 minutos', bookId: treino });
  ops.setTaskRepeat(d, alongar, { every: 'day', interval: 1 });
  ops.updateTask(d, ops.createTask(d, { title: 'Marcar avaliação física', bookId: treino, dueDate: addDays(t0, 12) }), { priority: 'high' });

  // Casa
  const contrato = book('Contrato de aluguel', 'tpl_contract', 'Lar', 'Documentos');
  ops.setBookField(d, contrato, 'c_party', 'Imobiliária Sol');
  ops.setBookField(d, contrato, 'c_value', 2350);
  ops.setBookField(d, contrato, 'c_end', addDays(t0, 120));
  ops.addBlock(d, contrato, 'text', undefined, { text: 'Reajuste anual pelo IGP-M, sempre em março.' });
  book('Manual da geladeira', undefined, 'Lar', 'Documentos');
  book('Lista de compras da semana', undefined, 'Lar', 'Compras');
  const caldeira = book('Revisão do aquecedor', undefined, 'Lar', 'Manutenção');
  ops.addBlock(d, caldeira, 'checklist', undefined, { items: [{ id: 'c1', text: 'Chamar o técnico', done: false }, { id: 'c2', text: 'Trocar o filtro', done: true }] });
  const aluguel = ops.createTask(d, { title: 'Pagar o aluguel', houseId: hid('Lar'), onDesk: true, dueDate: addDays(t0, 3), priority: 'high' });
  ops.setTaskRepeat(d, aluguel, { every: 'month', interval: 1 });
  ops.createTask(d, { title: 'Trocar a lâmpada da varanda', houseId: hid('Lar') });
  ops.createBook(d, { title: 'Ideia: horta vertical na varanda', houseId: hid('Lar') });

  // Dinheiro
  for (const t of ['IPTU 2026', 'Conta de luz', 'Seguro do carro']) {
    const c = book(t, 'tpl_receipt', 'Tesouraria', 'Comprovantes');
    ops.setBookField(d, c, 'r_date', addDays(t0, -12));
  }
  ops.createTask(d, { title: 'Declarar o imposto de renda', houseId: hid('Tesouraria'), dueDate: addDays(t0, -2), priority: 'critical' });
  ops.createTask(d, { title: 'Conferir a fatura do cartão', houseId: hid('Tesouraria'), onDesk: true, dueDate: t0 });
  book('Orçamento de 2027', undefined, 'Tesouraria', 'Orçamento');

  // Trabalho: projeto com tarefas, reunião e fornecedor ligados
  const site = book('Site novo da empresa', TPL_PROJECT, 'Oficina', 'Projetos');
  d.books[site].project!.description = 'Redesenhar o site e publicar até o fim do trimestre.';
  d.books[site].project!.dueDate = addDays(t0, 45);
  const fornecedor = book('Estúdio Pixel (fornecedor)', 'tpl_person', 'Oficina', 'Equipes');
  const reuniao = book('Reunião de kickoff', undefined, 'Oficina', 'Reuniões');
  ops.addBlock(d, reuniao, 'text', undefined, { text: 'Decidimos seguir com o [[Site novo da empresa]] e contratar o [[Estúdio Pixel (fornecedor)]].' });
  ops.addBlock(d, site, 'bookref', undefined, { bookId: fornecedor });
  const tarefasSite: [string, number, boolean][] = [['Briefing com a diretoria', -6, true], ['Wireframes das páginas', -1, true], ['Redigir os textos', 5, false], ['Revisar com o jurídico', 14, false], ['Publicar', 30, false]];
  tarefasSite.forEach(([title, due, done], i) => {
    const id = ops.createTask(d, { title, bookId: site, dueDate: addDays(t0, due) });
    if (done) ops.updateTask(d, id, { status: 'done' });
    else if (i === 2) ops.updateTask(d, id, { status: 'doing' });
  });
  const proc = book('Processo de aprovação de compras', undefined, 'Oficina', 'Processos');
  ops.addBlock(d, proc, 'table', undefined, { rows: [['Valor', 'Quem aprova'], ['Até R$ 1.000', 'Gerente'], ['Acima disso', 'Diretoria']] });

  // Estudos e criação
  const curso = book('Curso de aquarela', TPL_PROJECT, 'Ateliê', 'Cursos');
  ops.createTask(d, { title: 'Comprar pincéis e papel', bookId: curso, dueDate: addDays(t0, 2) });
  ops.createTask(d, { title: 'Assistir à aula 1', bookId: curso });
  book('Livro: A arte de aprender', undefined, 'Ateliê', 'Livros');
  const ideia = book('Ideia: diário ilustrado', undefined, 'Ateliê', 'Ideias');
  ops.addBlock(d, ideia, 'text', undefined, { text: 'Um desenho por dia, ligado ao [[Curso de aquarela]].' });

  // Correio
  ops.createTask(d, { title: 'Responder o e-mail da escola' });
  ops.createTask(d, { title: 'Ver o horário do pilates' });
  ops.createBook(d, { title: 'Receita do bolo de cenoura' });

  // Objetivos
  const cons = (name: string) => Object.values(d.constellations).find((c) => c.name === name)?.id;
  const g1 = ops.createGoal(d, { title: 'Lançar o site novo', constellationId: cons('Oficina'), horizon: 'quarter' });
  ops.linkProject(d, g1, site);
  const g2 = ops.createGoal(d, { title: 'Ficar em forma', constellationId: cons('Ginásio'), horizon: 'year' });
  ops.linkProject(d, g2, treino);
  const g3 = ops.createGoal(d, { title: 'Expor uma aquarela', constellationId: cons('Ateliê'), horizon: 'long' });
  ops.linkProject(d, g3, curso);
  ops.createGoal(d, { title: 'Reserva de emergência', constellationId: cons('Tesouraria'), horizon: 'year' });
  ops.updateGoal(d, ops.createGoal(d, { title: 'Aprender francês', constellationId: cons('Ateliê'), horizon: 'long' }), { dormant: true });

  ops.createTag(d, 'urgente', 'vinho');
  n = Object.values(d.books).length;
  return n;
}
