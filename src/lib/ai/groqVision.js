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

export async function extractBillDataWithGroqVision(imageDataUrl, language = 'fr') {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY non configurée.');
  if (typeof imageDataUrl !== 'string' || !/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(imageDataUrl)) {
    throw new Error(language === 'en' ? 'Unsupported image format.' : 'Format de photo non pris en charge.');
  }

  const prompt = language === 'en'
    ? 'Read this invoice, utility bill or receipt. Extract only information clearly visible in the image. Return ONLY one valid JSON object, no Markdown. Schema: {"documentType":"invoice|utility_bill|receipt|other","merchantName":string|null,"customerName":string|null,"invoiceNumber":string|null,"accountReference":string|null,"invoiceDate":"YYYY-MM-DD"|null,"dueDate":"YYYY-MM-DD"|null,"totalAmount":number|null,"currency":string|null,"subtotal":number|null,"taxAmount":number|null,"suggestedBillType":"electricity|water|rent|television|internet|telephone|taxes|insurance|school|other","suggestedCategory":"housing|internet|contribution|health|food|transport|leisure|other","description":string|null,"uncertainFields":string[]}. Use numeric amounts without separators. Dates must be ISO calendar dates; do not guess missing dates or amounts. totalAmount must be the final amount payable, not subtotal. Identify the merchant/provider and customer/reference when legible.'
    : 'Lis cette facture, facture de service ou ce reçu. Extrais uniquement les informations clairement visibles sur l’image. Réponds UNIQUEMENT par un objet JSON valide, sans Markdown. Schéma : {"documentType":"invoice|utility_bill|receipt|other","merchantName":string|null,"customerName":string|null,"invoiceNumber":string|null,"accountReference":string|null,"invoiceDate":"YYYY-MM-DD"|null,"dueDate":"YYYY-MM-DD"|null,"totalAmount":number|null,"currency":string|null,"subtotal":number|null,"taxAmount":number|null,"suggestedBillType":"electricity|water|rent|television|internet|telephone|taxes|insurance|school|other","suggestedCategory":"housing|internet|contribution|health|food|transport|leisure|other","description":string|null,"uncertainFields":string[]}. Les montants doivent être numériques, sans séparateurs. Les dates doivent être au format ISO ; ne devine jamais une date ou un montant absent. totalAmount doit être le montant final à payer, pas le sous-total. Identifie le fournisseur et le client ou la référence lorsque ces éléments sont lisibles.';

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
    body: JSON.stringify({
      model: 'qwen/qwen3.8-27b',
      messages: [
        { role: 'system', content: language === 'en' ? 'You are a careful document transcription engine. Never invent information. Output strict JSON only.' : 'Tu es un moteur de transcription documentaire rigoureux. N’invente aucune information. Réponds uniquement en JSON strict.' },
        { role: 'user', content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: imageDataUrl } },
        ] },
      ],
      max_tokens: 900,
      temperature: 0,
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(25000),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('[PATA BILL VISION]', response.status, payload?.error?.code || payload?.error?.type || 'provider_error');
    throw new Error(language === 'en' ? 'The invoice image could not be analyzed. Try a clearer photo.' : 'La facture n’a pas pu être analysée. Essaie avec une photo plus nette.');
  }
  return payload.choices?.[0]?.message?.content?.trim() || '';
}