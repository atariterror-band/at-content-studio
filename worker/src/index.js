const REPOSITORY = 'atariterror-band/at-content-studio';
const API_ROOT = `https://api.github.com/repos/${REPOSITORY}/contents`;
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const MAX_BODY_BYTES = 1024 * 1024;
const MAX_PHOTO_BYTES = 20 * 1024 * 1024;

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!cors['Access-Control-Allow-Origin']) return json({ error: 'Origin is not allowed.' }, 403, cors);
    const url = new URL(request.url);
    try {
      if (request.method === 'POST' && url.pathname === '/auth/login') {
        const body = await readJson(request);
        if (!env.STUDIO_PASSWORD || body.password !== env.STUDIO_PASSWORD) return json({ error: 'Nesprávné heslo.' }, 401, cors);
        const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
        return json({ token: await createSession(expiresAt, env.SESSION_SECRET), expiresAt }, 200, cors);
      }
      if (!url.pathname.startsWith('/api/')) return json({ error: 'Not found.' }, 404, cors);
      await requireSession(request, env.SESSION_SECRET);
      if (!env.GITHUB_TOKEN) return json({ error: 'Server nemá nastavený GitHub token.' }, 503, cors);
      if (request.method === 'POST' && url.pathname === '/api/library/photos') {
        const declaredLength = Number(request.headers.get('Content-Length') || 0);
        if (declaredLength > MAX_PHOTO_BYTES + 64 * 1024) return json({ error: 'Fotka je větší než 20 MB.' }, 413, cors);
        const form = await request.formData();
        const photo = form.get('photo');
        if (!photo || typeof photo.arrayBuffer !== 'function' || typeof photo.name !== 'string') throw Object.assign(new Error('Vyber platný obrazový soubor.'), { status: 400 });
        if (photo.size > MAX_PHOTO_BYTES) throw Object.assign(new Error('Fotka je větší než 20 MB.'), { status: 413 });
        const name = photo.name;
        const extension = name.split('.').pop().toLowerCase();
        if (!name || name.length > 180 || name.trim() !== name || /[\/\\\u0000-\u001f\u007f]/.test(name) || name === '.' || name === '..' || !['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif'].includes(extension)) {
          throw Object.assign(new Error('Použij fotku JPG, PNG, GIF, WebP nebo AVIF s běžným názvem souboru.'), { status: 415 });
        }
        const path = `photos/${name}`;
        const existing = await githubRequest(path, env.GITHUB_TOKEN, 'GET');
        const replace = form.get('replace') === 'true';
        if (existing && !replace) return json({ error: `Fotka „${name}“ už v knihovně existuje. Potvrď její nahrazení.` }, 409, cors);
        const bytes = new Uint8Array(await photo.arrayBuffer());
        const saved = await githubRequest(path, env.GITHUB_TOKEN, 'PUT', {
          message: `${existing ? 'Replace' : 'Upload'} photo ${name}`,
          content: bytesToBase64(bytes),
          ...(existing?.sha ? { sha: existing.sha } : {})
        });
        return json({ ok: true, path, sha: saved.content?.sha || '' }, 200, cors);
      }
      if (request.method === 'POST' && url.pathname === '/api/drafts') {
        const draft = await readJson(request);
        validateDraft(draft);
        const folder = draft.state === 'complete' ? 'completed' : 'drafts';
        const path = `content-studio/${folder}/${draft.id}.json`;
        const record = { ...draft };
        delete record.githubPath;
        delete record.githubSha;
        const existing = await githubRequest(path, env.GITHUB_TOKEN, 'GET');
        const saved = await githubRequest(path, env.GITHUB_TOKEN, 'PUT', {
          message: `Save ${draft.state}: ${draft.title || draft.id}`,
          content: toBase64(JSON.stringify(record, null, 2)),
          ...(existing?.sha ? { sha: existing.sha } : {})
        });
        const oldFolder = folder === 'drafts' ? 'completed' : 'drafts';
        await deleteGithubFile(`content-studio/${oldFolder}/${draft.id}.json`, env.GITHUB_TOKEN, `Move ${draft.id} to ${folder}`);
        return json({ ...record, githubPath: path, githubSha: saved.content?.sha || '' }, 200, cors);
      }
      if (request.method === 'DELETE' && url.pathname.startsWith('/api/drafts/')) {
        const id = decodeURIComponent(url.pathname.slice('/api/drafts/'.length));
        if (!/^draft-[a-zA-Z0-9-]{1,100}$/.test(id)) return json({ error: 'Neplatné ID návrhu.' }, 400, cors);
        await Promise.all(['drafts', 'completed'].map(folder => deleteGithubFile(`content-studio/${folder}/${id}.json`, env.GITHUB_TOKEN, `Delete studio content ${id}`)));
        return json({ ok: true }, 200, cors);
      }
      return json({ error: 'Not found.' }, 404, cors);
    } catch (error) {
      return json({ error: error.message || 'Interní chyba služby.' }, error.status || 500, cors);
    }
  }
};

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || 'https://atariterror-band.github.io,http://localhost:8000,http://127.0.0.1:8000').split(',').map(value => value.trim()).filter(Boolean);
  const headers = { Vary: 'Origin', 'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Max-Age': '86400' };
  if (allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}
