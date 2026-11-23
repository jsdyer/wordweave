// Pages runtime only. The API key never enters the static build or response.
const MODES = ['ml','sl','sp','rel_rhy','rel_nry','rel_syn','rel_ant','rel_jjb','rel_jja','rel_trg','rel_hom'];
const ALLOWED = new Set([...MODES, 'topics', 'v', 'md', 'max']);
const WINDOW_MS = 60000, REQUESTS_PER_WINDOW = 30, MAX_CLIENTS = 5000;
const MAX_RESPONSE_BYTES = 1024 * 1024;

// Fixed classifications only: never return an exception message, URL, key,
// query, or provider body when describing an upstream failure.
class AdapterFailure extends Error {
  constructor(code, phase) { super(code); this.code = code; this.phase = phase; }
}

export function validatedParams(search) {
  const params = new URLSearchParams(search);
  for (const name of params.keys()) {
    if (!ALLOWED.has(name) || params.getAll(name).length !== 1) throw Error('Unsupported or repeated query parameter.');
  }
  const modes = MODES.filter(name => params.has(name) && name !== 'sp');
  if (modes.length > 1 || (!modes.length && !params.has('sp'))) throw Error('Choose one word relationship.');
  const mode = modes[0] || 'sp';
  const query = params.get(mode)?.trim();
  if (!query || query.length > 200 || /[\u0000-\u001f]/u.test(query)) throw Error('Use a query from 1 to 200 characters.');
  if (mode !== 'sp' && (params.get('sp') || '').length > 100) throw Error('Use a spelling constraint of at most 100 characters.');
  const topics = params.get('topics') || '';
  if (topics.length > 150 || topics.split(/[\s,]+/u).filter(Boolean).length > 5) throw Error('Use at most five topic words.');
  if (params.has('v') && params.get('v') !== 'es') throw Error('Only English and Spanish vocabularies are supported.');
  if (params.get('v') === 'es' && mode.startsWith('rel_')) throw Error('Relationship searches require English.');
  if (params.has('md') && params.get('md') !== 'ps') throw Error('Only word-class and syllable metadata is supported.');
  const maximum = params.has('max') ? Number(params.get('max')) : 100;
  if (!Number.isInteger(maximum) || maximum < 1 || maximum > 1000) throw Error('Use a result count from 1 to 1000.');
  params.set(mode, query); params.set('max', String(maximum)); params.set('md', 'ps');
  params.sort();
  return params;
}

async function boundedJson(response) {
  if (Number(response.headers.get('content-length')) > MAX_RESPONSE_BYTES) throw new AdapterFailure('upstream_response_too_large','body');
  let reader;
  try { reader = response.body?.getReader(); }
  catch { throw new AdapterFailure('upstream_body_read_failed','body'); }
  if (!reader) throw new AdapterFailure('upstream_empty_body','body');
  const chunks = []; let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        // Cancelling is best effort and must not replace the actual size error.
        try { await reader.cancel(); } catch {}
        throw new AdapterFailure('upstream_response_too_large','body');
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof AdapterFailure) throw error;
    throw new AdapterFailure('upstream_body_read_failed','body');
  } finally { try { reader.releaseLock(); } catch {} }
  if (!size) throw new AdapterFailure('upstream_empty_body','body');
  const bytes = new Uint8Array(size); let position = 0;
  for (const chunk of chunks) { bytes.set(chunk, position); position += chunk.byteLength; }
  let data;
  try { data = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new AdapterFailure('upstream_invalid_json','decode'); }
  if (!Array.isArray(data) || data.length > 1000) throw new AdapterFailure('upstream_invalid_shape','validate');
  return data.map(row => {
    if (!row || typeof row.word !== 'string' || !row.word.trim() || row.word.length > 500) throw new AdapterFailure('upstream_invalid_word','validate');
    if (row.numSyllables != null && (!Number.isInteger(row.numSyllables) || row.numSyllables < 0 || row.numSyllables > 100)) throw new AdapterFailure('upstream_invalid_syllables','validate');
    return {word: row.word, ...(Number.isFinite(row.score) ? {score:row.score} : {}), ...(row.numSyllables != null ? {numSyllables:row.numSyllables} : {}), ...(Array.isArray(row.tags) ? {tags:row.tags.filter(tag => typeof tag === 'string' && tag.length <= 50).slice(0,50)} : {})};
  });
}

