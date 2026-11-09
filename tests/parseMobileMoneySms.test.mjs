import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMobileMoneySms } from '../src/lib/sms/parseMobileMoneySms.mjs';

const receivedAt = new Date('2026-11-09T10:20:00+01:00');

test('parse un SMS de paiement Orange Money avec ID marchand officiel', () => {
  const result = parseMobileMoneySms(
    'Orange Money : Paiement réussi. ARNO. Montant transaction : 4500 FCFA, ID : MP180329.1942.A015. Nouveau solde : 12500 FCFA.',
    { receivedAt }
  );
  assert.equal(result.provider, 'orange_money');
  assert.equal(result.transactionId, 'MP180329.1942.A015');
  assert.equal(result.amount, 4500);
  assert.equal(result.eventType, 'payment');
  assert.equal(result.direction, 'expense');
  assert.equal(result.balance, 12500);
});

test('parse une réception MTN MoMo avec milliers séparés par espaces', () => {
  const result = parseMobileMoneySms(
    'MTN MoMo : Vous avez reçu 25 000 FCFA de 6XXXXXXXX. Transaction ID: 123456789012. Solde : 30 000 FCFA.',
    { receivedAt }
  );
  assert.equal(result.provider, 'mtn_momo');
  assert.equal(result.amount, 25000);
  assert.equal(result.direction, 'income');
  assert.equal(result.eventType, 'receive');
  assert.equal(result.transactionId, '123456789012');
  assert.equal(result.balance, 30000);
});

test('un retrait est identifié à part et ne devient pas automatiquement une dépense', () => {
  const result = parseMobileMoneySms(
    'Orange Money : Retrait réussi de 10 000 FCFA. Transaction ID: OM123456789.',
    { receivedAt }
  );
  assert.equal(result.eventType, 'withdrawal');
  assert.equal(result.direction, 'withdrawal');
});

test('ignore les transactions échouées', () => {
  const result = parseMobileMoneySms(
    'MTN MoMo : Échec de la transaction de 5000 FCFA. Transaction ID: 12345678.',
    { receivedAt }
  );
  assert.equal(result, null);
});

test('ignore un SMS sans identifiant de transaction', () => {
  const result = parseMobileMoneySms(
    'Orange Money : Paiement réussi de 4500 FCFA.',
    { receivedAt }
  );
  assert.equal(result, null);
});

test('rejette un expéditeur ou un fournisseur non reconnu', () => {
  const result = parseMobileMoneySms(
    'Banque : Vous avez reçu 25000 FCFA. Transaction ID: ABCDEFG12345.',
    { receivedAt }
  );
  assert.equal(result, null);
});

test('normalise une date explicite et une heure', () => {
  const result = parseMobileMoneySms(
    'MTN MoMo : Vous avez reçu 2500 FCFA. Transaction ID: 123456789. Date 08/11/2026 à 19:45.',
    { receivedAt }
  );
  assert.equal(result.date, '2026-11-08');
  assert.equal(result.time, '19:45');
});
