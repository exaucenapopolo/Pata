import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const apiRoute = fs.readFileSync(new URL('../src/app/api/[...path]/route.js', import.meta.url), 'utf8');

test('programme deux passages financiers quotidiens séparés dans la plage du soir au Cameroun', () => {
  const first = vercel.crons.find((cron) => cron.path === '/api/notifications/scheduler');
  const second = vercel.crons.find((cron) => cron.path === '/api/notifications/evening-followup');

  assert.equal(first?.schedule, '30 16 * * *');
  assert.equal(second?.schedule, '30 19 * * *');
});

test('le second endpoint appelle explicitement le deuxième passage financier', () => {
  assert.match(apiRoute, /'notifications\/scheduler': \{ GET: \(request\) => handleNotificationScheduler\(request, 1\)/);
  assert.match(apiRoute, /'notifications\/evening-followup': \{ GET: \(request\) => handleNotificationScheduler\(request, 2\)/);
  assert.match(apiRoute, /const eveningPass = Number\(passNumber\) === 2 \? 2 : 1/);
});

test('chaque passage possède son identifiant et sa réservation indépendants', () => {
  assert.match(apiRoute, /'evening-' \+ eveningPass \+ '-' \+ today/);
  assert.match(apiRoute, /'daily:' \+ eveningPass \+ ':' \+ today, eveningPass/);
  assert.match(apiRoute, /eveningRetentionPass1CandidateKey/);
  assert.match(apiRoute, /eveningRetentionPass2Date/);
});

test('la collection des dettes reste accessible dans le second bloc de rappel du soir', () => {
  const scheduler = apiRoute.slice(
    apiRoute.indexOf('async function handleNotificationScheduler'),
    apiRoute.indexOf('async function handleCurrencyRates')
  );
  const loop = scheduler.indexOf('for (const userDoc of usersSnapshot.docs)');
  const declaration = scheduler.indexOf('let openDebts = { docs: [] };', loop);
  const firstTry = scheduler.indexOf('      try {', loop);
  const secondUse = scheduler.indexOf('const activeDebtRows = openDebts.docs', declaration);
  assert.ok(loop >= 0 && declaration > loop && declaration < firstTry);
  assert.ok(secondUse > firstTry);
});

test('le planificateur des cotisations ne tourne qu’au premier passage', () => {
  assert.match(apiRoute, /if \(eveningPass === 1\) \{\s*const cotisationResponse = await handleCotisationsScheduler\(request\)/);
});
