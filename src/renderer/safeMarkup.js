(function exposeSafeMarkup(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.PortManagerSafeMarkup = api;
  }
})(typeof window === 'undefined' ? globalThis : window, () => {
  const HTML_ESCAPES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => HTML_ESCAPES[character]);
  }

  function getProcessActionLabel(process) {
    return process?.applicationName || process?.processName || 'Unknown process';
  }

  return { escapeHtml, getProcessActionLabel };
});
