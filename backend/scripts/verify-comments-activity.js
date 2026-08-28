/**
 * Verification for comments, activity feed, and assigned-to-me endpoints.
 * Run: node scripts/verify-comments-activity.js
 */
const BASE = `http://localhost:${process.env.PORT || 5000}`;
const results = [];

const assert = (name, condition, detail = '') => {
  results.push({ name, pass: !!condition, detail });
  console.log(`${condition ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
};

const req = async (method, path, { token, body } = {}) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, json };
};

const signup = async (suffix) => {
  const email = `cmt_${suffix}_${Date.now()}@test.com`;
  const res = await req('POST', '/api/auth/signup', {
    body: { name: `User ${suffix}`, email, password: 'Password1' },
  });
  return { email, res };
};

const login = async (email) => {
  const res = await req('POST', '/api/auth/login', {
    body: { email, password: 'Password1' },
  });
  return res.json?.accessToken;
};

const main = async () => {
  console.log(`Verifying against ${BASE}\n`);

  const health = await req('GET', '/health');
  if (health.status !== 200) {
    console.error('Server not running. Start with: npm run dev');
    process.exit(1);
  }

  const owner = await signup('owner');
  const ownerToken = await login(owner.email);
  const member = await signup('member');
  const memberToken = await login(member.email);

  const memberMe = await req('GET', '/api/auth/me', { token: memberToken });
  const memberId = memberMe.json.id;

  const projectRes = await req('POST', '/api/projects', {
    token: ownerToken,
    body: { name: 'Comment Test Project' },
  });
  const projectId = projectRes.json.id;

  await req('POST', `/api/projects/${projectId}/members`, {
    token: ownerToken,
    body: { email: member.email },
  });

  const taskRes = await req('POST', `/api/projects/${projectId}/tasks`, {
    token: ownerToken,
    body: { title: 'Task for comments', assigneeId: memberId },
  });
  const taskId = taskRes.json.id;

  const commentsBase = `/api/projects/${projectId}/tasks/${taskId}/comments`;

  // Auth required
  const noAuth = await req('GET', commentsBase);
  assert('comments require auth', noAuth.status === 401, `got ${noAuth.status}`);

  const noAuthAssigned = await req('GET', '/api/tasks/assigned-to-me');
  assert('assigned-to-me requires auth', noAuthAssigned.status === 401);

  const noAuthActivity = await req('GET', `/api/projects/${projectId}/activity`);
  assert('activity requires auth', noAuthActivity.status === 401);

  // Empty comment body
  const emptyComment = await req('POST', commentsBase, {
    token: memberToken,
    body: { body: '   ' },
  });
  assert('empty comment body returns 400', emptyComment.status === 400);

  // Create comments (oldest first order test)
  const c1 = await req('POST', commentsBase, {
    token: memberToken,
    body: { body: 'First comment' },
  });
  assert('create comment returns 201', c1.status === 201);
  assert('comment includes author id/name/email', c1.json.author?.id && c1.json.author?.name && c1.json.author?.email);
  assert('comment excludes passwordHash', c1.json.author?.passwordHash === undefined);

  await new Promise((r) => setTimeout(r, 50));

  const c2 = await req('POST', commentsBase, {
    token: ownerToken,
    body: { body: 'Second comment' },
  });
  assert('owner can comment', c2.status === 201);

  const listRes = await req('GET', commentsBase, { token: memberToken });
  assert('list comments returns 200', listRes.status === 200);
  assert('list comments is array', Array.isArray(listRes.json));
  assert('comments ordered oldest first', listRes.json[0]?.body === 'First comment' && listRes.json[1]?.body === 'Second comment');

  // Cross-project task 404
  const project2 = await req('POST', '/api/projects', {
    token: memberToken,
    body: { name: 'Other project' },
  });
  const crossComment = await req('GET', `/api/projects/${project2.json.id}/tasks/${taskId}/comments`, {
    token: memberToken,
  });
  assert('cross-project comment access returns 404', crossComment.status === 404);

  // Activity feed
  const activityRes = await req('GET', `/api/projects/${projectId}/activity`, { token: memberToken });
  assert('activity feed returns 200', activityRes.status === 200);
  assert('activity has pagination shape', activityRes.json.data && activityRes.json.total !== undefined && activityRes.json.page === 1);
  assert('activity ordered desc (newest first)', activityRes.json.data.length > 0);
  assert('activity includes actor name', activityRes.json.data[0]?.actor?.name !== undefined);

  const commentActivity = activityRes.json.data.find((e) => e.type === 'COMMENT_ADDED');
  assert('COMMENT_ADDED in activity feed', !!commentActivity);

  const badPageActivity = await req('GET', `/api/projects/${projectId}/activity?page=-1&limit=9999`, { token: memberToken });
  assert('activity bad pagination returns 200', badPageActivity.status === 200);
  assert('activity bad page defaults to 1', badPageActivity.json.page === 1);

  // Non-member blocked from activity
  const outsider = await signup('outsider');
  const outsiderToken = await login(outsider.email);
  const activity403 = await req('GET', `/api/projects/${projectId}/activity`, { token: outsiderToken });
  assert('non-member activity returns 403', activity403.status === 403);

  // Assigned to me
  const assignedRes = await req('GET', '/api/tasks/assigned-to-me', { token: memberToken });
  assert('assigned-to-me returns 200', assignedRes.status === 200);
  assert('assigned-to-me pagination shape', assignedRes.json.data && assignedRes.json.total !== undefined);
  assert('assigned-to-me includes assigned task', assignedRes.json.data.some((t) => t.id === taskId));
  assert('assigned-to-me includes project info', assignedRes.json.data.some((t) => t.project?.id === projectId && t.project?.name));

  const ownerAssigned = await req('GET', '/api/tasks/assigned-to-me', { token: ownerToken });
  assert('owner assigned-to-me excludes member task', !ownerAssigned.json.data.some((t) => t.id === taskId));

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    failed.forEach((f) => console.log(` - ${f.name}: ${f.detail}`));
    process.exit(1);
  }
};

main().catch((e) => { console.error(e); process.exit(1); });
