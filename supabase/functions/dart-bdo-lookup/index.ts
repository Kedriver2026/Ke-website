// KatE -> D.A.R.T. read-only customer-service lookup
// Secrets stay in Supabase Edge Function secrets. Never expose D.A.R.T. credentials to the website.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const BASE_URL = Deno.env.get('DART_BASE_URL') || 'https://www.rbags.com/BDOSystem';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function decodeHtml(value = '') {
  return value
    .replace(/&#160;/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function stripTags(value = '') {
  return decodeHtml(value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' '));
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function inputValue(html: string, suffix: string) {
  const id = `formContainer_${suffix}`;
  const re = new RegExp(`<input[^>]+id=["'][^"']*${escapeRegex(id)}["'][^>]*value=["']([^"']*)["'][^>]*>`, 'i');
  const reverse = new RegExp(`<input[^>]+value=["']([^"']*)["'][^>]+id=["'][^"']*${escapeRegex(id)}["'][^>]*>`, 'i');
  const m = html.match(re) || html.match(reverse);
  return m ? decodeHtml(m[1]) : '';
}

function checkboxChecked(html: string, suffix: string) {
  const id = `formContainer_${suffix}`;
  const re = new RegExp(`<input[^>]+id=["'][^"']*${escapeRegex(id)}["'][^>]*>`, 'i');
  const m = html.match(re);
  return !!m && /\bchecked\b/i.test(m[0]);
}

// Parses one BDO detail page (BDOTabMain.aspx). The field suffixes below are taken
// from the real D.A.R.T. page structure captured during K&E integration work.
function parseDetail(html: string) {
  const address = [inputValue(html, 'Address1_line1'), inputValue(html, 'Address1_line2')].filter(Boolean).join(' ');
  const record = {
    orderNumber: inputValue(html, 'OrderNumber'),
    airportCode: inputValue(html, 'AirportCode'),
    airlineCode: inputValue(html, 'AirlineCode') || inputValue(html, 'OriginalAirlineCode'),
    claimReference: inputValue(html, 'ItineraryNumber'),
    firstName: inputValue(html, 'FirstName') || inputValue(html, 'PassengerFirstName'),
    lastName: inputValue(html, 'LastName') || inputValue(html, 'PassengerLastName'),
    phone: inputValue(html, 'Phone1') || inputValue(html, 'Phone'),
    email: inputValue(html, 'Email1') || inputValue(html, 'Email'),
    address,
    city: inputValue(html, 'City1'),
    state: inputValue(html, 'State1'),
    zip: inputValue(html, 'ZipCode1'),
    sweepDate: inputValue(html, 'PickUpDate'),
    sweepTime: inputValue(html, 'PickUpTime'),
    zone: inputValue(html, 'Vendor_ZoneName') || inputValue(html, 'Airline_ZoneName'),
    serviceLevel: inputValue(html, 'ServiceLevelName') || inputValue(html, 'ServiceLevel'),
    driver: inputValue(html, 'DriverName'),
    assignedDate: inputValue(html, 'LuggageAssignedToDriver'),
    assignedTime: inputValue(html, 'LuggageAssignedToDriverTime'),
    deliveredDate: inputValue(html, 'DeliveryDate'),
    deliveredTime: inputValue(html, 'DeliveryTime'),
    signedBy: inputValue(html, 'SignedBy'),
    deliveryRemarks: inputValue(html, 'DeliveryRemarks') || inputValue(html, 'Remarks'),
    signatureWaived: checkboxChecked(html, 'SignatureWaived'),
    okToDeliver: checkboxChecked(html, 'OKtoDeliver'),
  };
  return record;
}

