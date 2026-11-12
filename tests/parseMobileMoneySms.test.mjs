import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMobileMoneySms } from '../src/lib/sms/parseMobileMoneySms.mjs';

const receivedAt = new Date('2026-11-09T10:20:00+01:00');

test('reconnaît Ref:, Réf:, Réf. et Référence comme préfixes d’identifiant', () => {
  for (const prefix of ['Ref:', 'Réf:', 'Réf.', 'Référence:']) {
    const result = parseMobileMoneySms(
      `Orange Money : Paiement réussi. ARNO. Montant transaction : 2 000 FCFA. ${prefix} MP180329.1942.A015. Nouveau solde : 10 000 FCFA.`,
      { receivedAt }
    );
    assert.equal(result?.transactionId, 'MP180329.1942.A015', prefix);
    assert.equal(result?.direction, 'expense', prefix);
  }
});

test('reconnaît l’achat de crédit téléphonique comme une sortie Airtime', () => {
  const result = parseMobileMoneySms(
    'MTN MoMo : Achat de crédit téléphonique réussi. Montant : 500 FCFA. Ref: MP180329.1942.A015.',
    { sender: 'MTN', receivedAt }
  );
  assert.equal(result?.eventType, 'payment');
  assert.equal(result?.direction, 'expense');
  assert.equal(result?.amount, 500);
  assert.equal(result?.suggestedCategoryId, 'airtime');
});

test('parse un SMS de paiement marchand Orange Money sans exiger de modèle unique', () => {
  const result = parseMobileMoneySms(
    'Orange Money : Paiement réussi. ARNO Yaoundé. Informations détaillées : Montant transaction : 2 018 FCFA. Référence : MP180329.1942.A015. Nouveau solde : 12 500 FCFA.',
    { receivedAt }
  );
  assert.equal(result?.provider, 'orange_money');
  assert.equal(result?.transactionId, 'MP180329.1942.A015');
  assert.equal(result?.amount, 2018);
  assert.equal(result?.eventType, 'payment');
  assert.equal(result?.direction, 'expense');
  assert.equal(result?.balance, 12500);
});

test('parse une réception MTN MoMo avec milliers séparés par espaces', () => {
  const result = parseMobileMoneySms(
    'MTN MoMo : Vous avez reçu 25 000 FCFA de 6XXXXXXXX. Transaction ID: 123456789012. Solde : 30 000 FCFA.',
    { receivedAt }
  );
  assert.equal(result?.provider, 'mtn_momo');
  assert.equal(result?.amount, 25000);
  assert.equal(result?.direction, 'income');
  assert.equal(result?.eventType, 'receive');
  assert.equal(result?.transactionId, '123456789012');
  assert.equal(result?.balance, 30000);
});

test('reconnaît un transfert Orange sans identifiant structuré', () => {
  const result = parseMobileMoneySms(
    'Orange Money : Vous avez effectué un transfert de 3.500 FCFA. Votre compte a été débité.',
    { sender: 'OM', receivedAt }
  );
  assert.equal(result?.provider, 'orange_money');
  assert.equal(result?.amount, 3500);
  assert.equal(result?.direction, 'expense');
  assert.match(result?.transactionId || '', /^AUTO-/);
});

test('reconnaît une réception MTN avec devise XAF avant le montant et sans ID', () => {
  const result = parseMobileMoneySms(
    'MTN MoMo : Votre compte a été crédité de XAF 12,500. Nouveau solde : XAF 40,000.',
    { sender: 'MTN', receivedAt }
  );
  assert.equal(result?.provider, 'mtn_momo');
  assert.equal(result?.amount, 12500);
  assert.equal(result?.direction, 'income');
  assert.match(result?.transactionId || '', /^AUTO-/);
});

test('un retrait reste distingué d’un envoi', () => {
  const result = parseMobileMoneySms(
    'Orange Money : Retrait réussi de 10 000 FCFA. Transaction ID: OM123456789.',
    { receivedAt }
  );
  assert.equal(result?.eventType, 'withdrawal');
  assert.equal(result?.direction, 'withdrawal');
});

test('ignore les transactions échouées', () => {
  const result = parseMobileMoneySms(
    'MTN MoMo : Échec de la transaction de 5000 FCFA. Transaction ID: 12345678.',
    { receivedAt }
  );
  assert.equal(result, null);
});

test('ignore une opération en cours de traitement, non encore finalisée', () => {
  const result = parseMobileMoneySms(
    'MTN MoMo : Votre paiement de 5 000 FCFA est en cours de traitement. Transaction ID: 123456789.',
    { receivedAt }
  );
  assert.equal(result, null);
});

test('rejette un expéditeur ou fournisseur non reconnu', () => {
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
  assert.equal(result?.date, '2026-11-08');
  assert.equal(result?.time, '19:45');
});

test('extrait le nom du marchand sans conserver de numéro de téléphone', () => {
  const result = parseMobileMoneySms(
    'Orange Money : Paiement réussi. ARNO. Montant transaction : 4500 FCFA, ID : MP180329.1942.A015.',
    { receivedAt }
  );
  assert.equal(result?.counterparty, 'ARNO');
});

