// src/lib/ai/pollinationsImage.js
export async function generateImageWithPollinations(prompt) {
  const apiKey = process.env.POLLINATION_API_KEY;
  if (!apiKey) throw new Error('POLLINATION_API_KEY non configurée.');

  // On encode le prompt pour l'URL
  const encodedPrompt = encodeURIComponent(prompt.slice(0, 500));

  const url = `https://gen.pollinations.ai/image/${encodedPrompt}?model=flux&width=1024&height=1024&nologo=true`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Pollinations Image Error:', err);
    throw new Error('Erreur de génération d\'image avec Pollinations');
  }

  // L'API renvoie directement l'image (binaire). On peut retourner l'URL
  // car le navigateur pourra l'afficher directement.
  return url;
}
