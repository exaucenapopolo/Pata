// Client Groq compatible OpenAI. The legacy helper is kept for existing callers.
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

export async function completeWithGroq(messages, options = {}) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY non configurée.');

  const payload = {
    model: options.model || 'openai/gpt-oss-120b',
    messages,
    max_tokens: options.maxTokens || 1200,
    temperature: options.temperature ?? 0.2,
    top_p: 0.9,
    stream: false,
  };

  if (Array.isArray(options.tools) && options.tools.length) {
    payload.tools = options.tools;
    payload.tool_choice = options.toolChoice || 'auto';
    // GPT-OSS 120B ne prend pas en charge les appels d'outils parallèles.
    // Les actions sont enchaînées par la boucle serveur après chaque résultat.
    payload.parallel_tool_calls = false;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 45000);

  let response;
  try {
    response = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Le service IA met trop de temps à répondre. Réessaie.');
    throw new Error('Impossible de joindre le service IA. Vérifie ta connexion puis réessaie.');
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Groq (${response.status}) : ${errorText.slice(0, 350) || 'requête refusée'}`);
  }

  const data = await response.json();
  const message = data.choices?.[0]?.message;
  if (!message) throw new Error('Le service IA a renvoyé une réponse vide.');
  return { message, usage: data.usage || null, model: data.model || payload.model };
}

export async function chatWithGroq(messages, options = {}) {
  const { message } = await completeWithGroq(messages, options);
  if (message.tool_calls?.length) {
    return JSON.stringify({ tool_call: message.tool_calls[0].function });
  }
  return message.content?.trim() || '';
}
