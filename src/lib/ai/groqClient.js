// src/lib/ai/groqClient.js
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
      tools: options.tools || undefined, // Ajout du support des outils
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Groq: ${res.status} - ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const message = data.choices?.[0]?.message;
  
  // Si l'IA a décidé d'utiliser un outil, on renvoie l'appel d'outil
  if (message?.tool_calls && message.tool_calls.length > 0) {
    return JSON.stringify({ tool_call: message.tool_calls[0].function });
  }
  
  return message?.content?.trim() || '';
      }
