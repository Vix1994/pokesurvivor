/* Run with node --test tools/test_i18n.js. No browser or dependencies required. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const load = (ctx, file) => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx, { filename: file });

function game({ saved = null, nav = 'zh-CN', pathname = '/', blocked = false } = {}) {
  const calls = { alerts: [], canvas: [], writes: [], reloads: 0, flushes: 0 };
  function Canvas() {}
  for (const method of ['fillText', 'strokeText', 'measureText']) {
    Canvas.prototype[method] = function (text, ...args) { calls.canvas.push([method, text, ...args]); return { width: text.length }; };
  }
  const context = vm.createContext({
    G: {}, navigator: { language: nav, languages: [nav] },
    location: { pathname, reload: () => calls.reloads++ },
    localStorage: {
      getItem: () => { if (blocked) throw Error('blocked'); return saved; },
      setItem: (k, v) => { if (blocked) throw Error('blocked'); calls.writes.push([k, v]); }
    },
    document: { documentElement: {} }, CanvasRenderingContext2D: Canvas,
    alert: s => calls.alerts.push(s), confirm: s => { calls.alerts.push(s); return true; },
    setTimeout: () => 0
  });
  context.window = context;
  for (const file of ['js/core/language.js', 'js/core/i18n.js', 'js/data/lang-en.js', 'js/data/lang-zh-CN.js', 'js/data/pokemon-names-zh-CN.js']) load(context, file);
  return { context, calls, i18n: context.G.I18n, Canvas };
}

test('language choice: saved preference, English URL, browser, safe storage fallback', () => {
  for (const [opts, expected] of [
    [{}, 'zh-CN'], [{ nav: 'zh-TW' }, 'zh-CN'], [{ nav: 'es-MX' }, 'es'],
    [{ nav: 'fr-FR' }, 'en'], [{ saved: 'en' }, 'en'], [{ saved: 'es' }, 'es'],
    [{ saved: 'zh-CN', pathname: '/en/' }, 'zh-CN'], [{ pathname: '/en/' }, 'en'],
    [{ saved: 'unsupported' }, 'zh-CN'], [{ blocked: true }, 'zh-CN']
  ]) {
    const { i18n, context } = game(opts);
    assert.equal(i18n.lang, expected);
    assert.equal(context.document.documentElement.lang, expected);
  }
});

test('dictionaries stay isolated; Spanish and English behavior is preserved', () => {
  assert.equal(game({ nav: 'es' }).i18n.t('Jugar como invitado'), 'Jugar como invitado');
  assert.equal(game({ nav: 'en' }).i18n.t('Jugar como invitado'), 'Play as guest');
  assert.equal(game().i18n.t('Jugar como invitado'), '以游客身份游玩');
  assert.equal(game({ nav: 'en' }).i18n.t('Pikachu'), 'Pikachu');
});

test('Chinese handles nested placeholders, fragments, case and whitespace', () => {
  const { i18n } = game();
  assert.equal(i18n.t('¡Has conseguido a Pikachu shiny!'), '获得了异色 皮卡丘！');
  assert.equal(i18n.t('Pregunta 3 de 8'), '第 3 题，共 8 题');
  assert.equal(i18n.t('  NIVEL 12\n'), '  等级 12\n');
  assert.equal(i18n.t('Fuego · Kanto'), '火 · 关都');
  assert.equal(i18n.t('Nv. 12'), '等级 12');
  assert.equal(i18n.t('Impulsivo'), '冲动');
  assert.equal(i18n.t('火 · 关都'), '火 · 关都');
  assert.equal(i18n.t(0), 0);
  assert.equal(i18n.t('123'), '123');
});

test('all English source keys and placeholder counts have Chinese counterparts', () => {
  const dictionaries = {};
  const ctx = vm.createContext({ G: { I18n: { add: (dict, lang = 'en') => Object.assign(dictionaries[lang] ||= {}, dict) } } });
  load(ctx, 'js/data/lang-en.js'); load(ctx, 'js/data/lang-zh-CN.js');
  for (const [source] of Object.entries(dictionaries.en)) {
    assert.ok(dictionaries['zh-CN'][source], `Missing Chinese: ${source}`);
  }
  for (const [source, target] of Object.entries(dictionaries['zh-CN'])) {
    assert.equal((source.match(/\{x\}/g) || []).length, (target.match(/\{x\}/g) || []).length, source);
  }
});

test('every playable species and every release note has a Chinese translation', () => {
  const { context, i18n } = game();
  load(context, 'js/data/pokedex.js'); load(context, 'js/data/changelog.js');
  load(context, 'js/data/starters.js');
  for (const p of context.G.DEX) assert.match(i18n.t(p.name), /\p{Script=Han}/u, p.name);
  for (const trait of Object.keys(context.G.TRAIT_TEXT)) {
    assert.match(i18n.t(trait), /\p{Script=Han}/u, trait);
    assert.match(i18n.t(trait[0].toUpperCase() + trait.slice(1)), /\p{Script=Han}/u, trait);
  }
  for (const v of context.G.CHANGELOG) {
    for (const pair of [v.title, ...['new', 'chg', 'fix'].flatMap(k => v[k] || [])]) {
      assert.match(i18n.t(pair[0]), /\p{Script=Han}/u, pair[0]);
    }
  }
});

test('canvas drawing, canvas measurement, alert and confirm translate consistently', () => {
  const { Canvas, calls, context } = game();
  const ctx = new Canvas();
  ctx.fillText('Pikachu', 1, 2); ctx.strokeText('Nivel 5', 3, 4); ctx.measureText('Pikachu');
  assert.deepEqual(calls.canvas, [['fillText', '皮卡丘', 1, 2], ['strokeText', '等级 5', 3, 4], ['measureText', '皮卡丘']]);
  context.alert('Continuar'); context.confirm('Volver');
  assert.deepEqual(calls.alerts, ['继续', '返回']);
});

test('switching persists only the locale and waits for cloud flush before reload', async () => {
  const { context, calls, i18n } = game();
  context.G.Game = { state: 'ui' };
  context.G.DB = { flush: async () => { assert.equal(calls.reloads, 0); calls.flushes++; } };
  assert.equal(await i18n.set('en'), true);
  assert.deepEqual(calls.writes, [['ps.lang', 'en']]);
  assert.equal(calls.flushes, 1); assert.equal(calls.reloads, 1);
});

test('unsupported/current locale, active runs and blocked storage never reload', async () => {
  for (const state of ['playing', 'paused', 'levelup', 'choice', 'over', 'held']) {
    const { context, i18n, calls } = game();
    context.G.Game = { state };
    assert.equal(await i18n.set('en'), false);
    assert.equal(calls.reloads, 0); assert.equal(calls.writes.length, 0);
    assert.match(calls.alerts[0], /结束当前对局/);
  }
  const { i18n, calls } = game({ blocked: true });
  for (const lang of ['unsupported', 'zh-CN', 'en']) assert.equal(await i18n.set(lang), false);
  assert.equal(calls.reloads, 0);
  assert.equal(calls.alerts.length, 1);
});
