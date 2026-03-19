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

  // v1beta is required for flash models — try in order until one works
  const candidates = [
    'gemini-1.5-flash-latest',
    'gemini-1.5-flash',
    'gemini-1.5-pro-latest',
    'gemini-pro',
  ];

  for (const model of candidates) {
    // Must use v1beta — v1 does not expose flash/pro-latest models
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
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

      // 404 = model doesn't exist here, try next
      if (response.status === 404) continue;

      // 429 = rate limited, try next
      if (response.status === 429) continue;

      if (!response.ok) {
        return res.status(response.status).json({
          error: `Gemini ${response.status} (${model} v1beta): ${rawText.slice(0, 400)}`
        });
      }

      let data;
      try { data = JSON.parse(rawText); }
      catch { return res.status(500).json({ error: `Bad JSON: ${rawText.slice(0, 200)}` }); }

      const text = data?.candidates?.[0]?.content?.parts
        ?.filter(p => p.text)?.map(p => p.text)?.join('') || '';

      if (!text) {
        const reason = data?.candidates?.[0]?.finishReason || 'unknown';
        return res.status(500).json({ error: `No text from ${model}. Reason: ${reason}` });
      }

      return res.status(200).json({ text, model });

    } catch (e) {
      // Network error — try next model
      continue;
    }
  }

  // Nothing worked — call ListModels so we can see what's actually available
  try {
    const listRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );
    const listText = await listRes.text();
    const listData = JSON.parse(listText);
    const names = (listData.models || [])
      .map(m => m.name)
      .filter(n => n.includes('flash') || n.includes('pro'))
      .join(', ');
    return res.status(404).json({
      error: `No working model found. Available models: ${names || listText.slice(0, 300)}`
    });
  } catch (e) {
    return res.status(500).json({ error: `All models failed and ListModels also failed: ${e.message}` });
  }
}
