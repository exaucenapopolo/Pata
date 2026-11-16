import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuickCapture } from '../src/lib/quickCapture/parser.mjs';
const now = new Date('2026-11-15T12:00:00.000Z');

test('reconnaît une dépense de taxi et son montant', () => {
  const result = parseQuickCapture("J'ai dépensé 1 500 FCFA pour le taxi", now);
  assert.equal(result.type, 'expense');
  assert.equal(result.amount, 1500);
  assert.equal(result.categoryId, 'transport');
  assert.equal(result.date, '2026-11-15');
});
test('reconnaît un revenu de salaire', () => {
  const result = parseQuickCapture("J'ai reçu 15 000 de salaire", now);
  assert.equal(result.type, 'income');
  assert.equal(result.amount, 15000);
  assert.equal(result.categoryId, 'salary');
  assert.equal(result.source, 'Salaire');
});
test('déduit une dépense depuis une saisie courte', () => {
  const result = parseQuickCapture('2 000 repas', now);
  assert.equal(result.type, 'expense');
  assert.equal(result.amount, 2000);
  assert.equal(result.categoryId, 'food');
});
test('ne devine pas le sens si aucune information ne permet de le déterminer', () => {
  const result = parseQuickCapture('15 000', now);
  assert.equal(result.amount, 15000);
  assert.equal(result.type, null);
  assert.equal(result.needsReview, true);
});
test('reconnaît une date relative hier', () => {
  const result = parseQuickCapture('Taxi 1 500 FCFA hier', now);
  assert.equal(result.date, '2026-11-14');
});
test('reconnaît une saisie courte sans verbe ni formulaire', () => {
  const result = parseQuickCapture('transport 500', now);
  assert.equal(result.type, 'expense');
  assert.equal(result.amount, 500);
  assert.equal(result.categoryId, 'transport');
  assert.equal(result.date, '2026-11-15');
  assert.equal(result.needsReview, false);
});
test('reconnaît un revenu de salaire en saisie courte', () => {
  const result = parseQuickCapture('salaire 100 000', now);
  assert.equal(result.type, 'income');
  assert.equal(result.amount, 100000);
  assert.equal(result.categoryId, 'salary');
  assert.equal(result.source, 'Salaire');
  assert.equal(result.needsReview, false);
});
test('ne confond pas une date ISO avec le montant', () => {
  const result = parseQuickCapture('transport 500 le 2026-11-14', now);
  assert.equal(result.amount, 500);
  assert.equal(result.date, '2026-11-14');
});
test('conserve le nom de la source d’un revenu opérateur Mobile Money', () => {
  const result = parseQuickCapture('50 000 revenu MTN', now);
  assert.equal(result.type, 'income');
  assert.equal(result.amount, 50000);
  assert.equal(result.categoryId, 'other_income');
  assert.equal(result.source, 'MTN');
  assert.equal(result.needsReview, false);
});
test('classe une dépense inconnue dans Autre sans bloquer l’enregistrement', () => {
  const result = parseQuickCapture('500 photocopie', now);
  assert.equal(result.type, 'expense');
  assert.equal(result.categoryId, 'other');
  assert.equal(result.needsReview, false);
});
test('reconnaît un prêt accordé, le bénéficiaire et une échéance facultative', () => {
  const result = parseQuickCapture('prêt 500 à Jean', now);
  assert.equal(result.type, 'loan_given');
  assert.equal(result.amount, 500);
  assert.equal(result.person, 'Jean');
  assert.equal(result.dueDate, null);
  assert.equal(result.needsReview, false);
});
test('reconnaît un prêt accordé avec échéance explicite', () => {
  const result = parseQuickCapture('prêt 500 à Jean échéance 2026-11-22', now);
  assert.equal(result.type, 'loan_given');
  assert.equal(result.person, 'Jean');
  assert.equal(result.date, '2026-11-15');
  assert.equal(result.dueDate, '2026-11-22');
});
test('reconnaît une dette contractée sans échéance', () => {
  const result = parseQuickCapture('dette 300 Exauce', now);
  assert.equal(result.type, 'debt_borrowed');
  assert.equal(result.amount, 300);
  assert.equal(result.person, 'Exauce');
  assert.equal(result.needsReview, false);
});
test('reconnaît une facture internet en attente de date', () => {
  const result = parseQuickCapture('facture 500 internet', now);
  assert.equal(result.type, 'bill');
  assert.equal(result.amount, 500);
  assert.equal(result.billType, 'internet');
  assert.equal(result.billName, 'Facture Internet');
  assert.equal(result.dueDate, null);
  assert.equal(result.needsReview, false);
});
test('lit une fréquence mensuelle explicitement écrite pour une facture', () => {
  const result = parseQuickCapture('facture 5 000 internet mensuelle échéance 2026-11-25', now);
  assert.equal(result.frequency, 'monthly');
  assert.equal(result.dueDate, '2026-11-25');
});
test('accepte une facture à montant variable même si le montant est inconnu', () => {
  const result = parseQuickCapture('facture internet', now);
  assert.equal(result.type, 'bill');
  assert.equal(result.amount, null);
  assert.equal(result.isVariable, true);
  assert.equal(result.needsReview, false);
});

