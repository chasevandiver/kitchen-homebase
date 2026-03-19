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

  // Current valid model names as of 2025 — fallback chain if rate limited
  const models = [
    { id: 'gemini-2.0-flash-lite', search: false },
    { id: 'gemini-2.0-flash',      search: true  },
    { id: 'gemini-1.5-flash-8b',   search: false },
    { id: 'gemini-1.5-flash-001',  search: false },
  ];

  for (const { id, search } of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${id}:generateContent?key=${apiKey}`;

      const body = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 2000 },
      };
      if (search) body.tools = [{ google_search: {} }];

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      // Rate limited or not found — try next model
      if (response.status === 429 || response.status === 404) continue;

      const rawText = await response.text();
      if (!response.ok) {
        return res.status(response.status).json({
          error: `Gemini API error ${response.status}: ${rawText.slice(0, 300)}`
        });
      }

      let data;
      try { data = JSON.parse(rawText); }
      catch { return res.status(500).json({ error: 'Failed to parse Gemini response' }); }

      const text = data?.candidates?.[0]?.content?.parts
        ?.filter(p => p.text)?.map(p => p.text)?.join('') || '';

      if (!text) continue; // try next model

      return res.status(200).json({ text, model: id });

    } catch { continue; }
  }

  return res.status(429).json({ error: 'All Gemini models unavailable. Try again in a minute.' });
}
