import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler,validatedParams} from '../cloudflare/functions/api/words.js';
const KEY='test-placeholder-not-real';
function context(query='ml=ocean',options={}) {
  return {request:new Request('https://words.hackme.ca/api/words?'+query,{method:options.method||'GET',headers:{Origin:options.origin||'https://coolcode.ca','CF-Connecting-IP':options.ip||'192.0.2.1'}}),env:{DATAMUSE_API_KEY:KEY},...options};
}
const successful=()=>new Response(JSON.stringify([{word:'sea',score:22,numSyllables:1,tags:['n'],private:'discard'}]),{headers:{'Content-Type':'application/json'}});

test('validates a small fixed query contract without accepting keys or arbitrary targets',()=>{
  assert.equal(validatedParams('ml=caf%C3%A9&sp=s*&max=25').get('ml'),'café');
  for(const query of ['ml=ocean&k=secret','url=https://elsewhere.example','ml=one&ml=two','ml=one&sl=two','sp=','ml=one&max=1001','ml=one&v=fr','rel_rhy=sea&v=es','ml=one&md=d']) assert.throws(()=>validatedParams(query));
});
test('attaches documented k only upstream and strips unknown provider fields',async()=>{
  let outgoing,fetchOptions;
  const handler=createHandler({fetcher:async(url,options)=>{outgoing=new URL(url);fetchOptions=options;return successful();},cache:()=>null});
  const r=await handler(context('ml=caf%C3%A9&max=25'));
  assert.equal(r.status,200); assert.equal(outgoing.origin,'https://api.datamuse.com'); assert.equal(outgoing.pathname,'/words'); assert.equal(outgoing.searchParams.get('k'),KEY);
  assert.equal(fetchOptions.redirect,'manual'); assert.equal(r.headers.get('Access-Control-Allow-Origin'),'https://coolcode.ca');
  const body=await r.text(); assert.ok(!body.includes(KEY)); assert.ok(!body.includes('private')); assert.equal(JSON.parse(body)[0].word,'sea');
});
test('does not contact upstream for missing secret, unsupported method or disallowed origin',async()=>{
  let calls=0;const handler=createHandler({fetcher:async()=>{calls++;return successful();},cache:()=>null});
  assert.equal((await handler(context('ml=ocean',{env:{}}))).status,503);
  assert.equal((await handler(context('ml=ocean',{method:'POST'}))).status,405);
  const denied=await handler(context('ml=ocean',{origin:'https://unrelated.example'}));
  assert.equal(denied.status,403); assert.equal(denied.headers.get('Access-Control-Allow-Origin'),null);
  assert.equal((await handler(context('ml=ocean',{method:'OPTIONS'}))).status,204); assert.equal(calls,0);
});
test('cache keys and cached bodies omit secret, shared results preserve origin-specific CORS',async()=>{
  let calls=0;const saved=new Map();
  const store={match:async key=>saved.get(key.url)?.clone(),put:async(key,response)=>{assert.ok(!key.url.includes(KEY));saved.set(key.url,response);}};
  const handler=createHandler({fetcher:async()=>{calls++;return successful();},cache:()=>store});
  assert.equal((await handler(context())).headers.get('X-WordWeave-Cache'),'MISS');
  const cached=await handler(context('ml=ocean',{origin:'https://words.hackme.ca'}));
  assert.equal(cached.headers.get('X-WordWeave-Cache'),'HIT');assert.equal(cached.headers.get('Access-Control-Allow-Origin'),'https://words.hackme.ca');assert.equal(calls,1);
});
test('provider errors and thrown URLs cannot reflect credentials into client errors',async()=>{
  for(const status of [403,429,500]) {
    const handler=createHandler({fetcher:async()=>new Response(KEY,{status}),cache:()=>null});
    const r=await handler(context());assert.ok(r.status>=400);assert.ok(!(await r.text()).includes(KEY));
  }
  const r=await createHandler({fetcher:async url=>{throw Error(url);},cache:()=>null})(context());
  assert.equal(r.status,502);assert.ok(!(await r.text()).includes(KEY));
});
test('invalid and oversized upstream data are rejected without leaking provider body',async()=>{
  for(const body of [JSON.stringify({error:KEY}),JSON.stringify([{word:'sea',numSyllables:-1}]),'x'.repeat(1024*1024+1)]) {
    const r=await createHandler({fetcher:async()=>new Response(body),cache:()=>null})(context());
    assert.equal(r.status,502);assert.ok(!(await r.text()).includes(KEY));
  }
});
test('burst guard is bounded and permits a client again after its minute window',async()=>{
  let clock=0,calls=0;const handler=createHandler({fetcher:async()=>{calls++;return successful();},cache:()=>null,now:()=>clock});
  for(let i=0;i<30;i++)assert.equal((await handler(context())).status,200);
  const limited=await handler(context());assert.equal(limited.status,429);assert.equal(calls,30);
  clock=60001; assert.equal((await handler(context())).status,200);
});
test('timeout aborts upstream and returns a bounded error',async()=>{
  const handler=createHandler({timeoutMs:5,cache:()=>null,fetcher:async(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error(url))))});
  const r=await handler(context()); assert.equal(r.status,502);assert.match(await r.text(),/too long/);
});

