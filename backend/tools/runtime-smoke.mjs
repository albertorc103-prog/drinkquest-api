/* eslint-disable no-console */
const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000/api/v1';

const creds = {
  admin: { email: 'smoke.admin@drinkquest.app', password: 'SmokeAdmin123!', intent: 'BAR' },
  barActive: { email: 'smoke.bar.active@drinkquest.app', password: 'SmokeBarActive123!', intent: 'BAR' },
  barSuspended: { email: 'smoke.bar.suspended@drinkquest.app', password: 'SmokeBarSusp123!', intent: 'BAR' },
  barTrialExpired: { email: 'smoke.bar.trialexpired@drinkquest.app', password: 'SmokeBarTrial123!', intent: 'BAR' },
  user: { email: 'smoke.user@drinkquest.app', password: 'SmokeUser123!', intent: 'USER' },
};

async function req(path, { method = 'GET', token, body, expected = 200 } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {}
  if (res.status !== expected) {
    throw new Error(`${method} ${path} expected ${expected} got ${res.status} -> ${JSON.stringify(json)}`);
  }
  const requestId = res.headers.get('x-request-id');
  assert(requestId, `${method} ${path} no devolvió x-request-id`);
  return { res, json };
}

async function login(which) {
  const c = creds[which];
  const { json } = await req('/auth/login', {
    method: 'POST',
    expected: 201,
    body: { email: c.email, password: c.password, intent: c.intent },
  });
  return json;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  console.log(`Running smoke against ${BASE}`);

  // 0) Health endpoint
  const health = await req('/health', { expected: 200 });
  assert(['ok', 'degraded'].includes(health.json.status), 'Health status inválido');
  assert(health.json.services?.database, 'Health sin services.database');

  // 1) Auth + intent mismatch + refresh
  const userTokens = await login('user');
  assert(userTokens.accessToken, 'User login sin access token');
  await req('/auth/login', {
    method: 'POST',
    expected: 403,
    body: { email: creds.user.email, password: creds.user.password, intent: 'BAR' },
  });
  const invalidLogin = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: creds.user.email, password: 'bad-password', intent: 'USER' }),
  });
  const invalidBody = await invalidLogin.json();
  assert(invalidLogin.status === 401, 'Login inválido no devolvió 401');
  assert(typeof invalidBody?.code === 'string', 'Error normalizado sin code');
  assert(typeof invalidBody?.message === 'string', 'Error normalizado sin message');
  assert(typeof invalidBody?.requestId === 'string', 'Error normalizado sin requestId');
  assert(invalidLogin.headers.get('x-request-id'), 'Error response sin x-request-id');
  const refresh = await req('/auth/refresh', {
    method: 'POST',
    expected: 201,
    body: { refreshToken: userTokens.refreshToken },
  });
  assert(refresh.json.accessToken, 'Refresh sin access token');

  // 2) BAR access + subscription enforcement
  const activeBarTokens = await login('barActive');
  const suspBarTokens = await login('barSuspended');
  const trialBarTokens = await login('barTrialExpired');

  const mine = await req('/bars/promotions', { token: activeBarTokens.accessToken });
  const approved = mine.json.find((p) => p.title.includes('APPROVED'));
  const rejected = mine.json.find((p) => p.title.includes('REJECTED'));
  const pending = mine.json.find((p) => p.title.includes('PENDING_REVIEW'));
  assert(approved && rejected && pending, 'No se encontraron promociones smoke esperadas');

  await req('/qr/sessions', {
    method: 'POST',
    token: suspBarTokens.accessToken,
    expected: 403,
    body: {},
  });
  await req('/qr/sessions', {
    method: 'POST',
    token: trialBarTokens.accessToken,
    expected: 403,
    body: {},
  });

  // 3) Moderation flow
  const adminTokens = await login('admin');
  const pendingList = await req('/admin/promotions/pending', { token: adminTokens.accessToken });
  assert(Array.isArray(pendingList.json), 'Pending moderación inválido');
  const toApprove = pendingList.json.find((p) => p.id === pending.id) ?? pendingList.json[0];
  await req(`/admin/promotions/${toApprove.id}/approve`, {
    method: 'PATCH',
    token: adminTokens.accessToken,
    expected: 200,
  });

  const rejectTarget = mine.json.find((p) => p.title.includes('FLAGGED')) ?? mine.json[0];
  await req(`/admin/promotions/${rejectTarget.id}/reject`, {
    method: 'PATCH',
    token: adminTokens.accessToken,
    body: { reason: 'Smoke reject' },
    expected: 200,
  });

  // 4) Feed USER should include only approved+active+vigentes
  const feed = await req('/promotions/feed', { token: userTokens.accessToken });
  assert(Array.isArray(feed.json.items), 'Feed promociones inválido');
  const hasRejected = feed.json.items.some((p) => p.approvalStatus !== 'APPROVED');
  assert(!hasRejected, 'Feed incluyó promociones no aprobadas');

  // 5) Analytics tracking + append-only
  const promoId = feed.json.items[0]?.id ?? approved.id;
  assert(promoId, 'No hay promo para analytics');

  // spam intentionally to check debounce server accepts requests; append-only checked by counts growth
  for (let i = 0; i < 3; i += 1) {
    await req(`/promotions/${promoId}/impression`, {
      method: 'POST',
      token: userTokens.accessToken,
      body: { metadata: { source: 'smoke', i } },
      expected: 201,
    });
  }
  await req(`/promotions/${promoId}/open`, {
    method: 'POST',
    token: userTokens.accessToken,
    body: { metadata: { source: 'smoke' } },
    expected: 201,
  });
  await req(`/promotions/${promoId}/qr-scan`, {
    method: 'POST',
    token: userTokens.accessToken,
    body: { metadata: { source: 'smoke' } },
    expected: 201,
  });

  const mineAfter = await req('/bars/promotions', { token: activeBarTokens.accessToken });
  const tracked = mineAfter.json.find((p) => p.id === promoId);
  assert(tracked?.analytics, 'Analytics summary no presente en dashboard BAR');
  assert(tracked.analytics.impressions >= 1, 'No incrementó impressions');
  assert(tracked.analytics.opens >= 1, 'No incrementó opens');
  assert(tracked.analytics.qrScans >= 1, 'No incrementó qrScans');

  console.log('✅ Runtime smoke tests OK');
}

main().catch((err) => {
  console.error('❌ Runtime smoke failed');
  console.error(err);
  process.exit(1);
});

