import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanInput,queryUrl,normalize,filterWords,compare,receipt,readReceipt,csv,fetchJson} from '../web/model.mjs';
const config={apiEndpoint:'https://api.datamuse.com/words',maxResults:100};
const q={query:'ocean',mode:'ml',language:'en',pattern:'',topics:''};

test('arbitrary phrases and constraints are encoded, not interpreted as extra parameters',()=>{
 const u=new URL(queryUrl({...q,query:'café & max=999',pattern:'s*',topics:'weather,light'},config));
 assert.equal(u.searchParams.get('ml'),'café & max=999');assert.equal(u.searchParams.get('max'),'100');assert.equal(u.searchParams.get('sp'),'s*');assert.equal(u.searchParams.get('md'),'ps');
});
test('Spanish supports vocabulary queries but prevents unsupported relation searches',()=>{
 assert.equal(new URL(queryUrl({...q,query:'océano',language:'es'},config)).searchParams.get('v'),'es');
 assert.throws(()=>cleanInput({...q,mode:'rel_rhy',language:'es'}),/English/);
 assert.throws(()=>cleanInput({...q,mode:'callback'}),/supported/);
 assert.throws(()=>cleanInput({...q,topics:'one two three four five six'}),/five/);
});
test('configured limits are bounded integers and endpoints cannot contain credentials',()=>{
 assert.equal(new URL(queryUrl(q,{...config,maxResults:9000})).searchParams.get('max'),'1000');
 assert.equal(new URL(queryUrl(q,{...config,maxResults:12.5})).searchParams.get('max'),'12');
 for(const endpoint of ['http://example.com/words','https://key@example.com/words','https://example.com/?key=secret'])assert.throws(()=>queryUrl(q,{...config,backendEndpoint:endpoint}),/credential-free/);
 assert.equal(new URL(queryUrl(q,{...config,backendEndpoint:'https://words.hackme.ca/words'})).origin,'https://words.hackme.ca');
});
test('same-origin Pages route resolves against HTTPS but cannot become an external origin',()=>{
 assert.equal(new URL(queryUrl(q,{...config,backendEndpoint:'/api/words'},'https://words.hackme.ca/')).origin,'https://words.hackme.ca');
 assert.throws(()=>queryUrl(q,{...config,backendEndpoint:'/api/words'},'http://example.com'),/credential-free/);
 assert.throws(()=>queryUrl(q,{...config,backendEndpoint:'/\\evil.example/api'},'https://words.hackme.ca/'),/credential-free/);
 assert.throws(()=>queryUrl(q,{...config,backendEndpoint:'//evil.example/api'},'https://words.hackme.ca/'));
});
test('normalization accepts missing metadata, preserves text and rejects wrong response shape',()=>{
 assert.deepEqual(normalize([{word:'sea'},{word:'<img src=x>',numSyllables:1,tags:['n',23]}]),[{word:'sea',score:null,numSyllables:null,tags:[]},{word:'<img src=x>',score:null,numSyllables:1,tags:['n']}]);
 assert.throws(()=>normalize({words:[]}),/unrecognized/);assert.throws(()=>normalize([{word:'sea'},{word:'sea'}]),/duplicate/);assert.throws(()=>normalize([{word:'sea',numSyllables:-1}]),/syllable/);
 assert.deepEqual(normalize([]),[]);
});
test('filters combine without confusing missing syllables with zero',()=>{
 const words=normalize([{word:'sea',numSyllables:1,tags:['n']},{word:'ocean',numSyllables:2,tags:['n']},{word:'unknown'}]);
 assert.deepEqual(filterWords(words,{text:'EA',syllables:'1',part:'n'}).map(x=>x.word),['sea']);
 assert.equal(filterWords(words,{syllables:'0'}).length,0);assert.throws(()=>filterWords(words,{syllables:'bad'}),/count/);
});
test('comparison describes case-insensitive overlap between returned lists',()=>{
 const result=compare(normalize([{word:'Sea'},{word:'tide'}]),normalize([{word:'sea'},{word:'river'}]));
 assert.deepEqual(result.both.map(x=>x.word),['Sea']);assert.deepEqual(result.onlyA.map(x=>x.word),['tide']);assert.deepEqual(result.onlyB.map(x=>x.word),['river']);
});
test('receipt round trip preserves query and missing metadata across config changes',()=>{
 const original={query:q,capturedAt:'2026-11-23T12:00:00Z',words:normalize([{word:'sea'},{word:'tide',numSyllables:1}])};
 assert.deepEqual(readReceipt(JSON.parse(JSON.stringify(receipt(original)))),original);
 assert.throws(()=>readReceipt({...receipt(original),capturedAt:'yesterday'}),/receipt/);
 assert.throws(()=>readReceipt({...receipt(original),schema:'unrelated'}),/receipt/);
});
test('CSV quotes embedded delimiters and neutralizes formula beginnings',()=>{
 const output=csv(normalize([{word:'=HYPERLINK("a","b")'},{word:'tide, ebb'}]));
 assert.ok(output.includes(`"'=HYPERLINK(""a"",""b"")"`));assert.ok(output.includes('"tide, ebb"'));
});
test('HTTP failures explain authorization and rate limits without fake word results',async()=>{
 await assert.rejects(()=>fetchJson('https://example.com',100,async()=>({ok:false,status:429})),/rate-limited/);
 await assert.rejects(()=>fetchJson('https://example.com',100,async()=>({ok:false,status:403})),/authorize/);
 assert.deepEqual(await fetchJson('https://example.com',100,async()=>({ok:true,json:async()=>[]})),[]);
});
test('the timeout covers reading the response body',async()=>{
 await assert.rejects(()=>fetchJson('https://example.com',5,async(url,{signal})=>({ok:true,json:()=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted'))))})),/too long/);
});
