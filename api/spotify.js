/**
 * /api/spotify.js  — single endpoint handling all Spotify operations
 *
 * ?action=setup    → redirects user to Spotify OAuth consent screen
 * ?action=callback → exchanges auth code for tokens, saves refresh_token to Firebase
 * ?action=playing  → returns currently playing track (uses stored refresh_token)
 *
 * Required Vercel Environment Variables:
 *   SPOTIFY_CLIENT_ID
 *   SPOTIFY_CLIENT_SECRET
 *   FIREBASE_DB_URL   (your Firebase Realtime DB URL, e.g. https://kitchen-homebase-default-rtdb.firebaseio.com)
 *   FIREBASE_DB_SECRET (Firebase database secret — get from Project Settings → Service Accounts → Database Secrets)
 */

const SCOPES = 'user-read-currently-playing user-read-playback-state';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, code, error } = req.query;
  const CLIENT_ID     = process.env.SPOTIFY_CLIENT_ID;
  const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
  const DB_URL        = process.env.FIREBASE_DB_URL;
  const DB_SECRET     = process.env.FIREBASE_DB_SECRET;

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return res.status(500).json({ error: 'SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET must be set in Vercel Environment Variables.' });
  }

  // Build redirect URI dynamically from request host
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  const proto = host.includes('localhost') ? 'http' : 'https';
  const REDIRECT_URI = `${proto}://${host}/api/spotify?action=callback`;

  // ── SETUP: redirect to Spotify auth ──
  if (action === 'setup') {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: CLIENT_ID,
      scope: SCOPES,
      redirect_uri: REDIRECT_URI,
      show_dialog: 'true',
    });
    return res.redirect(302, `https://accounts.spotify.com/authorize?${params}`);
  }

  // ── CALLBACK: exchange code for tokens ──
  if (action === 'callback') {
    if (error) {
      return res.status(400).send(`<html><body style="font-family:sans-serif;background:#111;color:#fff;padding:40px;text-align:center"><h2>❌ Spotify auth denied</h2><p>${error}</p><p>Close this tab and try again.</p></body></html>`);
    }
    if (!code) return res.status(400).json({ error: 'Missing code' });

    try {
      const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64'),
        },
        body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI }),
      });
      const tokens = await tokenRes.json();
      if (!tokens.refresh_token) throw new Error(tokens.error || 'No refresh_token returned');

      // Save refresh_token to Firebase
      if (DB_URL && DB_SECRET) {
        await fetch(`${DB_URL}/spotify.json?auth=${DB_SECRET}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: tokens.refresh_token, updated: Date.now() }),
        });
      }

      return res.status(200).send(`<html><body style="font-family:sans-serif;background:#111;color:#fff;padding:40px;text-align:center"><h2>✅ Spotify connected!</h2><p>Now Playing will appear on your kitchen dashboard.</p><p style="color:#666;font-size:13px">You can close this tab.</p></body></html>`);
    } catch (e) {
      return res.status(500).send(`<html><body style="font-family:sans-serif;background:#111;color:#fff;padding:40px;text-align:center"><h2>❌ Error</h2><p>${e.message}</p></body></html>`);
    }
  }

  // ── PLAYING: return currently playing track ──
  if (action === 'playing') {
    try {
      // Load refresh_token from Firebase
      let refreshToken = null;
      if (DB_URL && DB_SECRET) {
        const fbRes = await fetch(`${DB_URL}/spotify.json?auth=${DB_SECRET}`);
        const fbData = await fbRes.json();
        refreshToken = fbData?.refresh_token;
      }
      if (!refreshToken) return res.status(200).json({ playing: false, error: 'not_connected' });

      // Get fresh access_token
      const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64'),
        },
        body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
      });
      const tokenData = await tokenRes.json();
      const accessToken = tokenData.access_token;
      if (!accessToken) return res.status(200).json({ playing: false, error: 'token_refresh_failed' });

      // Fetch currently playing
      const npRes = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (npRes.status === 204 || npRes.status === 404) {
        return res.status(200).json({ playing: false });
      }

      const np = await npRes.json();
      if (!np || !np.item || !np.is_playing) {
        return res.status(200).json({ playing: false });
      }

      const track = np.item;
      return res.status(200).json({
        playing: true,
        title:   track.name,
        artist:  track.artists?.map(a => a.name).join(', ') || '',
        album:   track.album?.name || '',
        art:     track.album?.images?.[1]?.url || track.album?.images?.[0]?.url || null,
        progress_ms: np.progress_ms,
        duration_ms: track.duration_ms,
        uri:     track.uri,
      });
    } catch (e) {
      return res.status(200).json({ playing: false, error: e.message });
    }
  }

  return res.status(400).json({ error: 'Missing or invalid action. Use ?action=setup, callback, or playing' });
}
