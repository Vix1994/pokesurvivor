/* Verify the generated offline deployment: node --test tools/test_pages.js. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const site = new URL(JSON.parse(read('site.config.json')).url);

test('offline deployment has no upstream domain binding or Firebase backend', () => {
  assert.equal(fs.existsSync(path.join(root, 'CNAME')), false);
  assert.ok(fs.existsSync(path.join(root, '.nojekyll')));
  const context = { G: {} };
  vm.runInNewContext(read('js/core/firebase-config.js'), context);
  assert.equal(context.G.FIREBASE_CONFIG, null);
});

test('both game entries point metadata to this site and use the current bundle', () => {
  const version = JSON.parse(read('version.json')).v;
  for (const entry of ['index.html', 'en/index.html']) {
    const html = read(entry);
    const url = new URL(entry === 'index.html' ? './' : 'en/', site).href;
    assert.ok(html.includes(`<link rel="canonical" href="${url}">`), entry);
    assert.ok(html.includes(`<meta property="og:url" content="${url}">`), entry);
    assert.ok(html.includes(`js/app.min.js?v=${version}`), entry);
    assert.ok(html.includes(site.href + 'assets/og-image.jpg'), entry);
    assert.doesNotMatch(html, /https:\/\/pokesurvivor\.com\//, entry);
  }
  assert.match(read('en/index.html'), /<base href="\.\.\/">/);
});

test('static page metadata and sitemap stay under the project Pages URL', () => {
  const pages = ['guia/', 'pokedex/', 'legendarios/', 'movimientos/', 'objetos/', 'tipos/', 'shinies/', 'logros/', 'novedades/', 'apoyar/',
    'en/guide/', 'en/pokedex/', 'en/legendaries/', 'en/moves/', 'en/items/', 'en/types/', 'en/shinies/', 'en/achievements/', 'en/news/', 'en/support/'];
  for (const entry of pages) {
    assert.ok(read(entry + 'index.html').includes(`<link rel="canonical" href="${site.href}${entry}">`), entry);
  }
  const urls = [...read('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  assert.equal(urls.length, 22);
  assert.ok(urls.every(url => url.startsWith(site.href)));
  assert.ok(read('robots.txt').includes(`Sitemap: ${site.href}sitemap.xml`));
});

test('404 navigation, assets and PWA entry work under the project subdirectory', () => {
  for (const [, href] of read('404.html').matchAll(/href="([^"]+)"/g)) {
    assert.ok(href.startsWith(site.pathname), href);
    const relative = href.slice(site.pathname.length);
    assert.ok(fs.existsSync(path.join(root, relative || '.')), href);
  }
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.equal(new URL(manifest.start_url, site).pathname, site.pathname);
  assert.equal(new URL(manifest.scope, site).pathname, site.pathname);
  for (const icon of manifest.icons) assert.ok(fs.existsSync(path.join(root, icon.src)), icon.src);
});
