/**
 * Edge-case audit tests for comments / activity / assigned-to-me.
 * Run: node scripts/audit-edge-cases.js
 */
const BASE = `http://localhost:${process.env.PORT || 5000}`;

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
  const email = `audit_${suffix}_${Date.now()}@test.com`;
  await req('POST', '/api/auth/signup', {
    body: { name: suffix, email, password: 'Password1' },
  });
  const loginRes = await req('POST', '/api/auth/login', {
    body: { email, password: 'Password1' },
  });
  const me = await req('GET', '/api/auth/me', { token: loginRes.json.accessToken });
  return { email, token: loginRes.json.accessToken, id: me.json.id };
};

const main = async () => {
  console.log('=== Edge case audit ===\n');

  const owner = await signup('owner');
  const member = await signup('member');

  const project = await req('POST', '/api/projects', {
    token: owner.token,
    body: { name: 'Audit Project' },
  });
  const projectId = project.json.id;

  await req('POST', `/api/projects/${projectId}/members`, {
    token: owner.token,
    body: { email: member.email },
  });

  const task = await req('POST', `/api/projects/${projectId}/tasks`, {
    token: owner.token,
    body: { title: 'Audit task', assigneeId: member.id },
  });
  const taskId = task.json.id;

  // 4. page beyond last
  await req('POST', `/api/projects/${projectId}/tasks/${taskId}/comments`, {
    token: owner.token,
    body: { body: 'activity filler' },
  });
  const activity = await req('GET', `/api/projects/${projectId}/activity?page=999`, {
    token: owner.token,
  });
  console.log('4. page=999 activity:', {
    status: activity.status,
    dataLen: activity.json?.data?.length,
    total: activity.json?.total,
    page: activity.json?.page,
    totalPages: activity.json?.totalPages,
  });

  const assignedPage999 = await req('GET', '/api/tasks/assigned-to-me?page=999', {
    token: member.token,
  });
  console.log('4. page=999 assigned-to-me:', {
    status: assignedPage999.status,
    dataLen: assignedPage999.json?.data?.length,
    total: assignedPage999.json?.total,
  });

  // 1. Data leakage check - inspect response keys
  const comment = await req('POST', `/api/projects/${projectId}/tasks/${taskId}/comments`, {
    token: member.token,
    body: { body: 'leak check' },
  });
  console.log('\n1. comment response keys:', Object.keys(comment.json || {}));
  console.log('1. author keys:', Object.keys(comment.json?.author || {}));
  console.log('1. has passwordHash:', 'passwordHash' in (comment.json?.author || {}));

  const activitySample = await req('GET', `/api/projects/${projectId}/activity`, {
    token: owner.token,
  });
  const entry = activitySample.json?.data?.[0];
  console.log('1. activity entry keys:', entry ? Object.keys(entry) : []);
  console.log('1. activity actor keys:', entry?.actor ? Object.keys(entry.actor) : []);

  const assigned = await req('GET', '/api/tasks/assigned-to-me', { token: member.token });
  const taskRow = assigned.json?.data?.[0];
  console.log('1. assigned task keys:', taskRow ? Object.keys(taskRow) : []);
  console.log('1. assigned project keys:', taskRow?.project ? Object.keys(taskRow.project) : []);

  // 2. Cross-project ID guess
  const projectB = await req('POST', '/api/projects', {
    token: member.token,
    body: { name: 'Project B' },
  });
  const crossList = await req('GET', `/api/projects/${projectB.json.id}/tasks/${taskId}/comments`, {
    token: member.token,
  });
  const crossActivity = await req('GET', `/api/projects/${projectB.json.id}/activity`, {
    token: owner.token,
  });
  console.log('\n2. cross-project comments (member of B, task from A):', crossList.status);
  console.log('2. cross-project activity (owner of A, activity of B):', crossActivity.status);

  // 5. Unassign then assigned-to-me
  const before = await req('GET', '/api/tasks/assigned-to-me', { token: member.token });
  await req('PATCH', `/api/projects/${projectId}/tasks/${taskId}`, {
    token: owner.token,
    body: { assigneeId: null },
  });
  const after = await req('GET', '/api/tasks/assigned-to-me', { token: member.token });
  console.log('\n5. assigned before unassign:', before.json?.data?.some((t) => t.id === taskId));
  console.log('5. assigned after unassign:', after.json?.data?.some((t) => t.id === taskId));

  // Re-assign for delete test
  await req('PATCH', `/api/projects/${projectId}/tasks/${taskId}`, {
    token: owner.token,
    body: { assigneeId: member.id },
  });

  // 6. Delete project then assigned-to-me
  const beforeDelete = await req('GET', '/api/tasks/assigned-to-me', { token: member.token });
  await req('DELETE', `/api/projects/${projectId}`, { token: owner.token });
  const afterDelete = await req('GET', '/api/tasks/assigned-to-me', { token: member.token });
  console.log('\n6. assigned before project delete:', beforeDelete.json?.data?.some((t) => t.id === taskId));
  console.log('6. assigned after project delete:', afterDelete.json?.data?.some((t) => t.id === taskId));
  console.log('6. total after delete:', afterDelete.json?.total);

  // 7. Removed member with old token
  const owner2 = await signup('owner2');
  const victim = await signup('victim');
  const p2 = await req('POST', '/api/projects', { token: owner2.token, body: { name: 'P2' } });
  const p2id = p2.json.id;
  await req('POST', `/api/projects/${p2id}/members`, { token: owner2.token, body: { email: victim.email } });
  const t2 = await req('POST', `/api/projects/${p2id}/tasks`, {
    token: owner2.token,
    body: { title: 'T2' },
  });
  await req('DELETE', `/api/projects/${p2id}/members/${victim.id}`, { token: owner2.token });
  const removedComment = await req('POST', `/api/projects/${p2id}/tasks/${t2.json.id}/comments`, {
    token: victim.token,
    body: { body: 'should fail' },
  });
  console.log('\n7. removed member comment with old token:', removedComment.status, removedComment.json?.error);
};

main().catch(console.error);
