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
  const ZOOM_LEVELS = ['fit', 1, 1.5, 2];
  const DIM_STACK_PREFIXES = [
    'package:flutter/',
    'package:flutter_test/',
    'package:test_api/',
    'package:test_core/',
    'package:matcher/',
    'package:stack_trace/',
    'package:async/',
    'package:boolean_selector/',
    '(dart:',
  ];

  const vscode = acquireVsCodeApi();
  const frames = [];
  let follow = true;
  // Bumped on every 'reset'; in-flight drain/replay loops bail once stale
  // so a new run can never have an old run's timers paint over it.
  let generation = 0;
  let zoomIndex = 0;

  // Paced playback queue for live-arriving frames (BURST verdict).
  const playQueue = [];
  let draining = false;
  let replaying = false;

  const el = (id) => document.getElementById(id);
  const img = el('frame');
  const frameBadge = el('frame-badge');
  const zoomOutBtn = el('zoom-out');
  const zoomInBtn = el('zoom-in');
  const zoomResetBtn = el('zoom-reset');
  const slider = el('slider');
  const frameInfo = el('frame-info');
  const testName = el('test-name');
  const meta = el('meta');
  const state = el('state');
  const drawer = el('drawer');
  const errorMessage = el('error-message');
  const stackLabel = el('stack-label');
  const stackTrace = el('stack-trace');
  const copyBtn = el('copy-btn');
  const maximizeBtn = el('maximize-btn');
  const setupBox = el('setup-box');
  const replayBtn = el('replay-btn');
  const followBtn = el('follow-btn');

  function pacedGap(delayMs) {
    return Math.min(Math.max(delayMs, MIN_GAP_MS), MAX_GAP_MS);
  }

  function updateReplayEnabled() {
    replayBtn.disabled = draining || replaying || frames.length === 0;
  }

  function updateFollowUI() {
    followBtn.classList.toggle('on', follow);
  }

  function updateMeta() {
    if (frames.length === 0) {
      meta.textContent = '';
      return;
    }
    const last = frames[frames.length - 1];
    meta.textContent = frames.length + (frames.length === 1 ? ' frame' : ' frames') +
      ' · ' + last.testTimeMs + ' ms';
  }

  function applyZoom() {
    const level = ZOOM_LEVELS[zoomIndex];
    img.style.transform = level === 'fit' ? 'none' : 'scale(' + level + ')';
    zoomOutBtn.disabled = zoomIndex === 0;
    zoomInBtn.disabled = zoomIndex === ZOOM_LEVELS.length - 1;
  }

  function updateFrameBadge() {
    const idx = Number(slider.value);
    if (!img.naturalWidth || frames.length === 0) {
      frameBadge.hidden = true;
      return;
    }
    frameBadge.hidden = false;
    frameBadge.textContent = img.naturalWidth + '×' + img.naturalHeight +
      ' · frame ' + (idx + 1) + '/' + frames.length;
  }

  function renderFrame() {
    const f = frames[Number(slider.value)];
    if (!f) return;
    img.src = 'data:image/png;base64,' + f.png;
    img.hidden = false;
    frameInfo.textContent =
      'frame ' + (Number(slider.value) + 1) + '/' + frames.length +
      ' · ' + f.testTimeMs + ' ms';
    updateMeta();
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
    updateFollowUI();
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
        updateFollowUI();
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

  function goLive() {
    follow = true;
    updateFollowUI();
    if (frames.length > 0) {
      slider.value = slider.max;
      renderFrame();
    }
  }

  function isLibraryFrame(line) {
    return DIM_STACK_PREFIXES.some((prefix) => line.includes(prefix));
  }

  function renderStackTrace(text) {
    stackTrace.textContent = '';
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      const span = document.createElement('span');
      span.className = isLibraryFrame(line) ? 'ltv-frame-dim' : 'ltv-frame-user';
      span.textContent = line;
      stackTrace.appendChild(span);
      if (i < lines.length - 1) stackTrace.appendChild(document.createTextNode('\n'));
    });
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
        zoomIndex = 0;
        applyZoom();
        img.removeAttribute('src');
        img.hidden = true;
        frameBadge.hidden = true;
        slider.max = 0;
        slider.value = 0;
        slider.disabled = true;
        frameInfo.textContent = '';
        meta.textContent = '';
        testName.textContent = m.testLabel;
        state.textContent = 'running';
        state.className = 'running';
        drawer.hidden = true;
        drawer.classList.remove('maximized');
        maximizeBtn.textContent = '⤢ Maximize';
        setupBox.hidden = true;
        updateReplayEnabled();
        updateFollowUI();
        break;
      case 'testName':
        testName.textContent = m.name;
        break;
      case 'frame':
        queueFrame(m);
        break;
      case 'status':
        state.textContent = m.state === 'passed' ? 'passed' : 'failed';
        state.className = m.state;
        if (m.error) {
          errorMessage.hidden = !m.error;
          errorMessage.textContent = m.error || '';
          const hasStack = Boolean(m.stack);
          stackLabel.hidden = !hasStack;
          if (hasStack) {
            renderStackTrace(m.stack);
          } else {
            stackTrace.textContent = '';
          }
          drawer.hidden = false;
        }
        break;
      case 'setupNeeded':
        state.textContent = '';
        state.className = '';
        setupBox.hidden = false;
        break;
    }
  });

  slider.addEventListener('input', () => {
    follow = Number(slider.value) === frames.length - 1;
    updateFollowUI();
    renderFrame();
  });

  img.addEventListener('load', updateFrameBadge);

  replayBtn.addEventListener('click', replay);
  followBtn.addEventListener('click', goLive);

  zoomInBtn.addEventListener('click', () => {
    zoomIndex = Math.min(zoomIndex + 1, ZOOM_LEVELS.length - 1);
    applyZoom();
  });
  zoomOutBtn.addEventListener('click', () => {
    zoomIndex = Math.max(zoomIndex - 1, 0);
    applyZoom();
  });
  zoomResetBtn.addEventListener('click', () => {
    zoomIndex = 0;
    applyZoom();
  });

  copyBtn.addEventListener('click', () => {
    const text = errorMessage.textContent +
      (stackTrace.textContent ? '\n\n' + stackTrace.textContent : '');
    navigator.clipboard.writeText(text).then(() => {
      const original = copyBtn.textContent;
      copyBtn.textContent = '✓ Copied';
      setTimeout(() => { copyBtn.textContent = original; }, 1200);
    }).catch(() => { /* clipboard unavailable; nothing to fall back to */ });
  });

  maximizeBtn.addEventListener('click', () => {
    const maximized = drawer.classList.toggle('maximized');
    maximizeBtn.textContent = maximized ? '⤢ Restore' : '⤢ Maximize';
  });

  el('setup-btn').addEventListener('click', () => {
    vscode.postMessage({ type: 'setup' });
  });

  applyZoom();
  updateFollowUI();
})();