test('uses the supported Workers redirect mode instead of its unimplemented error mode',async()=>{
  const cloudflareFetch=async(url,options)=>{
    // This matches the Workers runtime contract, unlike Node's broader fetch.
    if(options.redirect==='error')throw new TypeError("The 'error' redirect mode is not implemented.");
    assert.equal(options.redirect,'manual');return successful();
  };
  const response=await createHandler({fetcher:cloudflareFetch,cache:()=>null})(context());
  assert.equal(response.status,200);assert.equal((await response.json())[0].word,'sea');
});
test('rejects provider redirects without a second fetch or exposing Location',async()=>{
  for(const status of [301,302,303,307,308]) {
    let calls=0;
    const handler=createHandler({cache:()=>null,fetcher:async(url,options)=>{
      calls++;assert.equal(options.redirect,'manual');return new Response('',{status,headers:{Location:'https://other.example/?k='+KEY}});
    }});
    const response=await handler(context()),body=await response.text();
    assert.equal(response.status,502);assert.equal(calls,1);assert.equal(JSON.parse(body).code,'upstream_redirect_rejected');
    assert.ok(!body.includes(KEY));assert.ok(!body.includes('other.example'));assert.equal(response.headers.get('Location'),null);
  }
});
test('cache acquisition, lookup, write and waitUntil failures cannot turn successful words into an error',async()=>{
  const fail=()=>{throw Error('cache details must not be exposed');};
  for(const options of [
    {cache:fail},
    {cache:()=>({match:fail,put:async()=>{}})},
    {cache:()=>({match:async()=>null,put:fail})},
    {cache:()=>({match:async()=>null,put:async()=>{throw Error('rejected write');}})},
    {cache:()=>({match:async()=>null,put:async()=>{}}),waitUntil:fail}
  ]) {
    const response=await createHandler({fetcher:async()=>successful(),cache:options.cache})(context('ml=ocean',{waitUntil:options.waitUntil}));
    assert.equal(response.status,200);assert.equal((await response.json())[0].word,'sea');
  }
});
test('safe diagnostic codes distinguish fetch, body, JSON and shape failures',async()=>{
  const cases=[
    {fetcher:async url=>{throw new TypeError(url);},code:'upstream_fetch_failed',phase:'fetch'},
    {fetcher:async()=>new Response(null),code:'upstream_empty_body',phase:'body'},
    {fetcher:async()=>new Response('x'.repeat(1024*1024+1)),code:'upstream_response_too_large',phase:'body'},
    {fetcher:async()=>new Response('<html>'+KEY+'</html>'),code:'upstream_invalid_json',phase:'decode'},
    {fetcher:async()=>new Response(JSON.stringify({error:KEY})),code:'upstream_invalid_shape',phase:'validate'},
    {fetcher:async()=>new Response(JSON.stringify([{word:'sea',numSyllables:-1}])),code:'upstream_invalid_syllables',phase:'validate'},
    {fetcher:async()=>new Response(new ReadableStream({start(controller){controller.error(Error(KEY));}})),code:'upstream_body_read_failed',phase:'body'}
  ];
  for(const item of cases) {
    const response=await createHandler({fetcher:item.fetcher,cache:()=>null})(context()),body=await response.text(),data=JSON.parse(body);
    assert.equal(response.status,502);assert.equal(data.code,item.code);assert.equal(data.phase,item.phase);
    assert.ok(!body.includes(KEY));assert.ok(!body.includes('https://'));assert.ok(!body.includes('ml=ocean'));
  }
});