test('reconnaît une échéance écrite avec le mot le sans changer la date de saisie', () => {
  const result = parseQuickCapture('prêt 500 à Jean échéance le 2026-11-22', now);
  assert.equal(result.person, 'Jean');
  assert.equal(result.date, '2026-11-15');
  assert.equal(result.dueDate, '2026-11-22');
});
test('reconnaît une date ISO seule comme échéance sur une dette', () => {
  const result = parseQuickCapture('dette 300 Exauce 2026-11-22', now);
  assert.equal(result.person, 'Exauce');
  assert.equal(result.date, '2026-11-15');
  assert.equal(result.dueDate, '2026-11-22');
});
test('reconnaît la fréquence même lorsque le type de facture reste à préciser', () => {
  const result = parseQuickCapture('facture 500 mensuelle', now);
  assert.equal(result.type, 'bill');
  assert.equal(result.billType, 'other');
  assert.equal(result.frequency, 'monthly');
});

test('reconnaît une facture et une échéance écrite en toutes lettres sans mot échéance', () => {
  const result = parseQuickCapture("500 FCFA factures d'électricité 17 novembre", now);
  assert.equal(result.type, "bill");
  assert.equal(result.amount, 500);
  assert.equal(result.billType, "electricity");
  assert.equal(result.dueDate, "2026-11-17");
  assert.equal(result.date, "2026-11-15");
});
test('accepte la date d’échéance au format jour/mois', () => {
  const result = parseQuickCapture("facture ENEO 500 17/11/2026", now);
  assert.equal(result.dueDate, "2026-11-17");
});
test('reconnaît une échéance non étiquetée sur une dette', () => {
  const result = parseQuickCapture("dette 300 à Paul 20 novembre", now);
  assert.equal(result.type, "debt_borrowed");
  assert.equal(result.dueDate, "2026-11-20");
  assert.equal(result.date, "2026-11-15");
});
test('reconnaît un repas avec un montant placé au milieu de la phrase', () => {
  const result = parseQuickCapture("J'ai mangé au déjeuner pour 500 FCFA au snack", now);
  assert.equal(result.type, "expense");
  assert.equal(result.amount, 500);
  assert.equal(result.categoryId, "food");
  assert.equal(result.note, "au snack");
});
test('reconnaît les synonymes alimentation et petite faute de frappe', () => {
  const result = parseQuickCapture("alimantation 750 FCFA", now);
  assert.equal(result.type, "expense");
  assert.equal(result.categoryId, "food");
});
test('reconnaît un revenu même sans employer le mot revenu', () => {
  const result = parseQuickCapture("j'ai touché ma rémunération 80 000 FCFA", now);
  assert.equal(result.type, "income");
  assert.equal(result.categoryId, "salary");
  assert.equal(result.amount, 80000);
});
test('une date explicitement décrite comme date de transaction ne devient pas une échéance', () => {
  const result = parseQuickCapture("facture ENEO 500 date de paiement 10 novembre", now);
  assert.equal(result.dueDate, null);
  assert.equal(result.date, "2026-11-10");
});

test('détecte le montant même lorsque la date naturelle est placée avant lui', () => {
  const result = parseQuickCapture("17 novembre facture ENEO 500 FCFA", now);
  assert.equal(result.type, "bill");
  assert.equal(result.amount, 500);
  assert.equal(result.dueDate, "2026-11-17");
});
test('détecte correctement le montant après une date écrite avec le mois en premier', () => {
  const result = parseQuickCapture("facture eau novembre 17 750 FCFA", now);
  assert.equal(result.type, "bill");
  assert.equal(result.amount, 750);
  assert.equal(result.dueDate, "2026-11-17");
});
