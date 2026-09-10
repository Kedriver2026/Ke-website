const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BASE_URL = "https://www.rbags.com/BDOSystem";
const SEARCH_URL = `${BASE_URL}/BDO/BDOSearch.aspx`;
const ORDER_FIELD = "ctl00$ctl00$contentPlaceHolder$findPlaceHolder$findContainer$OrderSearchControl1$OrderNumber";
const FIND_EVENT = "ctl00$ctl00$contentToolbarPlaceHolder$btnToolbarFind";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function decodeHtml(value = "") {
  return value
    .replace(/&#160;/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function stripTags(value = "") {
  return decodeHtml(value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " "));
}

function hiddenFields(html: string) {
  const out: Record<string, string> = {};
  for (const m of html.matchAll(/<input[^>]+type=["']hidden["'][^>]*>/gi)) {
    const tag = m[0];
    const name = tag.match(/name=["']([^"']+)["']/i)?.[1];
    const value = tag.match(/value=["']([^"']*)["']/i)?.[1] || "";
    if (name) out[name] = decodeHtml(value);
  }
  return out;
}

function cookiesFrom(headers: Headers) {
  const h: any = headers;
  const values: string[] = typeof h.getSetCookie === "function"
    ? h.getSetCookie()
    : (headers.get("set-cookie") ? [headers.get("set-cookie") as string] : []);
  return values.map(v => v.split(";", 1)[0]).filter(Boolean);
}

function mergeCookies(...groups: string[][]) {
  const jar = new Map<string, string>();
  for (const cookie of groups.flat()) {
    const eq = cookie.indexOf("=");
    if (eq > 0) jar.set(cookie.slice(0, eq), cookie.slice(eq + 1));
  }
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function loginFormInfo(html: string) {
  const fullForm = html.match(/<form\b[^>]*>[\s\S]*?<\/form>/i)?.[0] || html;
  const formOpen = fullForm.match(/<form\b[^>]*>/i)?.[0] || "";
  const action = decodeHtml(formOpen.match(/action=["']([^"']*)["']/i)?.[1] || "./Login.aspx?ReturnUrl=%2F");

  const inputs = [...fullForm.matchAll(/<input[^>]*>/gi)].map(m => m[0]);
  let userField = "";
  let passField = "";
  let submitField = "";
  let submitValue = "Login";

  for (const tag of inputs) {
    const name = tag.match(/name=["']([^"']+)["']/i)?.[1] || "";
    const id = tag.match(/id=["']([^"']+)["']/i)?.[1] || "";
    const type = (tag.match(/type=["']([^"']+)["']/i)?.[1] || "text").toLowerCase();
    const value = decodeHtml(tag.match(/value=["']([^"']*)["']/i)?.[1] || "");
    const key = `${name} ${id}`.toLowerCase();

    if (type === "password" && !passField) passField = name;
    if ((type === "text" || type === "email") && !userField && /(user|login|email)/.test(key)) userField = name;
    if ((type === "submit" || type === "button") && /login/i.test(`${key} ${value}`) && name) {
      submitField = name;
      submitValue = value || "Login";
    }
  }

  if (!userField) {
    const textInput = inputs.find(tag => /type=["'](?:text|email)["']/i.test(tag));
    userField = textInput?.match(/name=["']([^"']+)["']/i)?.[1] || "";
  }

  // Some legacy ASP.NET pages use a LinkButton / javascript __doPostBack instead of
  // an HTML submit input. Capture the server control target if the visible control says Login.
  let eventTarget = "";
  for (const m of fullForm.matchAll(/<(?:a|button|input)\b[^>]*>[\s\S]*?<\/(?:a|button)>|<input\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/login/i.test(stripTags(tag) + " " + tag)) continue;
    const postback = decodeHtml(tag).match(/__doPostBack\(['"]([^'"]+)['"]/i);
    if (postback) {
      eventTarget = postback[1];
      break;
    }
  }

  return { action, userField, passField, submitField, submitValue, eventTarget };
}

async function loginToDart(username: string, password: string) {
  // Use the same ReturnUrl form action observed in the browser session.
  const loginUrl = `${BASE_URL}/Login.aspx?ReturnUrl=%2F`;
  const first = await fetch(loginUrl, {
    headers: { "User-Agent": "Mozilla/5.0" },
    redirect: "manual",
  });
  const loginHtml = await first.text();
  const initialCookies = cookiesFrom(first.headers);
  const info = loginFormInfo(loginHtml);

  if (!info.userField || !info.passField) {
    throw new Error(`Could not identify D.A.R.T. login fields user=${!!info.userField} pass=${!!info.passField}`);
  }

  const form = new URLSearchParams(hiddenFields(loginHtml));
  form.set(info.userField, username);
  form.set(info.passField, password);

  if (info.submitField) form.set(info.submitField, info.submitValue);
  if (info.eventTarget) {
    form.set("__EVENTTARGET", info.eventTarget);
    form.set("__EVENTARGUMENT", "");
  }

  const postUrl = new URL(info.action || "./Login.aspx?ReturnUrl=%2F", loginUrl).toString();
  const posted = await fetch(postUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Mozilla/5.0",
      "Referer": loginUrl,
      ...(initialCookies.length ? { Cookie: mergeCookies(initialCookies) } : {}),
    },
    body: form.toString(),
    redirect: "manual",
  });

  const cookies = mergeCookies(initialCookies, cookiesFrom(posted.headers));
  const location = posted.headers.get("location") || "";
  const body = await posted.text();

  // A successful Forms Authentication login normally redirects away from Login.aspx.
  if (/login\.aspx/i.test(location) || (!location && /welcome to the d\.a\.r\.t\. system|please\s*login/i.test(body))) {
    throw new Error(`D.A.R.T. login was not accepted status=${posted.status} submit=${info.submitField || "postback:" + info.eventTarget}`);
  }
  if (!cookies) throw new Error("D.A.R.T. did not establish a session");

  // Prove the session by loading the BDO area before we attempt a customer lookup.
  const probe = await fetch(`${BASE_URL}/default.aspx?navStart=BDO`, {
    headers: { Cookie: cookies, "User-Agent": "Mozilla/5.0", "Referer": loginUrl },
    redirect: "follow",
  });
  const probeText = await probe.text();
  if (/welcome to the d\.a\.r\.t\. system|please\s*login/i.test(probeText)) {
    throw new Error("D.A.R.T. session validation returned the login page");
  }

  return cookies;
}

async function fetchWithSession(url: string, cookie: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { "User-Agent": "Mozilla/5.0", ...(init.headers || {}), Cookie: cookie },
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`D.A.R.T. returned HTTP ${response.status}`);
  const text = await response.text();
  if (/welcome to the d\.a\.r\.t\. system|please\s*login/i.test(text)) throw new Error("D.A.R.T. session expired");
  return text;
}

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
      lastName: cells[1] || "",
      createdDate: cells[2] || "",
      claimReference: cells[3] || "",
      tagId: cells[4] || "",
      city: cells[5] || "",
      zip: cells[6] || "",
      addressChanged: cells[7] || "",
      pickupDate: cells[8] || "",
      pickupTime: cells[9] || "",
      zone: cells[10] || "",
      serviceLevel: cells[11] || "",
      notes: cells[12] || "",
      status: cells[13] || "",
      driver: cells[14] || "",
      date: cells[15] || "",
      time: cells[16] || "",
      signedBy: cells[17] || "",
    });
  }
  return rows;
}

