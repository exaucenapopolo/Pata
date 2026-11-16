import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeNotificationReply } from '../src/lib/ai/notificationFormat.mjs';

test('supprime les tableaux et la syntaxe Markdown des notifications', () => {
  const result = sanitizeNotificationReply('**Bilan**\nVoici le résultat :\n| Poste | Montant |\n|---|---:|\n| Dépenses | 5 000 FCFA |\nTu peux encore dépenser 2 000 FCFA.');
  assert.equal(result.includes('|'), false);
  assert.equal(result.includes('**'), false);
  assert.match(result, /Voici le résultat/);
  assert.match(result, /2 000 FCFA/);
});

test('retire les puces décoratives et conserve les accents', () => {
  const result = sanitizeNotificationReply('✅ **Attention** : tes dépenses augmentent.\n- Vérifie ton budget.');
  assert.equal(result.includes('✅'), false);
  assert.equal(result.includes('**'), false);
  assert.match(result, /Attention/);
  assert.match(result, /Vérifie ton budget/);
});

test('limite la longueur de la réponse destinée à la notification', () => {
  const result = sanitizeNotificationReply('Information importante. '.repeat(40), 120);
  assert.ok(result.length <= 120);
});
