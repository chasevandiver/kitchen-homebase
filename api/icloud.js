export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url param' });

  try {
    const options = {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://www.icloud.com',
        'User-Agent': 'Mozilla/5.0 (compatible)',
      },
    };
    if (req.method === 'POST' && req.body) {
      options.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    }

    const response = await fetch(decodeURIComponent(url), options);
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('json')) {
      // iCloud shared album API responses — pass through as-is
      const data = await response.json();
      return res.status(200).json(data);
    } else {
      // ICS calendar files are plain text — wrap in {contents} so client handles uniformly
      const text = await response.text();
      return res.status(200).json({ contents: text });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