async function findBdo(orderNumber: string, cookie: string) {
  const initialHtml = await fetchWithSession(SEARCH_URL, cookie);
  const form = new URLSearchParams(hiddenFields(initialHtml));
  form.set(ORDER_FIELD, orderNumber);
  form.set("__EVENTTARGET", FIND_EVENT);
  form.set("__EVENTARGUMENT", "");

  const resultHtml = await fetchWithSession(SEARCH_URL, cookie, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Referer": SEARCH_URL },
    body: form.toString(),
  });

  return parseSearchRows(resultHtml).find(
    r => r.orderNumber.toUpperCase() === orderNumber.toUpperCase(),
  ) || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { orderNumber, lastName, requestType } = await req.json();
    const bdo = String(orderNumber || "").trim().toUpperCase();
    const verifyLastName = String(lastName || "").trim().toUpperCase();
    if (!bdo || !verifyLastName) return json({ error: "orderNumber and lastName are required" }, 400);

    const dartUsername = Deno.env.get("DART_USERNAME");
    const dartPassword = Deno.env.get("DART_PASSWORD");
    if (!dartUsername || !dartPassword) return json({ error: "D.A.R.T. credentials are not configured" }, 500);

    const cookie = await loginToDart(dartUsername, dartPassword);
    const found = await findBdo(bdo, cookie);
    if (!found) return json({ error: "not_found" }, 404);
    if ((found.lastName || "").trim().toUpperCase() !== verifyLastName) return json({ error: "verification_failed" }, 403);

    const lastUpdate = [found.date, found.time].filter(Boolean).join(" ");
    return json({
      ok: true,
      requestType: requestType || "status",
      orderNumber: found.orderNumber,
      status: found.status,
      lastUpdate,
      deliveredAt: /deliver/i.test(found.status || "") ? lastUpdate : "",
      pickupDate: found.pickupDate,
      pickupTime: found.pickupTime,
      zone: found.zone,
      serviceLevel: found.serviceLevel,
      city: found.city,
      signedBy: found.signedBy,
      notes: found.notes,
    });
  } catch (error) {
    console.error("dart-status error", error);
    return json({ error: "dart_unavailable", message: "Live D.A.R.T. lookup is temporarily unavailable." }, 502);
  }
});
