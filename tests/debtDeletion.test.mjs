import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = (file) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

test('la page Dettes & prêts demande une confirmation lisible avant suppression', () => {
  const page = read('src/app/(app)/debts/page.js');
  const firestore = read('src/lib/firestore/debts.js');

  assert.match(page, /Supprimer ce dossier/);
  assert.match(page, /<Modal open=\{!!debtToDelete\}/);
  assert.match(page, /Confirmer la suppression/);
  assert.match(page, /Annuler/);
  assert.match(page, /Montant initial/);
  assert.match(page, /Solde restant/);
  assert.match(page, /onClick=\{confirmDeleteDebt\}/);
  assert.match(firestore, /callDebtApi\('delete', 'POST', \{ debtId, confirm: true \}\)/);
});

test('les suppressions de dettes avec un solde restant après remboursement partiel sont bloquées', () => {
  const tools = read('src/lib/ai/financialTools.js');
  const page = read('src/app/(app)/debts/page.js');

  assert.match(tools, /if \(remaining > 0\) \{[\s\S]{0,180}déjà été partiellement remboursée/);
  assert.match(tools, /Cette dette est liée ou en attente de synchronisation/);
  assert.match(page, /const partiallyRepaid = alreadyRepaid > 0 && remaining > 0/);
  assert.match(page, /const cannotDelete = linked \|\| partiallyRepaid/);
});

test('une dette totalement remboursée est archivée et son historique reste conservé', () => {
  const tools = read('src/lib/ai/financialTools.js');
  const debtHook = read('src/lib/firestore/debts.js');
  const apiRoute = read('src/app/api/[...path]/route.js');

  assert.match(tools, /archived: true/);
  assert.match(tools, /status: 'paid'/);
  assert.match(tools, /activity_log/);
  assert.match(tools, /Les remboursements et les opérations financières restent conservés/);
  assert.match(debtHook, /document\.data\(\)\?\.archived !== true/);
  assert.match(apiRoute, /'debts\/delete': \{ POST: handleDeleteDebt \}/);
});

test('la suppression sans remboursement efface aussi l’écriture associée et journalise l’action', () => {
  const tools = read('src/lib/ai/financialTools.js');
  const apiRoute = read('src/app/api/[...path]/route.js');

  assert.match(tools, /transaction\.delete\(ledgerRef\)/);
  assert.match(tools, /relatedRows\.forEach\(\(row\) => transaction\.delete\(expensesRef\.doc\(row\.id\)\)\)/);
  assert.match(tools, /eventType: 'deleted'/);
  assert.match(apiRoute, /body\.confirm !== true/);
  assert.match(apiRoute, /deleteDebtForUser\(uid, body\.debtId \|\| body\.id\)/);
});

test('l’archivage d’une dette convertie en revenu normal ne verrouille pas ce revenu', () => {
  const tools = read('src/lib/ai/financialTools.js');
  const apiRoute = read('src/app/api/[...path]/route.js');

  assert.match(tools, /archivedLedgerSnap\?\.exists && debt\.convertedToIncome !== true/);
  assert.match(apiRoute, /if \(initialIncome\.debtArchived === true\)/);
});
