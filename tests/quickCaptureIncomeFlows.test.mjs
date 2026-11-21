import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

test('Quick Capture routes all three income natures through the canonical income API', () => {
  const route = read('src/app/api/quick-capture/route.js');
  assert.match(route, /\['normal', 'debt_borrowed', 'repayment_received'\]/);
  assert.match(route, /new URL\('\/api\/incomes\/add', request\.url\)/);
  assert.match(route, /quickCaptureId: idempotencyKey/);
  assert.match(route, /incomeDueDate/);
  assert.match(route, /repaymentDebtId/);
});

test('the canonical income API makes Quick Capture income writes idempotent', () => {
  const route = read('src/app/api/[...path]/route.js');
  assert.match(route, /const quickCaptureId = \//);
  assert.match(route, /incomeCollection\.doc\('quick_' \+ quickCaptureId/);
  assert.match(route, /existingIncome\.quickCaptureId === quickCaptureId/);
  assert.match(route, /\? \{ quickCaptureId \} : \{\}/);
});

test('a received repayment stores the remaining balance and paid status in the same transaction', () => {
  const route = read('src/app/api/[...path]/route.js');
  assert.match(route, /repaymentRemaining = Math\.max\(0, \(Number\(repaymentDebt\.remaining\) \|\| 0\) - amount\)/);
  assert.match(route, /repaymentCompleted = repaymentRemaining <= 0/);
  assert.match(route, /remaining: repaymentRemaining/);
  assert.match(route, /repaymentDebtRef\.collection\('repayments'\)/);
  assert.match(route, /status = repaymentRemaining <= 0 \? 'paid'/);
});

test('the income capture form shows ordinary, borrowed and received-repayment choices', () => {
  const component = read('src/components/QuickCaptureCoordinator.jsx');
  assert.match(component, /Revenu ordinaire/);
  assert.match(component, /Dette contractée \(argent emprunté\)/);
  assert.match(component, /Remboursement reçu/);
  assert.match(component, /captureOptions\.receivables/);
  assert.match(component, /Date d’échéance/);
  assert.match(component, /Catégorie de revenu/);
});

test('the options endpoint returns both debts owed and receivables', () => {
  const route = read('src/app/api/quick-capture/options/route.js');
  assert.match(route, /const receivables = debtsSnap\.docs/);
  assert.match(route, /data\.type === 'owed_to_me'/);
  assert.match(route, /return NextResponse\.json\(\{ success: true, incomes, debts, receivables, categories \}\)/);
});

test('Quick Capture loads account-defined categories for natural language recognition', () => {
  const optionsRoute = read('src/app/api/quick-capture/options/route.js');
  const component = read('src/components/QuickCaptureCoordinator.jsx');
  const captureRoute = read('src/app/api/quick-capture/route.js');
  assert.match(optionsRoute, /categoriesSnap/);
  assert.ok(optionsRoute.includes('receivables, categories }'));
  assert.match(component, /parseQuickCapture\(rawText, new Date\(\), \{ categories: captureOptions\.categories \}\)/);
  assert.match(component, /item\.type === 'expense'/);
  assert.match(component, /item\.type === 'income'/);
  assert.match(captureRoute, /isAllowedCategory\(userRef, categoryId, 'expense', EXPENSE_CATEGORIES\)/);
  assert.match(captureRoute, /isAllowedCategory\(userRef, categoryId, 'income', INCOME_CATEGORIES\)/);
});

test('Quick Capture demande si une dette correspond à de l’argent ou à des biens pris à crédit', () => {
  const component = read('src/components/QuickCaptureCoordinator.jsx');
  const route = read('src/app/api/quick-capture/route.js');
  const tools = read('src/lib/ai/financialTools.js');

  assert.match(component, /De l’argent/);
  assert.match(component, /Des biens ou services à crédit/);
  assert.match(component, /incomeAvailableAsFunding/);
  assert.match(route, /availableAsFunding: body\.incomeAvailableAsFunding === true/);
  assert.match(tools, /availableAsFunding: \{ type: 'boolean'/);
});

test('Quick Capture peut utiliser comme financement un emprunt explicitement reçu en argent', () => {
  const optionsRoute = read('src/app/api/quick-capture/options/route.js');
  const component = read('src/components/QuickCaptureCoordinator.jsx');
  const financialTools = read('src/lib/ai/financialTools.js');

  assert.match(optionsRoute, /data\.flowType === 'debt_borrowed' && data\.availableAsFunding === true/);
  assert.match(optionsRoute, /availableAsFunding: data\.flowType === 'debt_borrowed'/);
  assert.match(component, /income\.availableAsFunding \? 'Emprunt reçu · ' : ''/);
  assert.match(financialTools, /income\.neutralFlow !== true \|\| isBorrowedFunding/);
});

test('une dette programmée conserve le choix argent reçu ou biens à crédit', () => {
  const createRoute = read('src/app/api/scheduled-transactions/route.js');
  const processRoute = read('src/app/api/scheduled-transactions/process/route.js');

  assert.match(createRoute, /payload\.availableAsFunding = body\.availableAsFunding === true/);
  assert.match(processRoute, /availableAsFunding: schedule\.availableAsFunding === true/);
});

test('Quick Capture ne présélectionne aucune réponse et bloque une dette sans choix', () => {
  const component = read('src/components/QuickCaptureCoordinator.jsx');
  const route = read('src/app/api/quick-capture/route.js');
  const scheduledRoute = read('src/app/api/scheduled-transactions/route.js');
  const debtTools = read('src/lib/ai/financialTools.js');

  assert.match(component, /incomeAvailableAsFunding: null/);
  assert.match(component, /checked=\{draft\.incomeAvailableAsFunding === false\}/);
  assert.match(route, /typeof body\.incomeAvailableAsFunding !== 'boolean'/);
  assert.match(scheduledRoute, /typeof body\.availableAsFunding !== 'boolean'/);
  assert.match(debtTools, /required: \['amount', 'counterpartyType', 'dueDate', 'availableAsFunding'\]/);
});