// Parses rows from BDOSearch.aspx. This is useful both for finding a BDO and for
// deriving the current status/driver/timestamps shown in the D.A.R.T. list.
function parseSearchRows(html: string) {
  const rows: any[] = [];
  const rowRe = /<tr class=["']dg_row(?:_even)?["'][^>]*>([\s\S]*?)<\/tr>/gi;
  let match;
  while ((match = rowRe.exec(html))) {
    const rowHtml = match[1];
    const orderMatch = rowHtml.match(/<a[^>]*>([^<]+)<\/a>/i);
    if (!orderMatch) continue;
    const cells = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(x => stripTags(x[1]));
    if (cells.length < 18) continue;
    rows.push({
      orderNumber: stripTags(orderMatch[1]),
      lastName: cells[1] || '',
      createdDate: cells[2] || '',
      claimReference: cells[3] || '',
      tagId: cells[4] || '',
      city: cells[5] || '',
      zip: cells[6] || '',
      addressChanged: cells[7] || '',
      pickupDate: cells[8] || '',
      pickupTime: cells[9] || '',
      zone: cells[10] || '',
      serviceLevel: cells[11] || '',
      notes: cells[12] || '',
      status: cells[13] || '',
      driver: cells[14] || '',
      date: cells[15] || '',
      time: cells[16] || '',
      signedBy: cells[17] || '',
    });
  }
  return rows;
}

function cookieHeader(setCookies: string[]) {
  return setCookies.map(c => c.split(';', 1)[0]).join('; ');
}

function hiddenFields(html: string) {
  const out: Record<string,string> = {};
  for (const m of html.matchAll(/<input[^>]+type=["']hidden["'][^>]*>/gi)) {
    const tag = m[0];
    const name = tag.match(/name=["']([^"']+)["']/i)?.[1];
    const value = tag.match(/value=["']([^"']*)["']/i)?.[1] || '';
    if (name) out[name] = decodeHtml(value);
  }
  return out;
}

async function loginToDart() {
  const username = Deno.env.get('DART_USERNAME');
  const password = Deno.env.get('DART_PASSWORD');
  if (!username || !password) throw new Error('DART credentials are not configured in Supabase secrets.');

  const loginUrl = Deno.env.get('DART_LOGIN_URL') || `${BASE_URL}/login.aspx`;
  const userField = Deno.env.get('DART_LOGIN_USER_FIELD');
  const passwordField = Deno.env.get('DART_LOGIN_PASSWORD_FIELD');
  const submitField = Deno.env.get('DART_LOGIN_SUBMIT_FIELD');

  if (!userField || !passwordField) {
    throw new Error('DART login field names are not configured.');
  }

  const first = await fetch(loginUrl, { redirect: 'manual' });
  const loginHtml = await first.text();
  const cookies = first.headers.getSetCookie?.() || [];
  const form = new URLSearchParams(hiddenFields(loginHtml));
  form.set(userField, username);
  form.set(passwordField, password);
  if (submitField) form.set(submitField, Deno.env.get('DART_LOGIN_SUBMIT_VALUE') || 'Login');

  const posted = await fetch(loginUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(cookies.length ? { Cookie: cookieHeader(cookies) } : {}),
    },
    body: form.toString(),
    redirect: 'manual',
  });

  const postCookies = posted.headers.getSetCookie?.() || [];
  const jar = cookieHeader([...cookies, ...postCookies]);
  if (!jar) throw new Error('DART did not return an authenticated session cookie.');
  return jar;
}

async function fetchText(url: string, cookie: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { ...(init.headers || {}), Cookie: cookie },
    redirect: 'follow',
  });
  if (!response.ok) throw new Error(`DART returned HTTP ${response.status}`);
  return response.text();
}

// Search POST specifics are configurable because D.A.R.T. is a legacy ASP.NET
// WebForms app. Keeping them in Supabase secrets avoids hard-coding account/session data.
async function findBdo(orderNumber: string, cookie: string) {
  const searchUrl = Deno.env.get('DART_SEARCH_URL') || `${BASE_URL}/BDO/BDOSearch.aspx`;
  const initialHtml = await fetchText(searchUrl, cookie);

  // If it is already present on the loaded page, no POST is needed.
  let rows = parseSearchRows(initialHtml);
  let found = rows.find(r => r.orderNumber.toUpperCase() === orderNumber.toUpperCase());
  if (found) return { found, html: initialHtml };

  const orderField = Deno.env.get('DART_SEARCH_ORDER_FIELD');
  const searchEventTarget = Deno.env.get('DART_SEARCH_EVENT_TARGET');
  if (!orderField || !searchEventTarget) throw new Error('DART search field configuration is incomplete.');

  const form = new URLSearchParams(hiddenFields(initialHtml));
  form.set(orderField, orderNumber);
  form.set('__EVENTTARGET', searchEventTarget);
  form.set('__EVENTARGUMENT', '');

  const resultHtml = await fetchText(searchUrl, cookie, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  rows = parseSearchRows(resultHtml);
  found = rows.find(r => r.orderNumber.toUpperCase() === orderNumber.toUpperCase());
  return { found, html: resultHtml };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const { orderNumber, lastName } = await req.json();
    const bdo = String(orderNumber || '').trim().toUpperCase();
    const verifyLastName = String(lastName || '').trim().toUpperCase();
    if (!bdo || !verifyLastName) return json({ error: 'missing_verification', message: 'BDO/order number and last name are required.' }, 400);

    const cookie = await loginToDart();
    const { found } = await findBdo(bdo, cookie);
    if (!found) return json({ error: 'not_found', message: 'No matching delivery was found.' }, 404);
    if ((found.lastName || '').trim().toUpperCase() !== verifyLastName) {
      return json({ error: 'verification_failed', message: 'The verification details did not match.' }, 403);
    }

    // The search page already carries the customer-safe operational fields KatE needs.
    // A detail-page fetch can be added after the read-only search endpoint is live-tested.
    return json({
      orderNumber: found.orderNumber,
      status: found.status,
      lastUpdate: [found.date, found.time].filter(Boolean).join(' '),
      deliveredAt: /deliver/i.test(found.status || '') ? [found.date, found.time].filter(Boolean).join(' ') : '',
      driver: found.driver,
      pickupDate: found.pickupDate,
      pickupTime: found.pickupTime,
      zone: found.zone,
      serviceLevel: found.serviceLevel,
      city: found.city,
      signedBy: found.signedBy,
      notes: found.notes,
    });
  } catch (error) {
    console.error('KatE DART lookup error:', error);
    return json({ error: 'dart_unavailable', message: 'Live D.A.R.T. lookup is temporarily unavailable.' }, 502);
  }
});
