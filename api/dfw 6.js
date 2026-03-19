/**
 * /api/dfw.js — DFW happenings + horoscopes via Google Gemini
 * Free tier: aistudio.google.com — no credit card needed
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not set in Vercel Environment Variables.' });
  }

  const { prompt } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

  // Use the stable v1 endpoint with gemini-1.5-flash (most reliable free model)
  const model = 'gemini-1.5-flash-latest';
  const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`;

  let rawText = '';
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 2000 },
      }),
    });

    rawText = await response.text();

    if (!response.ok) {
      // Return full error so dashboard can display exactly what went wrong
      return res.status(response.status).json({
        error: `Gemini ${response.status} (${model}): ${rawText.slice(0, 400)}`
      });
    }

    let data;
    try { data = JSON.parse(rawText); }
    catch { return res.status(500).json({ error: `Bad JSON from Gemini: ${rawText.slice(0, 200)}` }); }

    const text = data?.candidates?.[0]?.content?.parts
      ?.filter(p => p.text)?.map(p => p.text)?.join('') || '';

    if (!text) {
      const reason = data?.candidates?.[0]?.finishReason || 'unknown';
      const safety = JSON.stringify(data?.candidates?.[0]?.safetyRatings || []);
      return res.status(500).json({ error: `No text from Gemini. Reason: ${reason}. Safety: ${safety}` });
    }

    return res.status(200).json({ text });

  } catch (e) {
    return res.status(500).json({ error: `Fetch failed: ${e.message}. Raw: ${rawText.slice(0,100)}` });
  }
}
