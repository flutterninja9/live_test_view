// extension/media/previewPanel.js
// Renders exactly what the extension posts. No protocol knowledge here.
(function () {
  const el = (id) => document.getElementById(id);
  const img = el('frame');
  const label = el('label');
  const state = el('state');
  const errorBox = el('error-box');
  const errorText = el('error-text');

  const STATE_LABELS = {
    booting: 'Booting…',
    ready: 'Ready',
    reloading: 'Reloading…',
    error: 'Error',
  };

  window.addEventListener('message', (event) => {
    const msg = event.data;
    switch (msg.type) {
      case 'reset':
        label.textContent = msg.label;
        img.hidden = true;
        errorBox.hidden = true;
        state.textContent = '';
        break;
      case 'frame':
        img.src = 'data:image/png;base64,' + msg.png;
        img.hidden = false;
        errorBox.hidden = true;
        break;
      case 'status':
        state.textContent = STATE_LABELS[msg.state] ?? '';
        if (msg.state === 'error' && msg.message) {
          errorBox.hidden = false;
          errorText.textContent = msg.message;
        }
        break;
    }
  });
})();