test('ignore un numéro de téléphone comme contrepartie', () => {
  const result = parseMobileMoneySms(
    'MTN MoMo : Vous avez reçu 25 000 FCFA de 6XXXXXXXX. Transaction ID: 123456789012.',
    { receivedAt }
  );
  assert.equal(result?.counterparty, null);
});


test('reconnaît un transfert sortant MTN FAPSHI et son bénéficiaire', () => {
  const result = parseMobileMoneySms(
    "Une transaction de 100 XAF effectuee par FAPSHI Inc (237673669111) sur votre compte d'argent mobile s'est terminee avec succes a 2026-11-09 20:28:07. Message du destinataire du debit : 100 XAF paid to MULAFLOWR via FAPSHI. Votre nouveau solde : 758 XAF. Identifiant de transaction financiere : 19661775298.",
    { sender: 'MTN', receivedAt }
  );
  assert.equal(result?.provider, 'mtn_momo');
  assert.equal(result?.eventType, 'send');
  assert.equal(result?.direction, 'expense');
  assert.equal(result?.amount, 100);
  assert.equal(result?.counterparty, 'MULAFLOWR');
  assert.equal(result?.transactionId, '19661775298');
  assert.equal(result?.date, '2026-11-09');
  assert.equal(result?.time, '20:28');
});

test('reconnaît les achats de forfaits MTN comme paiements sortants', () => {
  const result = parseMobileMoneySms(
    "Une transaction de 500 XAF effectuee par MTNC BUNDLES_FORFAITS (MTN_Bundles) sur votre compte d'argent mobile s'est terminee avec succes a 2026-11-05 15:52:03. Votre nouveau solde : 8977 XAF. Identifiant de transaction financiere : 19589589652.",
    { sender: 'MTN', receivedAt }
  );
  assert.equal(result?.eventType, 'send');
  assert.equal(result?.direction, 'expense');
  assert.equal(result?.amount, 500);
  assert.equal(result?.counterparty, 'MTNC BUNDLES FORFAITS');
});

test('extrait le bénéficiaire d’un transfert Orange avec deux numéros', () => {
  const result = parseMobileMoneySms(
    'Transfert de 691691622 NOABIOH DAZER vers 687059132 ASSIO reussi. ID transaction: PP261107.2047.B29063, Montant Transaction: 5050 FCFA, Frais: 14.1 FCFA, Commission: 0 FCFA, Montant Net: 5064.1 FCFA, Nouveau Solde: 1046.62 FCFA.',
    { sender: 'OrangeMoney', receivedAt }
  );
  assert.equal(result?.eventType, 'send');
  assert.equal(result?.direction, 'expense');
  assert.equal(result?.amount, 5050);
  assert.equal(result?.counterparty, 'ASSIO');
  assert.equal(result?.transactionId, 'PP261107.2047.B29063');
  assert.equal(result?.date, '2026-11-07');
  assert.equal(result?.time, '20:47');
});

test('extrait l’expéditeur d’un dépôt Orange Money', () => {
  const result = parseMobileMoneySms(
    'Depot effectue par 693154437 ETS CHOPE to 691691622 NOABIOH DAZER. Informations detaillees: Montant de transaction : 2600 FCFA, ID transaction : CI261031.1911.B07608, Frais : 0 FCFA, Commission : 0 FCFA, Montant Net du Credit : 2600 FCFA, Nouveau Solde : 4124.92 FCFA.',
    { sender: 'OrangeMoney', receivedAt }
  );
  assert.equal(result?.eventType, 'receive');
  assert.equal(result?.direction, 'income');
  assert.equal(result?.amount, 2600);
  assert.equal(result?.counterparty, 'ETS CHOPE');
  assert.equal(result?.transactionId, 'CI261031.1911.B07608');
  assert.equal(result?.date, '2026-10-31');
  assert.equal(result?.time, '19:11');
});

test('extrait le marchand ENEO depuis le premier SMS de paiement', () => {
  const result = parseMobileMoneySms(
    'Paiement ENEO reussi par MBOUMBOUO ISSOFA,237681144638: Transaction ID 19648122490, Recu No 000000096271356, Compteur No 014449382408. Energie kWh : 20.0 Prix:1000 F Paiement : 1000 F Frais : 100 F TVA : 0 F Dette : 0 F.',
    { sender: 'MTN', receivedAt }
  );
  assert.equal(result?.eventType, 'payment');
  assert.equal(result?.direction, 'expense');
  assert.equal(result?.counterparty, 'ENEO');
  assert.equal(result?.transactionId, '19648122490');
});


test('le second SMS ENEO est reconnu comme paiement avec le même identifiant', () => {
  const result = parseMobileMoneySms(
    'Votre paiement de 1000 XAF a ENEO a ete effectue le 2026-11-09 02:04:36. Votre nouveau solde: 3064 XAF. Frais: 100 XAF. Message: -. Transaction Id: 19648122490.',
    { sender: 'MTN', receivedAt }
  );
  assert.equal(result?.eventType, 'payment');
  assert.equal(result?.direction, 'expense');
  assert.equal(result?.transactionId, '19648122490');
});


