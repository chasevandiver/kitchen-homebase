export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set in Vercel Environment Variables' });
  }

  const { prompt } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'Missing prompt' });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-search-2025-03-05',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const rawText = await response.text();

    if (!response.ok) {
      return res.status(response.status).json({ error: `Anthropic API error ${response.status}: ${rawText.slice(0, 300)}` });
    }

    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      return res.status(500).json({ error: 'Failed to parse Anthropic response as JSON' });
    }

    // When web_search is used, Claude does multiple turns internally.
    // The final answer is in the LAST text block.
    const textBlocks = (data.content || []).filter(b => b.type === 'text');
    const text = textBlocks.map(b => b.text).join('');

    if (!text) {
      // Dump content types for debugging
      const types = (data.content || []).map(b => b.type).join(', ');
      return res.status(500).json({ error: `No text block in response. Content types: ${types}. Stop reason: ${data.stop_reason}` });
    }

    return res.status(200).json({ text });
  } catch (e) {
    return res.status(500).json({ error: `Server error: ${e.message}` });
  }
}
