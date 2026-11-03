// src/lib/ai/geminiTTS.js
export async function generateAudioWithGemini(text) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY non configurée.');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-tts:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: text.slice(0, 2000) }] }],
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
