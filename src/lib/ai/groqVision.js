// src/lib/ai/groqVision.js
export async function chatWithGroqVision(messages, imageBase64, language = 'fr') {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY non configurée.');

  const systemPrompt = language === 'en'
    ? `You are Mč, Pata's financial assistant. Analyze images such as receipts, tickets and screenshots to help the user manage expenses. Reply concisely, warmly and in English.`
    : `Tu es Mč, l'assistante financière de Pata. Tu peux analyser les images (reçus, tickets, captures d'écran) pour aider l'utilisateur à gérer ses dépenses. Réponds de manière concise et chaleureuse en français.`;

  // On s'assure que l'image est bien au format Data URL
  const imageUrl = imageBase64.startsWith('data:image') 
    ? imageBase64 
    : `data:image/jpeg;base64,${imageBase64}`;

  const userContent = [
    { type: 'text', text: messages[messages.length - 1].content || (language === 'en' ? 'Analyze this image.' : 'Analyse cette image.') },
    { type: 'image_url', image_url: { url: imageUrl } }
  ];

  const formattedMessages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent }
  ];

  // 🟢 MODÈLE DE VISION ACTUEL
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'qwen/qwen3.8-27b', 
      messages: formattedMessages,
      max_tokens: 1000,
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Groq Vision Error:', err);
    throw new Error(language === 'en' ? 'Image analysis failed with Groq.' : "Erreur d'analyse d'image avec Groq");
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}
