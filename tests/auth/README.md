# Recovery routing regression checks

Run `node --test tests/auth/recovery-routing.cjs` from this checkout. Tests execute
both homepage inline scripts and the existing password-page script in a Node VM
with mocked browser and Supabase APIs. All callback values are synthetic fixtures;
no network, email, real session, password change, or database write occurs.

Coverage: implicit recovery; explicitly typed PKCE recovery; query/hash errors;
expired/reused code rejection; error-code-only rejection even with an existing
session; incomplete/missing sessions; expired session on submit; fixed local
redirect; URL clearing; marketing anchors; existing application/PKCE onboarding.
Untyped PKCE callbacks still follow the existing onboarding flow: the code alone
does not identify recovery, and changing that would disrupt application links.
Dashboard recovery is the implicit flow; existing reset requests target
`/set-password` directly. No auth-flow configuration change is proposed.

The source base is `Kedriver2026/Ke-website` branch `ke-connect-site`, commit
`033d540`. This branch has the standalone password page and homepage verification
handler that match the reported live page. `main` lacks those pages; the Expo app
has different page markup. Historical hosting evidence supplied by the parent
maps the domain to Cloudflare Pages project `ke-connect-site`, production branch
`ke-connect-site`, with automatic production deployment enabled. A read-only fetch confirmed the full base hash
`033d54032cabaa1314d033c1ac6b05d4c80b05a4` equals the remote branch tip on
2026-10-30. Current hosting configuration was not accessible in this environment;
confirm it before release.

Release gates: confirm the current Pages project/branch and preview-deployment
settings, review this diff, then obtain authorization before publishing or merging
into the auto-deployed branch. Do not deploy the Expo export or replace the
website from `main`. No Supabase settings, email template, approval flow, native
build, or store change is required by this patch. A browser smoke test of the
released callback and separately authorized end-to-end reset remain outstanding.

Browser validation: `node tests/auth/recovery-browser.cjs` uses installed Playwright
and Chromium (override `CHROMIUM_PATH` when needed). All requests are intercepted
and fulfilled locally, including a mock SDK; no auth request or email can reach
a server. It exercises actual page navigation, form visibility and submission,
error handling with a cached session, and cleanup before the SDK request completes.
These tests verify browser behavior, not a real Supabase session exchange.

Independent review identified empty error markers falling through to a cached
session and delayed URL stripping behind CDN loading. Both were fixed and covered
by regression tests, including duplicate error parameters.
