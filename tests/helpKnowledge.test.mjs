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
