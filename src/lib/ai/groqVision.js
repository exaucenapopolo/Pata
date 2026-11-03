// src/lib/ai/groqVision.js
export async function chatWithGroqVision(messages, imageBase64) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY non configurée.');

  const systemPrompt = `Tu es Mč, l'assistante financière de Pata. Tu peux analyser les images (reçus, tickets, captures d'écran) pour aider l'utilisateur à gérer ses dépenses. Réponds de manière concise, chaleureuse et en français.`;

  const userContent = [
    { type: 'text', text: messages[messages.length - 1].content || 'Analyse cette image.' },
    { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }
  ];

  const formattedMessages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent }
  ];

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'qwen/qwen3.8-27b', // Modèle de vision actuel
      messages: formattedMessages,
      max_tokens: 1000,
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Groq Vision Error:', err);
    throw new Error('Erreur d\'analyse d\'image avec Groq');
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
    }
