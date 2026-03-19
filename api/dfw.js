/**
 * /api/dfw.js — DFW happenings + horoscopes via Google Gemini
 * Free tier: aistudio.google.com — no credit card needed
 * Uses gemini-1.5-flash-8b: 4M tokens/day free (vs 1M for 2.0-flash)
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

  // Try models in order — fall back to smaller model if quota hit
  const models = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-flash-8b'];

  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const body = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 2000 },
      };

      // Only add Google Search grounding on models that support it
      if (model.startsWith('gemini-2.0')) {
        body.tools = [{ google_search: {} }];
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      // If rate-limited, try next model
      if (response.status === 429) continue;

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

      if (!text) {
        const reason = data?.candidates?.[0]?.finishReason || 'unknown';
        // Safety block or other issue — try next model
        if (reason === 'SAFETY' || reason === 'RECITATION') continue;
        return res.status(500).json({ error: `No text from ${model}. Finish: ${reason}` });
      }

      return res.status(200).json({ text, model });

    } catch (e) {
      // Network error on this model — try next
      continue;
    }
  }

  return res.status(429).json({ error: 'All Gemini models rate-limited. Try again in a minute.' });
}
