/* Shared by the loading screen and i18n. No network or account is required. */
window.PSLanguage = (() => {
  const locales = Object.freeze([
    { code: 'es', name: 'Español', locale: 'es-ES' },
    { code: 'en', name: 'English', locale: 'en-GB' },
    { code: 'zh-CN', name: '简体中文', locale: 'zh-CN' }
  ].map(Object.freeze));
  const valid = code => locales.some(l => l.code === code);
  function detect() {
    let saved;
    try { saved = localStorage.getItem('ps.lang'); } catch (e) { /* private browsing */ }
    if (valid(saved)) return saved;
    if (/\/en(\/|$)/.test(location.pathname)) return 'en';
    const nav = ((navigator.languages && navigator.languages[0]) || navigator.language || 'es').toLowerCase();
    return nav.startsWith('zh') ? 'zh-CN' : nav.startsWith('es') ? 'es' : 'en';
  }
  const lang = detect();
  document.documentElement.lang = lang;
  return Object.freeze({ locales, valid, lang });
})();
