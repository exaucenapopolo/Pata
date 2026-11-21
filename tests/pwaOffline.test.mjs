import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(new URL(file, import.meta.url), 'utf8');

test('la PWA utilise un cache Firestore persistant partagé entre plusieurs onglets', () => {
  const firebase = read('../src/lib/firebase/client.js');
  assert.match(firebase, /initializeFirestore\(app/);
  assert.match(firebase, /persistentLocalCache\(/);
  assert.match(firebase, /persistentMultipleTabManager\(/);
  assert.match(firebase, /typeof indexedDB === 'undefined'/);
});

test('le service worker prépare une page de secours et met les fichiers statiques en cache', () => {
  const worker = read('../public/sw.js');
  assert.match(worker, /'\/offline\.html'/);
  assert.match(worker, /pata-static-/);
  assert.match(worker, /request\.mode === 'navigate'/);
  assert.match(worker, /handleStaticAsset/);
  assert.match(worker, /handleNavigation/);
});

test('les routes App Router peuvent réutiliser un résultat récent ou le dernier cache hors ligne', () => {
  const worker = read('../public/sw.js');
  assert.match(worker, /request\.headers\.get\('RSC'\) === '1'/);
  assert.match(worker, /text\\\/x-component/);
  assert.match(worker, /ROUTE_CACHE_TTL_MS/);
  assert.match(worker, /if \(cached\) return cached/);
});

test('les API et les requêtes non GET ne sont jamais mises en cache par le service worker', () => {
  const worker = read('../public/sw.js');
  assert.match(worker, /request\.method !== 'GET'/);
  assert.match(worker, /url\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(worker, /url\.pathname\.startsWith\('\/_next\/image'\)/);
});

test('l’enregistrement du service worker ne lance plus de vérifications réseau à chaque retour en ligne ou affichage', () => {
  const registration = read('../src/components/PWARegister.jsx');
  assert.match(registration, /serviceWorker\.register\('\/sw\.js'/);
  assert.doesNotMatch(registration, /registration\.update\(/);
  assert.doesNotMatch(registration, /visibilitychange/);
  assert.doesNotMatch(registration, /addEventListener\('online'/);
});

test('la page hors connexion explique clairement les limites des fonctions serveur', () => {
  const offlinePage = read('../public/offline.html');
  assert.match(offlinePage, /Tu es hors connexion/);
  assert.match(offlinePage, /synchronis/);
  assert.match(offlinePage, /assistante IA/);
});
