/**
 * Client Groq pour l'assistant Mč.
 * Modèle : openai/gpt-oss-120b (raisonnement, 131k de contexte).
 */
export async function chatWithGroq(messages, options = {}) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY non configurée.');

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: options.model || 'openai/gpt-oss-120b',
      messages,
      max_tokens: options.maxTokens || 500,
      temperature: options.temperature ?? 0.4,
      top_p: 0.9,
      stream: false,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Groq: ${res.status} - ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || '';
}