test('priorise le montant principal MTN malgré remises, frais, téléphone et autres nombres', () => {
  const result = parseMobileMoneySms(
    "Une transaction de 100 XAF effectuee par FAPSHI Inc  (237673669111) sur votre compte d'argent mobile s'est terminee avec succes a 2026-11-09 22:34:45. Le montant faisait l'objet d'une remise de 0 et de bons de reduction d'une valeur de 0. Message du destinataire du debit : 100 XAF paid to MULAFLOWR via FAPSHI. Votre nouveau solde : 758 XAF. Les frais s'elevaient a 0 XAF, les frais de fidelite a 0 et la recompense de fidelite a 0. Identifiant de transaction financiere : 19663115802. ID de transaction externe : 6af23c4af7c48741a85cf7594.",
    { sender: 'MTN', receivedAt }
  );
  assert.equal(result?.amount, 100);
  assert.equal(result?.direction, 'expense');
  assert.equal(result?.transactionId, '19663115802');
  assert.equal(result?.date, '2026-11-09');
});

test('ne transforme pas une fraction de frais en faux montant XAF entier', () => {
  const result = parseMobileMoneySms(
    'Orange Money : Transfert effectué de 2 500 FCFA. Frais : 14.1 FCFA. Nouveau solde : 1 046.62 FCFA.',
    { sender: 'OrangeMoney', receivedAt }
  );
  assert.equal(result?.amount, 2500);
});

test('extrait l’expéditeur d’une réception MTN FAPSHI après le montant', () => {
  const result = parseMobileMoneySms(
    "Vous avez recu 100 XAF de FAPSHI INC (237651020476) sur votre compte mobile money a 2026-11-09 20:35:14. Message de l'expediteur: From Social Boost Horizon via FAPSHI. Votre nouveau solde: 858 XAF. FRAIS: FCFA 0. Financial Transaction Id: 19661893907.",
    { sender: 'MTN', receivedAt }
  );
  assert.equal(result?.provider, 'mtn_momo');
  assert.equal(result?.eventType, 'receive');
  assert.equal(result?.direction, 'income');
  assert.equal(result?.amount, 100);
  assert.equal(result?.counterparty, 'FAPSHI INC');
  assert.equal(result?.transactionId, '19661893907');
  assert.equal(result?.date, '2026-11-09');
  assert.equal(result?.time, '20:35');
});


test('reconnaît le retrait MTN MoMo en français avec « solde est de »', () => {
  const result = parseMobileMoneySms(
    "1Go Njoh! si tu te connectes sur l'appli New MoMoApp. Lien: link.mtn.cm/NewMoMoAppRef. Vous avez effectue avec succes le retrait de 2000 FCFA de votre compte mobile money le 2026-11-11 11:32:48. Votre nouveau solde est de:1473 FCFA. Transaction Id: 19684640557.",
    { sender: 'MTN', receivedAt }
  );
  assert.equal(result?.provider, 'mtn_momo');
  assert.equal(result?.eventType, 'withdrawal');
  assert.equal(result?.direction, 'withdrawal');
  assert.equal(result?.amount, 2000);
  assert.equal(result?.balance, 1473);
  assert.equal(result?.transactionId, '19684640557');
  assert.equal(result?.date, '2026-11-11');
  assert.equal(result?.time, '11:32');
});

test('reconnaît le retrait MTN MoMo en anglais avec « You have withdrawn »', () => {
  const result = parseMobileMoneySms(
    'You have withdrawn 2000 XAF from your mobile money account at THIERRY CABREL MANFOUO on 2026-11-11 11:32:48. Your new balance:1473 XAF. Financial Transaction Id: 19684640557.',
    { sender: 'MTN', receivedAt }
  );
  assert.equal(result?.provider, 'mtn_momo');
  assert.equal(result?.eventType, 'withdrawal');
  assert.equal(result?.direction, 'withdrawal');
  assert.equal(result?.amount, 2000);
  assert.equal(result?.balance, 1473);
  assert.equal(result?.transactionId, '19684640557');
  assert.equal(result?.date, '2026-11-11');
  assert.equal(result?.time, '11:32');
});


test('reconnaît exactement le SMS MTN de retrait fourni pour la détection automatique', () => {
  const result = parseMobileMoneySms(
    "1Go Njoh! si tu te connectes sur l'appli New MoMoApp. Lien: link.mtn.cm/NewMoMoAppRef. Vous avez effectue avec succes le retrait de 1000 FCFA de votre compte mobile money le 2026-11-12 12:43:33. Votre nouveau solde est de:107 FCFA. Transaction Id: 19701698948.",
    { sender: 'MTN', receivedAt }
  );
  assert.equal(result?.provider, 'mtn_momo');
  assert.equal(result?.eventType, 'withdrawal');
  assert.equal(result?.direction, 'withdrawal');
  assert.equal(result?.amount, 1000);
  assert.equal(result?.balance, 107);
  assert.equal(result?.transactionId, '19701698948');
  assert.equal(result?.date, '2026-11-12');
  assert.equal(result?.time, '12:43');
});
