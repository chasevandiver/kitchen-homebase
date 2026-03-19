/**
 * /api/dfw.js — DFW happenings + horoscopes via Google Gemini
 *
 * Required Vercel Environment Variable:
 *   GEMINI_API_KEY  (free from aistudio.google.com — no credit card needed)
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not set in Vercel Environment Variables. Get a free key at aistudio.google.com' });
  }

  const { prompt } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 4000,
        },
      }),
    });

    const rawText = await response.text();

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Gemini API error ${response.status}: ${rawText.slice(0, 400)}`
      });
    }

    let data;
    try { data = JSON.parse(rawText); }
    catch { return res.status(500).json({ error: 'Failed to parse Gemini response' }); }

    const text = data?.candidates?.[0]?.content?.parts
      ?.filter(p => p.text)
      ?.map(p => p.text)
      ?.join('') || '';

    if (!text) {
      const reason = data?.candidates?.[0]?.finishReason || 'unknown';
      return res.status(500).json({ error: `No text in Gemini response. Finish reason: ${reason}` });
    }

    return res.status(200).json({ text });

  } catch (e) {
    return res.status(500).json({ error: `Server error: ${e.message}` });
  }
}
