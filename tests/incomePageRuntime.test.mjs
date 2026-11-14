import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const incomePage = fs.readFileSync(new URL('../src/app/(app)/income/page.js', import.meta.url), 'utf8');
const errorPage = fs.readFileSync(new URL('../src/app/error.js', import.meta.url), 'utf8');

test('les états lus par le suivi du revenu sont initialisés avant son useEffect', () => {
  const selectedIncomeState = incomePage.indexOf('const [selectedIncome, setSelectedIncome] = useState(null);');
  const expenseDetailsState = incomePage.indexOf('const [incomeExpenseDetails, setIncomeExpenseDetails] = useState(');
  const trackingEffect = incomePage.indexOf('useEffect(() => {\n    if (!selectedIncome?.id');

  assert.notEqual(selectedIncomeState, -1, 'état selectedIncome introuvable');
  assert.notEqual(expenseDetailsState, -1, 'état incomeExpenseDetails introuvable');
  assert.notEqual(trackingEffect, -1, 'effet de suivi du revenu introuvable');
  assert.ok(selectedIncomeState < trackingEffect, 'selectedIncome doit être initialisé avant le useEffect');
  assert.ok(expenseDetailsState < trackingEffect, 'incomeExpenseDetails doit être initialisé avant le useEffect');
});

test('une erreur de rendu affiche une interface de récupération au lieu d’un écran vide', () => {
  assert.match(errorPage, /role="alert"/);
  assert.match(errorPage, /onClick=\{\(\) => reset\(\)\}/);
  assert.match(errorPage, /href="\/support"/);
});


test('une erreur provenant du layout racine est récupérée par le boundary global', () => {
  const globalError = fs.readFileSync(new URL('../src/app/global-error.js', import.meta.url), 'utf8');
  assert.match(globalError, /<html lang="fr">/);
  assert.match(globalError, /<body/);
  assert.match(globalError, /role="alert"/);
  assert.match(globalError, /onClick=\{\(\) => reset\(\)\}/);
  assert.match(globalError, /href="\/support"/);
});
