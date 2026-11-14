import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAIReportPeriod } from '../src/lib/ai/reportPeriod.mjs';

test('sans date précisée, Mč utilise le mois courant jusqu’à aujourd’hui', () => {
  assert.deepEqual(resolveAIReportPeriod('Fais mon bilan financier', '2026-11-14'), {
    startDate: '2026-11-01', endDate: '2026-11-14', source: 'current-month-default',
  });
});

test('Mč respecte strictement les dates sélectionnées dans le tableau de bord', () => {
  assert.deepEqual(resolveAIReportPeriod('Analyse du 2026-10-03 au 2026-10-19', '2026-11-14'), {
    startDate: '2026-10-03', endDate: '2026-10-19', source: 'explicit-range',
  });
});

test('Mč comprend un mois demandé par son nom sans additionner le mois courant', () => {
  assert.deepEqual(resolveAIReportPeriod('Mes dépenses en octobre 2026', '2026-11-14'), {
    startDate: '2026-10-01', endDate: '2026-10-31', source: 'named-month',
  });
});

test('Mč borne le mois précédent sans utiliser les autres mois', () => {
  assert.deepEqual(resolveAIReportPeriod('Bilan du mois dernier', '2026-11-14'), {
    startDate: '2026-10-01', endDate: '2026-10-31', source: 'previous-month',
  });
});

test('une seule date demandée limite le bilan à cette journée', () => {
  assert.deepEqual(resolveAIReportPeriod('Quelles dépenses le 2026-11-07 ?', '2026-11-14'), {
    startDate: '2026-11-07', endDate: '2026-11-07', source: 'explicit-day',
  });
});
