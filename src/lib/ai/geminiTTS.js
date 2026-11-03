// src/lib/ai/geminiTTS.js
export async function generateAudioWithGemini(text) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY non configurée.');

  // 🟢 Nettoyage poussé pour éviter les erreurs de l'API Gemini
  const cleanText = text
    .replace(/[*#_]/g, '') // Retirer les symboles markdown
    .replace(/\n+/g, ' ')   // Remplacer les sauts de ligne par des espaces
    .trim()
    .slice(0, 1500);        // Limiter la taille pour éviter les timeouts

  if (!cleanText) throw new Error('Le texte est vide après nettoyage.');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-tts:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: cleanText }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Aoede' } },
          languageCode: 'fr-FR'
        }
      }
    })
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Gemini TTS Error:', err);
    throw new Error('Erreur de génération audio avec Gemini');
  }

  const data = await res.json();
  const audioBase64 = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  
  if (!audioBase64) throw new Error('Aucun audio retourné par Gemini');
  
  return audioBase64;
                    }
