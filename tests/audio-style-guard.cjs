/* Audio style regression checks. Run: node tests/audio-style-guard.cjs */
const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync('app.js','utf8'), ui=fs.readFileSync('index.html','utf8'), app2=fs.readFileSync('app2.js','utf8');
function empty(){const p=new Proxy(function(){},{get(t,k){if(k===Symbol.toPrimitive)return()=>'';if(k==='length')return 0;return empty();},apply(){return empty();},set(){return true;}});return p;}
const context={console,URL,AbortController,Blob,Uint8Array,setTimeout(){},clearTimeout(){},setInterval(){},clearInterval(){},requestAnimationFrame(){},addEventListener(){},removeEventListener(){},matchMedia(){return {matches:false,addEventListener(){}};},document:empty(),indexedDB:empty(),history:empty(),navigator:{},location:{origin:'https://example.invalid',href:'https://example.invalid/'},localStorage:{getItem(){return null;},setItem(){},removeItem(){}},speechSynthesis:{getVoices(){return [];},cancel(){},speak(){}},getComputedStyle:empty};
context.window=context;vm.createContext(context);vm.runInContext(source+'\n;globalThis.testAPI={settings,TONES,effectiveCloudVoice,voiceGenderHint,OPENAI_SEED,azureSSML};',context);
const t=context.testAPI,s=t.settings;let count=0;function check(name,ok){assert.ok(ok,name);console.log('ok '+name);count++;}
check('default rate',s.speed===1&&t.TONES.calm.rate===1);
for(const id of ['professor','engineer','mentor','founder','playful','simplifier','reverse','hakawati'])check(id+' exists',!!t.TONES[id]&&ui.includes('value="'+id+'"'));
check('backup excludes OpenAI key',/delete s\.oKey/.test(app2));
check('restore preserves local OpenAI key',app2.includes('oKey: settings.oKey'));
s.voiceGender='female';s.azVoice='ar-EG-ShakirNeural';s.azVoiceManual=false;
check('automatic Egyptian female',t.effectiveCloudVoice('azure',{kind:'explain',explDialect:'egyptian'})==='ar-EG-SalmaNeural');
check('automatic fusha female',t.effectiveCloudVoice('azure',{kind:'explain',explDialect:'fusha'})==='ar-SA-ZariyahNeural');
s.azVoiceManual=true;check('manual voice wins',t.effectiveCloudVoice('azure',{kind:'explain',explDialect:'fusha'})==='ar-EG-ShakirNeural');
check('no guessing gender from a person name',t.voiceGenderHint({name:'Salma unknown engine'})==='');
check('13 current OpenAI voices',t.OPENAI_SEED.length===13);
check('Azure style support checked',source.includes('meta.styles.includes(wantedStyle)'));
check('device rate not multiplied by tone',source.includes('u.rate=settings.speed||1'));
check('cloud playback single rate',source.includes('elPlayBlob(b, settings.speed||1)'));
check('Google synthesizes neutral rate',source.includes('speakingRate: 1'));
check('learning review stored with version',source.includes('ch.explVersion=2'));
check('original-only books can play explanation',app2.includes('b.chunks[i].status==="done" || bookTargetLang(b)==="orig"'));
check('three learner levels',source.includes('beginner:{label:')&&source.includes('intermediate:{label:')&&source.includes('advanced:{label:')&&ui.includes('id="learningLevelSel"'));
check('level is part of explanation cache',source.includes('ch.explLevel==='));
check('text and audio share explanation freshness',source.includes('const needsExpl = c => !explanationMatchesSettings(c)')&&source.includes('if(explanationMatchesSettings(ch)){ openChunkExplanation(i)'));
console.log(count+' audio checks passed');
