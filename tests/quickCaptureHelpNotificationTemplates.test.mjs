import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseQuickCapture } from '../src/lib/quickCapture/parser.mjs';

const read = (file) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');
const now = new Date('2026-11-17T12:00:00.000Z');

test('Quick Capture guide is first in French and English', () => {
  const help = read('src/lib/ai/helpKnowledge.mjs');
  const fr = help.indexOf('export const HELP_FR = [');
  const en = help.indexOf('export const HELP_EN = [');
  assert.ok(fr >= 0 && en > fr);
  assert.ok(help.slice(fr + 'export const HELP_FR = [\n'.length).startsWith("  {\n    title: 'Saisie rapide : mode d’emploi'"));
  assert.ok(help.slice(en + 'export const HELP_EN = [\n'.length).startsWith("  {\n    title: 'Quick Capture: how to use it'"));
});

test('guide contains examples for income, dates, debts and AI notifications', () => {
  const help = read('src/lib/ai/helpKnowledge.mjs');
  for (const phrase of [
    'revenu 5 000 Diane', 'revenue 5 000 Diane', 'revenus 5 000 Diane', 'revnue 5 000 Diane',
    'avant-hier nourriture 500', 'jeudi 500 transport', 'le 17 transport 500',
    'j’ai emprunté 5 000 chez Paul', 'j’ai prêté 5 000 à Paul',
    'j’ai remboursé 500 de dette à Paul', 'Parler avec Mč', 'Répondre',
    'voiture', 'gasoil', 'eau à boire', 'repas du soir', 'mise en commun',
    'dépôt épargne', 'business investi', 'paye mensuelle', 'honoraires',
    'marchandise', 'pourcentage touché', 'revenu locatif',
  ]) assert.ok(help.includes(phrase), 'Missing help phrase: ' + phrase);
});

test('help examples remain recognized by the parser', () => {
  const examples = [
    ['revenu 5000 Diane', 'income', 5000, 'other_income', 'Diane', '2026-11-17'],
    ['revenue 5000 Diane', 'income', 5000, 'other_income', 'Diane', '2026-11-17'],
    ['revenus 5000 Diane', 'income', 5000, 'other_income', 'Diane', '2026-11-17'],
    ['revnue 5000 Diane', 'income', 5000, 'other_income', 'Diane', '2026-11-17'],
    ['500 transport', 'expense', 500, 'transport', '', '2026-11-17'],
    ['avant-hier nourriture 500', 'expense', 500, 'food', '', '2026-11-15'],
    ['Jeudi 500 transport', 'expense', 500, 'transport', '', '2026-11-12'],
    ['le 17 transport 500', 'expense', 500, 'transport', '', '2026-11-17'],
  ];
  for (const [phrase, type, amount, categoryId, source, date] of examples) {
    const result = parseQuickCapture(phrase, now);
    assert.equal(result.type, type, phrase);
    assert.equal(result.amount, amount, phrase);
    assert.equal(result.categoryId, categoryId, phrase);
    assert.equal(result.source || '', source, phrase);
    assert.equal(result.date, date, phrase);
  }
});

test('borrowed money, loans given and repayments are separate operation types', () => {
  const borrowed = parseQuickCapture('j’ai emprunté 5000 chez Paul', now);
  const lent = parseQuickCapture('j’ai prêté 5000 à Paul', now);
  const repaid = parseQuickCapture('j’ai remboursé 500 de dette à Paul', now);
  assert.equal(borrowed.type, 'debt_borrowed');
  assert.equal(borrowed.person, 'Paul');
  assert.equal(lent.type, 'loan_given');
  assert.equal(lent.person, 'Paul');
  assert.equal(repaid.type, 'debt_repayment');
  assert.equal(repaid.person, 'Paul');
});

test('server Quick Capture reads the user custom categories for notification text', () => {
  const route = read('src/app/api/quick-capture/route.js');
  assert.match(route, /userRef\.collection\('categories'\)\.get\(\)/);
  assert.match(route, /parseQuickCapture\(body\.text,[\s\S]*\{ categories \}\)/);
});

test('admin notification templates are isolated to the current administrator', () => {
  const route = read('src/app/api/[...path]/route.js');
  assert.match(route, /async function handleAdminNotificationTemplates/);
  assert.match(route, /savedAdminNotificationTemplates/);
  assert.match(route, /'admin\/notification-templates': \{ GET: handleAdminNotificationTemplates \}/);
  assert.match(route, /saveAsTemplate === true/);
});

test('admin broadcast can save and re-use notification content and image', () => {
  const page = read('src/app/admin/page.jsx');
  assert.match(page, /saveBroadcastTemplate/);
  assert.match(page, /saveAsTemplate: saveBroadcastTemplate/);
  assert.match(page, /Réutiliser une notification enregistrée/);
  assert.match(page, /Garder cette notification pour la prochaine fois/);
  assert.match(page, /setBroadcastImageUrl\(saved\.imageUrl \|\| ''\)/);
  assert.match(page, /Les destinataires ne sont pas mémorisés/);
});
