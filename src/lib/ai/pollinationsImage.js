// src/lib/ai/pollinationsImage.js
export async function generateImageWithPollinations(prompt) {
  const apiKey = process.env.POLLINATION_API_KEY;
  if (!apiKey) throw new Error('POLLINATION_API_KEY non configurée.');

  // On encode le prompt pour l'URL
  const encodedPrompt = encodeURIComponent(prompt.slice(0, 500));

  // 🟢 ENDPOINT CORRECT POUR L'API AUTHENTIFIÉE
  const url = `https://gen.pollinations.ai/image/${encodedPrompt}?model=flux&width=1024&height=1024&nologo=true`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Pollinations Image Error:', res.status, err);
    // On renvoie une erreur détaillée pour le frontend
    if (res.status === 402) {
      throw new Error('Crédit Pollinations épuisé. Vérifie ton solde Pollen sur enter.pollinations.ai.');
    }
    if (res.status === 401) {
      throw new Error('Clé API Pollinations invalide. Vérifie ta variable POLLINATION_API_KEY.');
    }
    throw new Error(`Erreur Pollinations (${res.status}) : ${err.slice(0, 200)}`);
  }

  // L'API renvoie directement l'image (binaire). On retourne l'URL
  // car le navigateur pourra l'afficher directement.
  return url;
}
