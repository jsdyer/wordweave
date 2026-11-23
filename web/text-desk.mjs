import {TRANSFORMS, textSettings, textReport, transformText, frequencyCsv} from './text-model.mjs';
const $ = id => document.getElementById(id);
const make = (tag, text) => { const node = document.createElement(tag); node.textContent = text; return node; };
let settings = textSettings(), report = null, timer;
export function configureTextTools(config) { settings = textSettings(config); $('text-limit').textContent = settings.maximumCharacters.toLocaleString(); update(); }
function download(content, name, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content], {type})); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); }
function update() {
  try {
    report = textReport($('text-source').value, $('text-locale').value, settings);
    for (const [id, value] of Object.entries({words:report.words,unique:report.uniqueWords,graphemes:report.graphemes??'Unavailable',bytes:report.bytes,lines:report.lines,paragraphs:report.paragraphs,points:report.codePoints,units:report.codeUnits})) $('stat-'+id).textContent = typeof value === 'number' ? value.toLocaleString() : value;
    $('text-reading').textContent = `${report.words ? Math.max(1, Math.round(report.readingMinutes * 60)) : 0} seconds at ${settings.readingWordsPerMinute} words/minute. This is a configurable estimate.`;
    $('text-frequency').replaceChildren(...report.frequency.map(row => { const tr=make('tr',''); tr.append(make('td',row.word),make('td',row.count.toLocaleString())); return tr; }));
    $('frequency-note').textContent = report.words ? `Showing ${report.frequency.length} of ${report.frequencyTotal} distinct words. Counts use ${report.segmentation}, NFC normalization and locale-aware lowercasing.` : 'Paste text to count its words. Nothing is sent to Datamuse.';
    $('unicode-summary').textContent = Object.entries(report.normalization).map(([form,same])=>`${form}: ${same?'already normalized':'would change'}`).join(' · ');
    $('unicode-list').replaceChildren(...report.characters.map(row => { const li=make('li',''); li.append(make('code',row.point),make('span',row.description)); return li; }));
    $('unicode-note').textContent = `First ${report.characters.length} of ${report.codePoints} Unicode code points. Graphemes may contain several code points.`;
    $('text-status').textContent = 'Analysis updated locally. The original text is unchanged.';
    $('frequency-save').disabled = !report.words;
  } catch (error) { report=null; $('text-status').textContent=error.message; $('frequency-save').disabled=true; }
}

for (const [value,label] of Object.entries(TRANSFORMS)) { const option=make('option',label); option.value=value; $('text-operation').append(option); }
$('text-source').addEventListener('input',()=>{clearTimeout(timer); timer=setTimeout(update,150);});
$('text-locale').addEventListener('change',update);
$('text-transform').addEventListener('click',()=>{try{const output=transformText($('text-source').value,$('text-operation').value,{locale:$('text-locale').value,asciiSlug:$('ascii-slug').checked},settings);$('text-output').value=output;$('text-output-count').textContent=`${[...output].length.toLocaleString()} code points · ${new TextEncoder().encode(output).length.toLocaleString()} UTF-8 bytes`;$('text-save').disabled=!output;$('text-use').disabled=!output;$('text-status').textContent='Transformation preview ready. The original is unchanged until you choose Use output as original.';}catch(error){$('text-status').textContent=error.message;}});
$('text-operation').addEventListener('change',()=>{$('ascii-option').hidden=$('text-operation').value!=='slug';});
$('text-use').addEventListener('click',()=>{$('text-source').value=$('text-output').value;update();});
$('text-save').addEventListener('click',()=>download($('text-output').value,'wordweave-transformed.txt','text/plain;charset=utf-8'));
$('frequency-save').addEventListener('click',()=>{if(report)download(frequencyCsv(report),'wordweave-frequency.csv','text/csv;charset=utf-8');});
$('text-clear').addEventListener('click',()=>{$('text-source').value='';$('text-output').value='';$('text-output-count').textContent='No transformation yet';$('text-save').disabled=true;$('text-use').disabled=true;update();});

const tabs=[...document.querySelectorAll('[role="tab"]')];
function selectTab(tab, focus=false){for(const other of tabs){const selected=other===tab;other.setAttribute('aria-selected',String(selected));other.tabIndex=selected?0:-1;$(other.getAttribute('aria-controls')).hidden=!selected;}if(focus)tab.focus();}
for(const tab of tabs){tab.addEventListener('click',()=>selectTab(tab));tab.addEventListener('keydown',event=>{let index=tabs.indexOf(tab);if(event.key==='ArrowRight')index=(index+1)%tabs.length;else if(event.key==='ArrowLeft')index=(index-1+tabs.length)%tabs.length;else if(event.key==='Home')index=0;else if(event.key==='End')index=tabs.length-1;else return;event.preventDefault();selectTab(tabs[index],true);});}
update();
