// Offline browser-script tests: all callback values and auth responses are fixtures.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const home = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const password = fs.readFileSync(path.join(root, 'set-password.html'), 'utf8');
const scripts = html => [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(s => s.trim());
const [forward, onboarding] = scripts(home);
const [capturePasswordCallback, passwordScript] = scripts(password);
function browser(suffix, auth = {}) {
  let url = new URL('https://keconnectapp.com/' + suffix);
  const events = [], elements = new Map();
  const location = {
    get href() { return url.href; }, set href(value) { events.push(['navigate', value]); url = new URL(value, url); },
    get search() { return url.search; }, get hash() { return url.hash; }, get pathname() { return url.pathname; },
    replace(value) { events.push(['replace', value]); url = new URL(value, url); }
  };
  const document = { title: 'Fixture', getElementById(id) {
    if (!elements.has(id)) elements.set(id, { hidden: true, value: '', textContent: '', disabled: false,
      classList: { add() {} }, addEventListener(type, fn) { this[type] = fn; }, reset() {} });
    return elements.get(id);
  } };
  const context = vm.createContext({ URL, URLSearchParams, location, document, Date,
    history: { replaceState(state, title, value) { events.push(['clear', value]); url = new URL(value, url); } },
    supabase: { createClient(...args) { events.push(['client']); return { auth }; } }
  });
  context.window = context;
  return { context, events, elements, run: script => vm.runInContext(script, context) };
}
for (const suffix of [
  '#type=recovery&access_token=fixture-access&refresh_token=fixture-refresh',
  '?type=recovery&code=fixture-code',
  '?type=recovery#access_token=fixture-access&refresh_token=fixture-refresh',
  '#error=access_denied&error_code=otp_expired&error_description=Fixture',
  '?error=access_denied&error_description=Fixture',
  '#error_code=otp_expired', '#type=recovery&access_token=fixture-incomplete',
  '?type=recovery&redirect_to=https%3A%2F%2Fevil.invalid#fixture',
]) {
  test('recovery/error callback uses fixed password destination: ' + suffix.split(/[=&]/)[0], async () => {
    const b = browser(suffix);
    b.run(forward);
    await b.run(onboarding);
    assert.deepEqual(b.events, [['clear', '/'], ['replace', '/set-password' + suffix]]);
  });
}
for (const suffix of ['', '#about', '#drivers', '?utm_source=fixture', '?redirect_to=https://evil.invalid']) {
  test('marketing navigation stays in place: ' + suffix, async () => {
    const b = browser(suffix);
    b.run(forward); await b.run(onboarding);
    assert.deepEqual(b.events, []);
  });
}
for (const suffix of ['?driver_verify=1&code=fixture-code', '?code=fixture-code', '#type=signup&access_token=fixture-access&refresh_token=fixture-refresh']) {
  test('existing onboarding callback remains intact: ' + suffix.split('&')[0], async () => {
    let exchanges = 0;
    const b = browser(suffix, {
      exchangeCodeForSession: async () => { exchanges++; return { error: null }; },
      setSession: async () => { exchanges++; return { error: null }; },
      getSession: async () => ({ data: { session: { user: { id: 'fixture-user' } } } })
    });
    b.run(forward); await b.run(onboarding);
    assert.equal(exchanges, 1);
    assert.equal(b.events.at(-1)[1], '/driver-onboarding.html');
  });
}
for (const mode of ['implicit', 'pkce', 'expired', 'query-error', 'error-code-only', 'empty-error', 'duplicate-error', 'code-error', 'incomplete', 'missing', 'session-expired-on-save']) {
  test('existing password page safely consumes forwarded callback: ' + mode, async () => {
    let updates = 0, exchanges = 0;
    const suffix = ({ implicit: '#type=recovery&access_token=fixture-access&refresh_token=fixture-refresh',
      pkce: '?type=recovery&code=fixture-code', expired: '#error=access_denied&error_code=otp_expired',
      'query-error': '?error=access_denied', 'error-code-only': '#error_code=otp_expired', 'empty-error': '?error=', 'duplicate-error': '?error=&error=access_denied', 'code-error': '?type=recovery&code=fixture-used',
      incomplete: '#type=recovery&access_token=fixture-incomplete', missing: '#type=recovery',
      'session-expired-on-save': '#type=recovery&access_token=fixture-access&refresh_token=fixture-refresh' })[mode];
    const b = browser(suffix, {
      setSession: async () => { exchanges++; return { error: null }; },
      exchangeCodeForSession: async () => { exchanges++; return { error: mode === 'code-error' ? new Error('Fixture invalid code') : null }; },
      getUser: async () => ({ data: { user: mode === 'missing' ? null : { email: 'fixture@example.invalid' } }, error: null }),
      updateUser: async () => { updates++; return { error: mode === 'session-expired-on-save' ? new Error('Fixture expired session') : null }; },
      resetPasswordForEmail: async () => { throw new Error('Email must never be sent in this test'); }
    });
    b.run(forward); await b.run(onboarding); b.run(capturePasswordCallback); await b.run(passwordScript);
    assert.equal(b.context.location.href, 'https://keconnectapp.com/set-password');
    assert.equal(b.context.kePasswordCallback, undefined);
    const valid = ['implicit', 'pkce', 'session-expired-on-save'].includes(mode);
    assert.equal(b.elements.get('password-form').hidden, !valid);
    b.context.document.getElementById('password').value = 'fixture-only-password';
    b.context.document.getElementById('confirm-password').value = 'fixture-only-password';
    await b.elements.get('password-form').submit({ preventDefault() {} });
    assert.equal(updates, valid ? 1 : 0);
    if (valid) assert.equal(exchanges, 1);
    if (mode === 'session-expired-on-save') assert.equal(b.context.document.getElementById('success').hidden, true);
    if (!valid) assert.equal(b.elements.get('link-help').hidden, false);
  });
}
test('routing executes before external resources with no referrer', () => {
  assert.ok(home.indexOf('<meta name="referrer" content="no-referrer">') < home.indexOf('<script>'));
  assert.ok(home.indexOf('</script>') < home.indexOf('<link'));
});
