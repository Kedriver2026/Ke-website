// Requires Playwright and Chromium. Every request is intercepted; no live auth.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  let passed = 0;
  try {
    for (const scenario of [
      { name: 'implicit', suffix: '#type=recovery&access_token=fixture-access&refresh_token=fixture-refresh', ready: true, exchange: 'implicit' },
      { name: 'typed PKCE', suffix: '?type=recovery&code=fixture-code', ready: true, exchange: 'pkce' },
      { name: 'expired fragment', suffix: '#error=access_denied&error_description=Fixture', ready: false },
      { name: 'expired query', suffix: '?error=access_denied', ready: false },
      { name: 'error code with cached session', suffix: '#error_code=otp_expired', ready: false },
      { name: 'empty error with cached session', suffix: '?error=', ready: false },
      { name: 'duplicate empty error', suffix: '?error=&error=access_denied', ready: false },
      { name: 'incomplete', suffix: '#type=recovery&access_token=fixture-incomplete', ready: false },
      { name: 'no session', suffix: '#type=recovery', ready: false, noUser: true },
      { name: 'used PKCE', suffix: '?type=recovery&code=fixture-used', ready: false, exchange: 'pkce', badCode: true },
      { name: 'untrusted destination', suffix: '?type=recovery&next=https://evil.invalid&redirect_to=https://evil.invalid#access_token=fixture-access&refresh_token=fixture-refresh', ready: true, exchange: 'implicit' },
      { name: 'marketing anchor', suffix: '#about', marketing: true },
      { name: 'application callback', suffix: '?driver_verify=1&code=fixture-code', onboarding: true, exchange: 'pkce' }
    ]) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const calls = [], navigations = [];
      await page.exposeFunction('recordFixtureCall', name => calls.push(name));
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.hostname === 'cdn.jsdelivr.net') {
          if (new URL(page.url()).pathname === '/set-password') {
            // Inspect while the external SDK request is held: cleanup must precede it.
            assert.equal(await page.evaluate(() => location.search + location.hash), '');
          }
          return route.fulfill({ contentType: 'application/javascript', body: `window.supabase = { createClient() { return { auth: {
            async setSession() { await recordFixtureCall('implicit'); return { error: null }; },
            async exchangeCodeForSession() { await recordFixtureCall('pkce'); return { error: ${scenario.badCode ? "{message:'Fixture used code'}" : 'null'} }; },
            async getUser() { return { data: { user: ${scenario.noUser ? 'null' : "{email:'fixture@example.invalid'}"} }, error: null }; },
            async getSession() { return { data: { session: { user: {id:'fixture-user'} } } }; },
            async updateUser() { await recordFixtureCall('update'); return { error: null }; },
            async resetPasswordForEmail() { await recordFixtureCall('EMAIL_UNEXPECTED'); throw new Error('Blocked'); }
          } }; } };` });
        }
        if (url.origin !== 'http://recovery.test') throw new Error('Unexpected outbound request: ' + url.origin);
        if (route.request().isNavigationRequest()) navigations.push(url.pathname);
        const filename = url.pathname === '/' ? 'index.html' : url.pathname === '/set-password' ? 'set-password.html' : null;
        if (filename) return route.fulfill({ contentType: 'text/html', body: fs.readFileSync(path.join(root, filename), 'utf8') });
        return route.fulfill({ contentType: 'text/plain', body: '' });
      });
      await page.goto('http://recovery.test/' + scenario.suffix);
      if (scenario.marketing) {
        await assert.equal(await page.locator('h1').last().innerText(), 'More than an app.\nA connection to the K&E Family.');
        assert.equal(page.url(), 'http://recovery.test/#about');
      } else if (scenario.onboarding) {
        await page.waitForURL('http://recovery.test/driver-onboarding.html');
      } else {
        await page.waitForURL('http://recovery.test/set-password');
        await page.waitForFunction(() => document.getElementById('message').textContent !== 'Checking your secure activation link…');
        assert.equal(await page.locator('#password-form').isVisible(), scenario.ready);
        assert.equal(await page.locator('#link-help').isVisible(), !scenario.ready);
        assert.equal(page.url(), 'http://recovery.test/set-password');
        if (scenario.ready) {
          await page.locator('#password').fill('fixture-only-password');
          await page.locator('#confirm-password').fill('fixture-only-password');
          await page.locator('#save').click();
          await page.locator('#success').waitFor({ state: 'visible' });
        }
      }
      assert.deepEqual(calls, [...(scenario.exchange ? [scenario.exchange] : []), ...(scenario.ready ? ['update'] : [])]);
      assert.ok(navigations.every(p => ['/', '/set-password', '/driver-onboarding.html'].includes(p)));
      console.log('PASS browser:', scenario.name);
      passed++;
      await context.close();
    }
  } finally { await browser.close(); }
  console.log(`${passed} isolated browser scenarios passed; all requests intercepted.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