// This is a per-isolate burst guard, not a globally enforced daily quota.
// Deployments/data centres can have separate isolates; see the deployment guide.
export function createHandler({fetcher = (...args) => fetch(...args), cache = () => globalThis.caches?.default, now = () => Date.now(), timeoutMs = 12000} = {}) {
  const clients = new Map();
  return async function handle(context) {
    const {request, env = {}} = context, url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const allowedOrigin = env.ALLOWED_ORIGIN || 'https://coolcode.ca';
    const headers = {'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer', 'Vary':'Origin'};
    const answer = (data, status=200, extra={}) => new Response(JSON.stringify(data), {status, headers:{...headers,...extra}});
    if (origin && origin !== url.origin && origin !== allowedOrigin) return answer({error:'Origin is not allowed.'},403);
    if (origin) headers['Access-Control-Allow-Origin'] = origin;
    if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET, OPTIONS','Access-Control-Allow-Headers':'Accept','Access-Control-Max-Age':'600'}});
    if (request.method !== 'GET') return answer({error:'Use GET for word queries.'},405,{'Allow':'GET, OPTIONS'});
    if (url.pathname !== '/api/words') return answer({error:'Route not found.'},404);
    if (!env.DATAMUSE_API_KEY || typeof env.DATAMUSE_API_KEY !== 'string') return answer({error:'The owner needs to add the Datamuse secret to this Pages project and redeploy.'},503);
    let params;
    try { params = validatedParams(url.search); } catch (error) { return answer({error:error.message},400); }
    const clock = now();
    for (const [key, entry] of clients) if (entry.until <= clock) clients.delete(key);
    const client = request.headers.get('CF-Connecting-IP') || 'unknown';
    let entry = clients.get(client);
    if (!entry) {
      if (clients.size >= MAX_CLIENTS) return answer({error:'The word service is busy. Try again shortly.'},429,{'Retry-After':'60'});
      entry = {count:0,until:clock+WINDOW_MS}; clients.set(client,entry);
    }
    if (++entry.count > REQUESTS_PER_WINDOW) return answer({error:'Please wait before making more word searches.'},429,{'Retry-After':String(Math.max(1,Math.ceil((entry.until-clock)/1000)))});
    const keyUrl = new URL('/api/words',url.origin); keyUrl.search=params.toString();
    const cacheKey = new Request(keyUrl.href);
    let store;
    try {
      store = cache();
      const hit = store && await store.match(cacheKey);
      if (hit) return new Response(hit.body,{status:200,headers:{...headers,'X-WordWeave-Cache':'HIT'}});
    } catch { /* A cache outage should not break a valid lookup. */ }
    const upstream = new URL('https://api.datamuse.com/words');
    upstream.search=params.toString(); upstream.searchParams.set('k',env.DATAMUSE_API_KEY);
    const controller = new AbortController(), timer = setTimeout(()=>controller.abort(),timeoutMs);
    let phase = 'fetch';
    try {
      // Workers does not implement redirect:'error'. Manual mode is supported
      // and lets us reject redirects without forwarding the key elsewhere.
      const response = await fetcher(upstream.href,{signal:controller.signal,redirect:'manual',credentials:'omit',headers:{Accept:'application/json'}});
      if (response.status >= 300 && response.status < 400) return answer({error:'Datamuse redirected the request. The connection needs review.',code:'upstream_redirect_rejected',phase:'fetch',upstreamStatus:response.status},502);
      if (!response.ok) {
        const status = response.status === 429 ? 429 : response.status === 401 || response.status === 403 ? 503 : 502;
        return answer({error:status===429?'Datamuse has rate-limited this service. Please try later.':status===503?'Datamuse did not accept the configured connection. The owner should check its key.':'Datamuse could not complete the search.',code:'upstream_http_error',phase:'fetch',upstreamStatus:response.status},status,status===429?{'Retry-After':'60'}:{});
      }
      phase = 'body';
      const data = await boundedJson(response), body = JSON.stringify(data);
      if (store) {
        // Catch synchronous throws as well as rejected promises. Neither cache
        // writes nor scheduling them may invalidate a successful word response.
        const saving = Promise.resolve().then(()=>store.put(cacheKey,new Response(body,{headers:{'Content-Type':'application/json','Cache-Control':'public, max-age=3600'}}))).catch(()=>{});
        try { if (typeof context.waitUntil === 'function') context.waitUntil(saving); else await saving; }
        catch { await saving; }
      }
      return new Response(body,{status:200,headers:{...headers,'X-WordWeave-Cache':'MISS'}});
    } catch (error) {
      const failure = controller.signal.aborted ? {code:'upstream_timeout',phase} : error instanceof AdapterFailure ? {code:error.code,phase:error.phase} : {code:phase === 'fetch'?'upstream_fetch_failed':'upstream_response_failed',phase};
      return answer({error:controller.signal.aborted?'Datamuse took too long to respond. Try again later.':'The word service could not complete the search. Try again later.',...failure},502);
    } finally { clearTimeout(timer); }
  };
}

export const onRequest = createHandler();
