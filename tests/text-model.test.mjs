import test from 'node:test';
import assert from 'node:assert/strict';
import {textReport,transformText,frequencyCsv,validLocale,textSettings} from '../web/text-model.mjs';

test('counts graphemes, code points, UTF-16 units and bytes separately',()=>{
  const r=textReport('e\u0301😀');
  assert.equal(r.graphemes,2); assert.equal(r.codePoints,3); assert.equal(r.codeUnits,4); assert.equal(r.bytes,7);
  assert.equal(r.normalization.NFC,false); assert.equal(r.normalization.NFD,true);
  assert.deepEqual(r.characters.map(x=>x.point),['U+0065','U+0301','U+1F600']);
});
test('case-insensitive frequency normalizes equivalent Unicode spellings',()=>{
  const r=textReport('Café cafe\u0301 CAFÉ sea sea');
  assert.equal(r.words,5); assert.equal(r.uniqueWords,2); assert.deepEqual(r.frequency,[{word:'café',count:3},{word:'sea',count:2}]);
});
test('CRLF is a single newline, with blank lines separating paragraphs',()=>{
  const r=textReport('first\r\nsecond\r\n\r\nthird\r');
  assert.equal(r.lines,5); assert.equal(r.paragraphs,2);
  assert.equal(textReport('first\r\nsecond').paragraphs,1);
  assert.equal(textReport('').paragraphs,0); assert.equal(textReport('').lines,0);
});
test('locale-aware transformations preserve Turkish dotted and dotless i',()=>{
  assert.equal(transformText('istanbul IĞDIR','lower',{locale:'tr'}),'istanbul ığdır');
  assert.equal(transformText('istanbul','upper',{locale:'tr'}),'İSTANBUL');
  assert.throws(()=>validLocale('not a locale!'),/language tag/);
});
test('cleanup previews an explicit spacing change and preserves paragraph breaks',()=>{
  const original='  Alpha\t beta  \r\n\r\n\r\n  Gamma  ';
  assert.equal(transformText(original,'cleanup'),'Alpha beta\n\nGamma');
  assert.ok(original.startsWith('  '));
});
test('slug preserves words across punctuation and has an explicit ASCII option',()=>{
  assert.equal(transformText('Café / Halifax: 海','slug'),'café-halifax-海');
  assert.equal(transformText('Café / Halifax: 海','slug',{asciiSlug:true}),'cafe-halifax');
  assert.equal(transformText('hello/world','slug',{asciiSlug:true}),'hello-world');
});
test('identifier cases split acronym boundaries and existing camel case',()=>{
  assert.equal(transformText('HTTPServer rockyCoast','snake'),'http_server_rocky_coast');
  assert.equal(transformText('river pulse','camel'),'riverPulse');
  assert.equal(transformText('river pulse','pascal'),'RiverPulse');
  assert.equal(transformText('river pulse','kebab'),'river-pulse');
});
test('Unicode compatibility normalization is separate from canonical normalization',()=>{
  assert.equal(transformText('① ﬁ','NFC'),'① ﬁ');
  assert.equal(transformText('① ﬁ','NFKC'),'1 fi');
  assert.equal(transformText('é','NFD'),'e\u0301');
});
test('work limits reject oversized text without returning a partial analysis',()=>{
  assert.throws(()=>textReport('a'.repeat(1001),'en',{maximumCharacters:1000}),/not been changed/);
  assert.throws(()=>transformText('a'.repeat(1001),'lower',{}, {maximumCharacters:1000}),/not been changed/);
  assert.throws(()=>transformText('hello','bad'),/supported/);
  assert.equal(textSettings({maximumCharacters:900000}).maximumCharacters,500000);
});
test('frequency CSV quotes delimiters and neutralizes spreadsheet formulas',()=>{
  const output=frequencyCsv({frequency:[{word:'=TEST("a")',count:2},{word:'a,b',count:1}]});
  assert.ok(output.startsWith('\uFEFF')); assert.ok(output.includes(`"'=TEST(""a"")"`)); assert.ok(output.includes('"a,b"'));
});
