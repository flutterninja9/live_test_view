// extension/media/panel.js
// Renders exactly what the extension posts. No protocol knowledge here.
//
// Spike verdict (Task 2): BURST — frames from the test process arrive
// clustered at test end, not spread over the run. To make the panel still
// read as a live replay, incoming frames are queued while following and
// drained on a timer paced by consecutive testTimeMs deltas, clamped to
// [MIN_GAP_MS, MAX_GAP_MS] instead of being rendered the instant they
// arrive. A floor is required, not just a cap: measured real deltas are
// mostly 0-100ms, so a cap alone still flashes through most frames.
(function () {
  const MIN_GAP_MS = 150;
  const MAX_GAP_MS = 300;

  const vscode = acquireVsCodeApi();
  const frames = [];
  let follow = true;
  // Bumped on every 'reset'; in-flight drain/replay loops bail once stale
  // so a new run can never have an old run's timers paint over it.
  let generation = 0;

  // Paced playback queue for live-arriving frames (BURST verdict).
  const playQueue = [];
  let draining = false;
  let replaying = false;

  const el = (id) => document.getElementById(id);
  const img = el('frame');
  const slider = el('slider');
  const frameInfo = el('frame-info');
  const testLabel = el('test-label');
  const state = el('state');
  const errorBox = el('error-box');
  const errorText = el('error-text');
  const setupBox = el('setup-box');
  const replayBtn = el('replay-btn');

  function pacedGap(delayMs) {
    return Math.min(Math.max(delayMs, MIN_GAP_MS), MAX_GAP_MS);
  }

  function updateReplayEnabled() {
    replayBtn.disabled = draining || replaying || frames.length === 0;
  }

  function renderFrame() {
    const f = frames[Number(slider.value)];
    if (!f) return;
    img.src = 'data:image/png;base64,' + f.png;
    frameInfo.textContent =
      'frame ' + (Number(slider.value) + 1) + '/' + frames.length +
      ' · ' + f.testTimeMs + ' ms';
  }

  function drainQueue(myGeneration) {
    if (draining) return;
    draining = true;
    updateReplayEnabled();
    const step = () => {
      if (myGeneration !== generation) {
        draining = false;
        return;
      }
      const next = playQueue.shift();
      if (!next) {
        draining = false;
        updateReplayEnabled();
        return;
      }
      frames.push(next.frame);
      slider.max = String(frames.length - 1);
      slider.disabled = false;
      if (follow) {
        slider.value = slider.max;
      }
      renderFrame();
      setTimeout(step, pacedGap(next.delayMs));
    };
    step();
  }

  function queueFrame(m) {
    const prevTestTimeMs =
      playQueue.length > 0
        ? playQueue[playQueue.length - 1].frame.testTimeMs
        : (frames.length > 0 ? frames[frames.length - 1].testTimeMs : m.testTimeMs);
    const delayMs = Math.max(0, m.testTimeMs - prevTestTimeMs);
    playQueue.push({ frame: m, delayMs });
    drainQueue(generation);
  }

  function replay() {
    if (replaying || draining || frames.length === 0) return;
    const myGeneration = generation;
    replaying = true;
    follow = false;
    slider.disabled = true;
    updateReplayEnabled();
    const snapshot = frames.slice();
    let i = 0;
    const step = () => {
      if (myGeneration !== generation) {
        replaying = false;
        return;
      }
      if (i >= snapshot.length) {
        replaying = false;
        follow = true;
        slider.disabled = false;
        slider.value = String(frames.length - 1);
        renderFrame();
        updateReplayEnabled();
        return;
      }
      slider.value = String(i);
      renderFrame();
      const gap = i === 0 ? MIN_GAP_MS
        : pacedGap(snapshot[i].testTimeMs - snapshot[i - 1].testTimeMs);
      i++;
      setTimeout(step, gap);
    };
    step();
  }

  window.addEventListener('message', (e) => {
    const m = e.data;
    switch (m.type) {
      case 'reset':
        generation++;
        frames.length = 0;
        playQueue.length = 0;
        draining = false;
        replaying = false;
        follow = true;
        img.removeAttribute('src');
        slider.max = 0;
        slider.value = 0;
        slider.disabled = true;
        frameInfo.textContent = '';
        testLabel.textContent = m.testLabel;
        state.textContent = '● running';
        state.className = 'running';
        errorBox.hidden = true;
        setupBox.hidden = true;
        updateReplayEnabled();
        break;
      case 'testName':
        testLabel.textContent = m.name;
        break;
      case 'frame':
        queueFrame(m);
        break;
      case 'status':
        state.textContent = m.state === 'passed' ? '✓ passed' : '✗ failed';
        state.className = m.state;
        if (m.error) {
          errorText.textContent = m.error + '\n\n' + (m.stack || '');
          errorBox.hidden = false;
          errorBox.open = true;
        }
        break;
      case 'setupNeeded':
        state.textContent = '';
        setupBox.hidden = false;
        break;
    }
  });

  slider.addEventListener('input', () => {
    follow = Number(slider.value) === frames.length - 1;
    renderFrame();
  });

  replayBtn.addEventListener('click', replay);

  el('setup-btn').addEventListener('click', () => {
    vscode.postMessage({ type: 'setup' });
  });
})();
