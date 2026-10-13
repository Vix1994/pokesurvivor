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

test('player names remain literal in translated templates and JSON announcements', () => {
  for (const nav of ['zh-CN', 'en', 'es']) {
    const { i18n } = game({ nav });
    for (const name of ['Pikachu', 'Pikachu_12', 'Fuego', 'Normal']) {
      const protectedName = i18n.raw(name);
      const source = protectedName + ' ha dejado la partida';
      // Match the co-op announcement's transport: do not translate on the sender.
      const received = JSON.parse(JSON.stringify(['say', source, 2.6]))[1];
      const output = i18n.t(received);
      assert.equal(output, nav === 'zh-CN' ? name + ' 离开了游戏'
        : nav === 'en' ? name + ' left the game' : name + ' ha dejado la partida');
      assert.equal(i18n.t(protectedName), name);
      assert.doesNotMatch(output, /[\uE000-\uE003]/);
      assert.ok(i18n.t('¡' + protectedName + ' necesita ayuda! · 25 m').includes(name));
      assert.ok(i18n.t('Pausa: esperando a ' + protectedName + ' (anfitrión)…').includes(name));
      assert.ok(i18n.t('¿Quitar a ' + protectedName + ' de tus amigos?').includes(name));
      assert.ok(i18n.t(i18n.f('Tu apodo es {x}', protectedName)).includes(name));
    }
  }
  assert.equal(game().i18n.t('¡Has conseguido a Pikachu shiny!'), '获得了异色 皮卡丘！');
});

test('raw announcements are localized by the receiving player, not the host', () => {
  const sender = game({ nav: 'es' }).i18n;
  const message = JSON.parse(JSON.stringify({ text: sender.raw('Pikachu') + ' ha dejado la partida' }));
  assert.equal(game({ nav: 'en' }).i18n.t(message.text), 'Pikachu left the game');
  assert.equal(game({ nav: 'zh-CN' }).i18n.t(message.text), 'Pikachu 离开了游戏');
});

test('canvas and native dialogs strip raw markers in all three languages', () => {
  for (const nav of ['zh-CN', 'en', 'es']) {
    const { Canvas, i18n, calls, context } = game({ nav });
    const ctx = new Canvas();
    const name = i18n.raw('Pikachu_12');
    ctx.fillText(name, 1, 2); ctx.strokeText(name, 3, 4); ctx.measureText(name);
    context.alert(name); context.confirm(name);
    assert.deepEqual(calls.canvas, [['fillText', 'Pikachu_12', 1, 2], ['strokeText', 'Pikachu_12', 3, 4], ['measureText', 'Pikachu_12']]);
    assert.deepEqual(calls.alerts, ['Pikachu_12', 'Pikachu_12']);
  }
});

test('type, variant, joystick and move-slot labels use the correct context', () => {
  const { context, i18n } = game();
  load(context, 'js/core/util.js'); load(context, 'js/ui/ui.js');
  assert.equal(i18n.t(context.G.U.TYPE_NAME.normal), '一般');
  assert.match(i18n.t(context.G.UI.typeChips(['normal'])), />一般<\/span>/);
  assert.equal(i18n.c('variant', 'Normal'), '普通');
  assert.equal(i18n.c('joystick', 'Normal'), '标准');
  assert.equal(i18n.t('Libre'), '空位');
  assert.equal(i18n.c('move-slot', 'Libre'), '不固定');
  for (const nav of ['en', 'es']) {
    const localized = game({ nav }).i18n;
    assert.equal(localized.c('variant', 'Normal'), 'Normal');
    assert.equal(localized.c('move-slot', 'Libre'), nav === 'en' ? 'Free' : 'Libre');
  }
});

test('Bubble and chain-attack upgrades use accurate Chinese terminology', () => {
  const { i18n } = game();
  assert.equal(i18n.t('Burbuja'), '泡沫');
  assert.equal(i18n.t('+2 saltos'), '弹射次数 +2');
  assert.equal(i18n.t('+2 saltos y +40% daño'), '弹射次数 +2，伤害 +40%');
  assert.equal(i18n.t('×1,7 daño y +3 saltos'), '伤害 ×1.7，弹射次数 +3');
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