function json(value, status, cors) { return new Response(JSON.stringify(value), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } }); }
async function readJson(request) {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) throw Object.assign(new Error('Návrh je příliš velký (limit 1 MB).'), { status: 413 });
  try { return JSON.parse(raw); } catch { throw Object.assign(new Error('Neplatný JSON požadavek.'), { status: 400 }); }
}
function validateDraft(draft) {
  if (!draft || typeof draft !== 'object' || !/^draft-[a-zA-Z0-9-]{1,100}$/.test(draft.id || '')) throw Object.assign(new Error('Neplatné ID návrhu.'), { status: 400 });
  if (!['draft', 'complete'].includes(draft.state)) throw Object.assign(new Error('Neplatný stav návrhu.'), { status: 400 });
  if (!draft.fields || typeof draft.fields !== 'object' || Array.isArray(draft.fields)) throw Object.assign(new Error('Návrh nemá platná textová pole.'), { status: 400 });
}
async function githubRequest(path, token, method, body) {
  const response = await fetch(`${API_ROOT}/${path.split('/').map(encodeURIComponent).join('/')}`, {
    method,
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'User-Agent': 'AT-Content-Studio', 'X-GitHub-Api-Version': '2022-11-28', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  if (response.status === 404) return null;
  const raw = await response.text();
  let result = {}; try { result = raw ? JSON.parse(raw) : {}; } catch {}
  if (!response.ok) throw Object.assign(new Error(`GitHub HTTP ${response.status}: ${result.message || raw.slice(0, 180) || 'bez textu odpovědi'}`), { status: 502 });
  return result;
}
async function deleteGithubFile(path, token, message) {
  const existing = await githubRequest(path, token, 'GET');
  if (existing?.sha) await githubRequest(path, token, 'DELETE', { message, sha: existing.sha });
}
function toBase64(value) {
  const bytes = new TextEncoder().encode(value); let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
function base64url(bytes) { let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, ''); }
async function sign(value, secret) {
  if (!secret || secret.length < 32) throw Object.assign(new Error('Server nemá správně nastavený SESSION_SECRET.'), { status: 503 });
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return base64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))));
}
async function createSession(expiresAt, secret) { const payload = base64url(new TextEncoder().encode(JSON.stringify({ exp: expiresAt, v: 1 }))); return `${payload}.${await sign(payload, secret)}`; }
async function requireSession(request, secret) {
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra || signature !== await sign(payload, secret)) throw Object.assign(new Error('Přihlášení není platné. Přihlas se znovu.'), { status: 401 });
  let data;
  try { data = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(payload.replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0)))); } catch { data = null; }
  if (!data || data.v !== 1 || data.exp <= Math.floor(Date.now() / 1000)) throw Object.assign(new Error('Přihlášení vypršelo. Přihlas se znovu.'), { status: 401 });
}
