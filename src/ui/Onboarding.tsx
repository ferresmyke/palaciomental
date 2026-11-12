import { useState } from 'react';
import { loadDemo } from '@/domain/demo';
import * as ops from '@/domain/ops';
import { run } from '@/store/actions';

const STORY = [
  'Toda vida junta coisas: contas, planos, pessoas, ideias. Elas ficam espalhadas pela cabeça, por aplicativos, por papéis.',
  'Este é o Recanto. Aqui cada coisa tem uma casa, uma estante, um lugar. Ninguém cobra nada de você.',
  'A cada visita, o que estava solto encontra seu lugar, e o Recanto fica um pouco melhor. E o Recanto é seu: você decide como ele é.',
];

/** Primeira abertura: três telas curtas, o nome da cidade e a escolha de como começar. */
export function Onboarding() {
  const [step, setStep] = useState(0);
  const [name, setName] = useState('Recanto');
  const [mode, setMode] = useState<'six' | 'zero' | 'demo'>('six');
  const start = () =>
    run('Começar o Recanto', (d) => {
      ops.completeOnboarding(d, { name, mode });
      if (mode === 'demo') loadDemo(d);
    }, { transient: true });
  return (
    <div className="onboarding" role="dialog" aria-label="Boas-vindas ao Recanto" aria-modal="true">
      <div className="onboarding-card">
        <div className="onboarding-dots" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <i key={i} className={i === step ? 'on' : ''} />
          ))}
        </div>
        {step < 3 ? (
          <>
            <p className="story" key={step}>
              {STORY[step]}
            </p>
            <div className="btn-row spread">
              <button className="btn ghost" onClick={() => setStep(3)}>
                Pular
              </button>
              <button className="btn" autoFocus onClick={() => setStep(step + 1)}>
                Continuar
              </button>
            </div>
          </>
        ) : (
          <>
            <h1>O seu Recanto</h1>
            <label className="field">
              <span className="field-label">Nome da cidade</span>
              <input className="field-input" value={name} autoFocus maxLength={40} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && start()} placeholder="Recanto" />
              <span className="field-hint">Por exemplo, “Recanto da Ana”. Dá para mudar depois.</span>
            </label>
            <div className="start-choices" role="radiogroup" aria-label="Como começar">
              <label className={`choice${mode === 'six' ? ' on' : ''}`}>
                <input type="radio" name="start" checked={mode === 'six'} onChange={() => setMode('six')} />
                <span>
                  <strong>Começar com as seis casas sugeridas</strong>
                  <span className="muted">Oficina, Lar, Tesouraria, Ginásio, Hospedaria e Ateliê, já mobiliadas. Recomendado.</span>
                </span>
              </label>
              <label className={`choice${mode === 'demo' ? ' on' : ''}`}>
                <input type="radio" name="start" checked={mode === 'demo'} onChange={() => setMode('demo')} />
                <span>
                  <strong>Explorar com exemplos</strong>
                  <span className="muted">As seis casas já com pessoas, contratos, projetos, tarefas e objetivos de exemplo, para você navegar e testar. Dá para apagar tudo depois.</span>
                </span>
              </label>
              <label className={`choice${mode === 'zero' ? ' on' : ''}`}>
                <input type="radio" name="start" checked={mode === 'zero'} onChange={() => setMode('zero')} />
                <span>
                  <strong>Começar do zero</strong>
                  <span className="muted">Só a Praça, o Correio e terrenos livres. Você cria as suas casas.</span>
                </span>
              </label>
            </div>
            <p className="muted">Nos dois casos, tudo pode ser editado depois.</p>
            <button className="btn wide big" onClick={start}>
              Entrar no Recanto
            </button>
          </>
        )}
      </div>
    </div>
  );
}
