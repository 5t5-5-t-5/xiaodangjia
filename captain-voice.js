/* Prerecorded captain voice. Keep this shared file when regenerating the HTML pages. */
(function () {
  'use strict';
  const pack = window.XDJ_CAPTAIN_VOICE_PACK;
  if (!pack) return;
  const base = new URL('.', document.currentScript.src);
  const fetched = new Map(), decoded = new Map(), playing = new Set();
  let context = null, revision = 0, enabled = () => true;

  function plan(text) {
    if (Object.prototype.hasOwnProperty.call(pack.phrases, text)) return pack.phrases[text];
    const debt = '先还了预支1块。';
    if (text.endsWith(debt)) {
      const first = pack.phrases[text.slice(0, -debt.length)];
      if (first) return first.concat('debt-one');
    }
    if (text.endsWith('，取消啦')) return ['cancelled'];
    if (text.endsWith('，已经记过啦')) return ['already-recorded'];
    return null;
  }

  function stopNodes() {
    for (const node of playing) {
      try { node.stop(); } catch (_) {}
      try { node.disconnect(); } catch (_) {}
    }
    playing.clear();
  }
  function stop() { revision++; stopNodes(); }

  // Called synchronously by the original tap, before any asynchronous record write.
  // Reusing the effects context also avoids opening multiple audio sessions on iPad.
  function prepare() {
    if (!enabled() || document.hidden) return Promise.resolve(false);
    try {
      if (!context || context.state === 'closed') {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return Promise.resolve(false);
        const shared = window.__ac;
        context = shared && shared.state !== 'closed' ? shared : new AudioContext();
        window.__ac = context;
        decoded.clear();
      }
      const resumed = context.state === 'running' ? Promise.resolve() : context.resume();
      // A silent frame unlocks older iPad Web Audio implementations in the same gesture.
      const silent = context.createBufferSource();
      silent.buffer = context.createBuffer(1, 1, context.sampleRate);
      silent.connect(context.destination);
      silent.onended = () => silent.disconnect();
      silent.start();
      return Promise.resolve(resumed).then(() => context.state === 'running', () => false);
    } catch (_) { return Promise.resolve(false); }
  }

  function fetchClip(id) {
    if (fetched.has(id)) return fetched.get(id);
    const file = pack.files[id];
    if (!file) return Promise.reject(new Error('Missing voice clip: ' + id));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const pending = fetch(new URL(file, base), { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error('Voice request failed: ' + response.status);
        return response.arrayBuffer();
      })
      .catch(error => { fetched.delete(id); throw error; })
      .finally(() => clearTimeout(timer));
    fetched.set(id, pending);
    return pending;
  }
  function decode(id) {
    if (decoded.has(id)) return decoded.get(id);
    const activeContext = context;
    const pending = fetchClip(id).then(bytes => activeContext.decodeAudioData(bytes.slice(0)))
      .catch(error => { decoded.delete(id); throw error; });
    decoded.set(id, pending);
    return pending;
  }

  // Return false for dynamic text so the caller can use the existing system voice.
  function play(text, fallback) {
    const ids = plan(String(text));
    if (!ids || !enabled()) return false;
    stop();
    const mine = revision;
    const current = () => mine === revision && enabled() && !document.hidden;
    prepare().then(async ready => {
      if (!ready) throw new Error('Audio session unavailable');
      const buffers = await Promise.all(ids.map(decode));
      if (!current()) return;
      if (context.state !== 'running') throw new Error('Audio session interrupted');
      let when = context.currentTime + 0.015;
      for (const buffer of buffers) {
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(context.destination);
        playing.add(source);
        source.onended = () => { playing.delete(source); source.disconnect(); };
        source.start(when);
        when += buffer.duration + 0.10;
      }
    }).catch(() => {
      if (!current()) return;
      stopNodes();
      if (typeof fallback === 'function') fallback();
    });
    return true;
  }

  function preload(ids) {
    return Promise.all(ids.map(id => fetchClip(id).then(() => true, () => false)));
  }
  // The capture listeners run before tapHabit/tapJob reach their first await.
  document.addEventListener('pointerdown', () => { void prepare(); }, { capture: true, passive: true });
  document.addEventListener('click', () => { void prepare(); }, true);
  document.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') void prepare();
  }, true);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  window.addEventListener('pagehide', stop);
  window.XDJCaptainVoice = { play, stop, prepare, preload, setEnabled: callback => { enabled = callback; } };
})();
