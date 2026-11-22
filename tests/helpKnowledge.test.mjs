import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHelpKnowledgeContext, getHelpQuestionCount } from '../src/lib/ai/helpKnowledge.mjs';

test('Mč retrouve la réponse du centre d’aide sur le code secret à quatre chiffres', () => {
  const result = buildHelpKnowledgeContext('À quoi sert mon code secret à 4 chiffres ?', 'fr');
  assert.match(result, /code secret à 4 chiffres/i);
  assert.match(result, /empêcher une autre personne/i);
  assert.match(result, /Plus.*Paramètres/i);
});

test('Mč retrouve la réponse anglaise sur la création d’un budget', () => {
  const result = buildHelpKnowledgeContext('How do I create a budget?', 'en');
  assert.match(result, /How do I create a budget\?/);
  assert.match(result, /Budgets/i);
  assert.match(result, /income source/i);
});

test('la recherche ne renvoie pas de réponse sans rapport avec la base du centre d’aide', () => {
  assert.equal(buildHelpKnowledgeContext('Quelle est la météo à Tokyo ?', 'fr'), '');
});

test('la base partagée conserve les questions françaises et anglaises du centre d’aide', () => {
  assert.ok(getHelpQuestionCount('fr') >= 25);
  assert.ok(getHelpQuestionCount('en') >= 25);
});

test('le centre d’aide explique la dette en argent et les biens pris à crédit en français et en anglais', () => {
  const french = buildHelpKnowledgeContext('Comment enregistrer une dette pour des biens ou services pris à crédit ?', 'fr');
  const english = buildHelpKnowledgeContext('How do I record goods or services taken on credit?', 'en');

  assert.match(french, /biens ou services à crédit/i);
  assert.match(french, /1 000 FCFA de pain/i);
  assert.match(french, /argent.*reçu/i);
  assert.match(english, /Goods or services on credit/i);
  assert.match(english, /1,000 XAF of bread/i);
  assert.match(english, /funding source/i);
});

test('le centre d’aide explique comment modifier la nature sans changer un montant déjà utilisé', () => {
  const french = buildHelpKnowledgeContext('Comment changer la nature d’un revenu déjà enregistré ?', 'fr');
  const english = buildHelpKnowledgeContext('How do I correct the type of an existing income entry?', 'en');

  assert.match(french, /Revenu normal ou Dette contractée/i);
  assert.match(french, /montant.*verrouillé/i);
  assert.match(english, /Ordinary income or Borrowed debt/i);
  assert.match(english, /amount stays locked/i);
});

test('le centre d’aide explique la comptabilisation d’un emprunt et la suppression sécurisée', () => {
  const frenchIncome = buildHelpKnowledgeContext('Comment Pata compte-t-il un emprunt en argent dans mes revenus ?', 'fr');
  const frenchDelete = buildHelpKnowledgeContext('Comment supprimer une dette ou un prêt ?', 'fr');
  const englishIncome = buildHelpKnowledgeContext('How does Pata count borrowed money in my income?', 'en');
  const englishDelete = buildHelpKnowledgeContext('How do I delete a debt or loan?', 'en');

  assert.match(frenchIncome, /revenus encaissés/i);
  assert.match(frenchIncome, /dette à rembourser/i);
  assert.match(frenchDelete, /partiellement remboursée/i);
  assert.match(frenchDelete, /synchronisé avec un autre compte/i);
  assert.match(englishIncome, /cash income received/i);
  assert.match(englishDelete, /partially repaid/i);
  assert.match(englishDelete, /synchronized with another Pata account/i);
});
