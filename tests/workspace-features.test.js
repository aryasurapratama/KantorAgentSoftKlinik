import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDocument, retrieveKnowledge, inspectConnector, previewTelegram } from '../workspace-features.js';

test('document types, size, relevant late snippet and no match', () => {
  assert.equal(validateDocument({name:'a.md',content:'text'}),true);
  assert.equal(validateDocument({name:'a.exe',content:'text'}),false);
  assert.equal(validateDocument({name:'a.txt',content:'x'.repeat(100001)}),false);
  const docs=[{name:'guide.md',content:'irrelevant '.repeat(1000)+'specialneedle invoice guidance'}];
  const result=retrieveKnowledge(docs,'specialneedle',700);
  assert.ok(result.includes('specialneedle')); assert.ok(result.includes('[Dokumen: guide.md]'));
  assert.ok(result.includes('untrusted')); assert.ok(result.length<=700);
  assert.equal(retrieveKnowledge(docs,'absentword'),'');
});
test('GitHub accepts parsed JSON dependency, fixed host, bounded content', async()=>{
  let called;
  const result=await inspectConnector({type:'github',token:'secret'}, {repository:'owner/repo'}, {fetchJson:async(url,opts)=>{called={url:String(url),opts};return {name:'repo'};}});
  assert.equal(called.url,'https://api.github.com/repos/owner/repo/readme');
  assert.equal(called.opts.headers.Authorization,'Bearer secret'); assert.equal(called.opts.redirect,'error');
  assert.equal(result.title,'GitHub'); assert.ok(result.content.includes('repo'));
  for(const repository of ['../evil','owner/repo?x=1','owner/repo/extra','https://evil.test/a']) await assert.rejects(inspectConnector({type:'github'},{repository},{fetchJson:()=>assert.fail('must not fetch')}),/Invalid repository/);
});
test('web rejects private, mapped, reserved and mixed DNS answers',async()=>{
  for(const address of ['127.0.0.1','10.0.0.1','172.16.0.1','192.168.1.2','169.254.169.254','100.64.1.1','192.0.2.1','198.51.100.1','203.0.113.1','224.1.1.1','::1','::','fc00::1','fe80::1','::ffff:127.0.0.1','::ffff:7f00:1','2001:db8::1']) {
    await assert.rejects(inspectConnector({type:'web',baseUrl:'https://example.test'}, {}, {lookup:async()=>[{address}],fetchJson:()=>assert.fail('must not fetch')}),/Private/);
  }
  await assert.rejects(inspectConnector({type:'web',baseUrl:'https://example.test'}, {}, {lookup:async()=>[{address:'8.8.8.8'},{address:'127.0.0.1'}],fetchJson:()=>assert.fail('must not fetch')}),/Private/);
});
test('web supports public JSON mocks and rejects credentials/http',async()=>{
  const opts={lookup:async()=>[{address:'8.8.8.8',family:4}],fetchJson:async()=>[{title:'hello'}]};
  assert.equal((await inspectConnector({type:'cms',baseUrl:'https://example.test'}, {},opts)).items.length,1);
  for(const baseUrl of ['http://example.test','https://user:pass@example.test']) await assert.rejects(inspectConnector({type:'web',baseUrl},{},opts),/HTTPS public/);
});
test('Telegram previews validate IDs and bounded text without sending',()=>{
  assert.deepEqual(previewTelegram({chatId:'-12345',text:' hello '}),{action:'sendMessage',chatId:'-12345',text:'hello'});
  for(const chatId of ['https://bad','abc','1/2','']) assert.throws(()=>previewTelegram({chatId,text:'hello'}));
  assert.throws(()=>previewTelegram({chatId:'123',text:'x'.repeat(4001)}));
});
test('web requires configured URL and sanitizes item fields',async()=>{
  await assert.rejects(inspectConnector({type:'web'},{url:'https://example.test'}),/Configured/);
  const result=await inspectConnector({type:'cms',baseUrl:'https://example.test'},{},{lookup:async()=>[{address:'8.8.8.8',family:4}],fetchJson:async()=>[{id:1,title:{rendered:'x'.repeat(3000)},excerpt:{rendered:'y'.repeat(3000)},link:'https://example.test',secret:'not exposed'}]});
  assert.equal(result.items[0].title.length,1000); assert.equal(result.items[0].excerpt.length,1000); assert.equal(result.items[0].secret,undefined);
});
test('total connector deadline includes unresolved DNS',async()=>{
  await assert.rejects(inspectConnector({type:'web',baseUrl:'https://example.test'},{},{timeoutMs:5,lookup:()=>new Promise(resolve=>setTimeout(()=>resolve([{address:'8.8.8.8',family:4}]),30))}),/timeout/);
});
