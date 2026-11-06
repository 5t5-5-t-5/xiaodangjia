'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const code = fs.readFileSync(path.join(__dirname, '../captain-voice.js'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
function setup({rejectFetch = false, deferFetch = false} = {}) {
  const requests = [], sources = [], resumes = [], events = {};
  const document = { hidden: false, currentScript: { src: 'https://example.test/xiaodangjia/captain-voice.js?v=1' },
    addEventListener(name, fn) { events[name] = fn; } };
  class Context {
    constructor() { this.state = 'suspended'; this.sampleRate = 48000; this.currentTime = 1; this.destination = {}; }
    resume() { resumes.push('gesture'); this.state = 'running'; return Promise.resolve(); }
    createBuffer() { return { silent: true }; }
    createBufferSource() {
      const s = { connect() {}, disconnect() {}, start(when) { this.when = when; }, stop() { this.stopped = true; } };
      sources.push(s); return s;
    }
    decodeAudioData() { return Promise.resolve({ duration: 1 }); }
  }
  let resolveFetch;
  const window = { AudioContext: Context, addEventListener() {}, XDJ_CAPTAIN_VOICE_PACK: {
    files: { a: 'audio/captain/v1/a.mp3', b: 'audio/captain/v1/b.mp3', 'debt-one': 'audio/captain/v1/debt-one.mp3', cancelled: 'c.mp3', 'already-recorded': 'd.mp3' },
    phrases: { '任务，加2分！': ['a'], '问好': ['a', 'b'], '扫地，存进1块钱！': ['b'] }
  } };
  const response = { ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(2)) };
  const fetch = url => {
    requests.push(String(url));
    if (rejectFetch) return Promise.reject(new Error('offline'));
    if (deferFetch) return new Promise(resolve => { resolveFetch = () => resolve(response); });
    return Promise.resolve(response);
  };
  vm.runInNewContext(code, { window, document, URL, AbortController, fetch, setTimeout, clearTimeout, Map, Set, Promise, Object, Error });
  return { voice: window.XDJCaptainVoice, window, document, requests, resumes, sources, events, resolve: () => resolveFetch() };
}
test('gesture unlock happens before delayed playback and relative URLs retain the project path', async () => {
  const x = setup(); x.events.pointerdown();
  assert.equal(x.resumes.length, 1);
  assert.equal(x.voice.play('任务，加2分！'), true);
  await tick(); await tick();
  assert.deepEqual(x.requests, ['https://example.test/xiaodangjia/audio/captain/v1/a.mp3']);
  assert.equal(x.sources.filter(s => !s.buffer.silent).length, 1);
});
test('newest tap wins when an earlier audio download completes late', async () => {
  const x = setup({deferFetch: true}); let oldFallback = 0;
  x.voice.play('任务，加2分！', () => oldFallback++);
  await tick(); x.voice.stop(); x.resolve(); await tick(); await tick();
  assert.equal(x.sources.filter(s => s.buffer && !s.buffer.silent).length, 0);
  assert.equal(oldFallback, 0);
});
test('fetch failure falls back once and can be retried', async () => {
  const x = setup({rejectFetch: true}); let fallback = 0;
  x.voice.play('任务，加2分！', () => fallback++); await tick(); await tick();
  assert.equal(fallback, 1);
  x.voice.play('任务，加2分！', () => fallback++); await tick(); await tick();
  assert.equal(fallback, 2); assert.equal(x.requests.length, 2);
});
test('dynamic dates and amounts are not matched to an inaccurate recording', () => {
  const x = setup();
  assert.equal(x.voice.play('昨天的任务，加2分！'), false);
  assert.equal(x.voice.play('任务，加10分！'), false);
  assert.equal(x.voice.play('扫地，存进2块钱！'), false);
});
test('debt repayment retains its additional spoken amount and greeting clips are sequential', async () => {
  const x = setup(); x.voice.play('扫地，存进1块钱！先还了预支1块。');
  await tick(); await tick();
  const spoken = x.sources.filter(s => s.buffer && !s.buffer.silent);
  assert.equal(spoken.length, 2); assert.ok(spoken[1].when > spoken[0].when + 1);
  assert.equal(x.requests.length, 2);
});
test('hidden pages cancel playback and the next user gesture resumes an interrupted context', async () => {
  const x = setup(); x.voice.play('任务，加2分！'); await tick(); await tick();
  const spoken = x.sources.find(s => s.buffer && !s.buffer.silent);
  x.document.hidden = true; x.events.visibilitychange(); assert.equal(spoken.stopped, true);
  x.document.hidden = false; x.window.__ac.state = 'interrupted'; x.events.click(); await tick();
  assert.equal(x.window.__ac.state, 'running'); assert.equal(x.resumes.length, 2);
});
test('other voice styles do not initialize the recorded voice session', () => {
  const x = setup(); x.voice.setEnabled(() => false); x.events.pointerdown();
  assert.equal(x.resumes.length, 0); assert.equal(x.voice.play('任务，加2分！'), false);
});

test('every current points and bank card has an exact matching recording, with existing files', () => {
  const root=path.join(__dirname,'..'), sandbox={window:{}};
  vm.runInNewContext(fs.readFileSync(path.join(root,'captain-voice-pack.js'),'utf8'),sandbox);
  const pack=sandbox.window.XDJ_CAPTAIN_VOICE_PACK;
  // 新加的卡片还没录音，先用系统队长声音；补好录音后从这里删掉
  const AWAITING_RECORDING=['盛饭，存进1块钱！'];
  for(const file of ['points.html','bank.html']){
    const html=fs.readFileSync(path.join(root,file),'utf8');
    const habits=vm.runInNewContext(html.match(/const HABITS=(\[[\s\S]*?\n\]);/)[1]);
    const jobs=vm.runInNewContext(html.match(/const JOBS=(\[[\s\S]*?\n\]\.map\(j=>\(\{price:1,\.\.\.j\}\)\));/)[1]);
    assert.equal(habits.length,27);assert.equal(jobs.length,20);
    for(const h of habits){const text=(h.hot?'哇，自己主动的！':'')+h.name+'，加'+h.pts+'分！';assert.ok(pack.phrases[text],text)}
    for(const j of jobs){const text=j.name+'，存进'+j.price+'块钱！';if(AWAITING_RECORDING.includes(text))continue;assert.ok(pack.phrases[text],text)}
  }
  for(const ids of Object.values(pack.phrases))for(const id of ids){
    const asset=pack.files[id];assert.ok(asset&&!asset.startsWith('/')&&!asset.includes('..'));
    assert.ok(fs.statSync(path.join(root,asset)).size>1000,asset);
  }
  assert.equal(Object.keys(pack.files).length,59);
});
