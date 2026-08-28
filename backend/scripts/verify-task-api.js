/**
 * Manual verification script for task API edge cases.
 * Run with: node scripts/verify-task-api.js
 * Requires backend server on PORT (default 5000) and a working DATABASE_URL.
 */
const BASE = `http://localhost:${process.env.PORT || 5000}`;

const results = [];

const assert = (name, condition, detail = '') => {
  results.push({ name, pass: !!condition, detail });
  const mark = condition ? 'PASS' : 'FAIL';
  console.log(`${mark}: ${name}${detail ? ` — ${detail}` : ''}`);
};

const req = async (method, path, { token, body, cookie } = {}) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json, headers: res.headers };
};

const signup = async (suffix) => {
  const email = `verify_${suffix}_${Date.now()}@test.com`;
  const res = await req('POST', '/api/auth/signup', {
    body: { name: `User ${suffix}`, email, password: 'Password1' },
  });
  return { email, signupRes: res };
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
    console.error('Server not reachable. Start with: npm run dev');
    process.exit(1);
  }

  const owner = await signup('owner');
  assert('owner signup', owner.signupRes.status === 201, `status ${owner.signupRes.status}`);
  const ownerToken = await login(owner.email);
  assert('owner login', !!ownerToken);

  const member = await signup('member');
  const memberToken = await login(member.email);
  assert('member login', !!memberToken);

  const ownerMe = await req('GET', '/api/auth/me', { token: ownerToken });
  const memberMe = await req('GET', '/api/auth/me', { token: memberToken });
  const ownerId = ownerMe.json.id;
  const memberId = memberMe.json.id;

  const projectRes = await req('POST', '/api/projects', {
    token: ownerToken,
    body: { name: 'Verify Project' },
  });
  const projectId = projectRes.json.id;
  assert('create project', projectRes.status === 201, projectId);

  const inviteRes = await req('POST', `/api/projects/${projectId}/members`, {
    token: ownerToken,
    body: { email: member.email },
  });
  assert('invite member', inviteRes.status === 201);

  const tasksBase = `/api/projects/${projectId}/tasks`;

  // Pagination edge cases
  const pagNegPage = await req('GET', `${tasksBase}?page=-1`, { token: ownerToken });
  assert('GET page=-1 returns 200', pagNegPage.status === 200);
  assert('GET page=-1 defaults page to 1', pagNegPage.json.page === 1);

  const pagNegLimit = await req('GET', `${tasksBase}?limit=-5`, { token: ownerToken });
  assert('GET limit=-5 returns 200', pagNegLimit.status === 200);

  const pagZero = await req('GET', `${tasksBase}?page=0&limit=0`, { token: ownerToken });
  assert('GET page=0 limit=0 returns 200', pagZero.status === 200);
  assert('GET page=0 defaults to page 1', pagZero.json.page === 1);

  const pagNaN = await req('GET', `${tasksBase}?page=abc&limit=xyz`, { token: ownerToken });
  assert('GET invalid pagination returns 200', pagNaN.status === 200);
  assert('GET invalid pagination defaults page 1', pagNaN.json.page === 1);

  const pagDecimal = await req('GET', `${tasksBase}?page=1.9&limit=2.7`, { token: ownerToken });
  assert('GET decimal page/limit returns 200', pagDecimal.status === 200);
  assert('GET decimal page floors to 1', pagDecimal.json.page === 1);

  const pagHuge = await req('GET', `${tasksBase}?limit=9999`, { token: ownerToken });
  assert('GET huge limit returns 200', pagHuge.status === 200);

  const invalidStatusFilter = await req('GET', `${tasksBase}?status=RANDOM`, { token: ownerToken });
  assert('GET invalid status filter returns 400', invalidStatusFilter.status === 400);

  // Create validation
  const emptyTitle = await req('POST', tasksBase, { token: ownerToken, body: { title: '   ' } });
  assert('create empty title returns 400', emptyTitle.status === 400);

  const pastDue = await req('POST', tasksBase, {
    token: ownerToken,
    body: { title: 'Past task', dueDate: '2020-01-01T00:00:00.000Z' },
  });
  assert('create past dueDate returns 400', pastDue.status === 400);

  const badDue = await req('POST', tasksBase, {
    token: ownerToken,
    body: { title: 'Bad date', dueDate: 'not-a-date' },
  });
  assert('create malformed dueDate returns 400', badDue.status === 400);

  const invalidPriorityCreate = await req('POST', tasksBase, {
    token: ownerToken,
    body: { title: 'Bad priority', priority: 'URGENT' },
  });
  assert('create invalid priority returns 400', invalidPriorityCreate.status === 400);

  const nonMemberAssign = await req('POST', tasksBase, {
    token: ownerToken,
    body: { title: 'Bad assignee', assigneeId: '00000000-0000-0000-0000-000000000099' },
  });
  assert('assign non-member returns 400', nonMemberAssign.status === 400);

  const createRes = await req('POST', tasksBase, {
    token: ownerToken,
    body: { title: 'Main task', assigneeId: memberId },
  });
  const taskId = createRes.json.id;
  assert('create task', createRes.status === 201, taskId);

  const unassignedRes = await req('POST', tasksBase, {
    token: ownerToken,
    body: { title: 'Unassigned task' },
  });
  const unassignedTaskId = unassignedRes.json.id;

  // PATCH edge cases
  const emptyPatch = await req('PATCH', `${tasksBase}/${taskId}`, { token: ownerToken, body: {} });
  assert('PATCH {} returns 200', emptyPatch.status === 200);
  assert('PATCH {} returns unchanged title', emptyPatch.json.title === 'Main task');

  const emptyAssigneePatch = await req('PATCH', `${tasksBase}/${taskId}`, {
    token: ownerToken,
    body: { assigneeId: '' },
  });
  assert('PATCH assigneeId="" returns 200', emptyAssigneePatch.status === 200);
  assert('PATCH assigneeId="" unassigns', emptyAssigneePatch.json.assigneeId === null);

  // Re-assign for further tests
  await req('PATCH', `${tasksBase}/${taskId}`, {
    token: ownerToken,
    body: { assigneeId: memberId },
  });

  const invalidStatusPatch = await req('PATCH', `${tasksBase}/${taskId}`, {
    token: ownerToken,
    body: { status: 'RANDOM' },
  });
  assert('PATCH invalid status returns 400', invalidStatusPatch.status === 400);

  const invalidPriorityPatch = await req('PATCH', `${tasksBase}/${taskId}`, {
    token: ownerToken,
    body: { priority: 'URGENT' },
  });
  assert('PATCH invalid priority returns 400', invalidPriorityPatch.status === 400);

  const badDuePatch = await req('PATCH', `${tasksBase}/${taskId}`, {
    token: ownerToken,
    body: { dueDate: 'garbage' },
  });
  assert('PATCH malformed dueDate returns 400', badDuePatch.status === 400);

  // DONE authorization: task assigned to owner only, member cannot mark DONE
  const ownerOnlyTaskRes = await req('POST', tasksBase, {
    token: ownerToken,
    body: { title: 'Owner only task', assigneeId: ownerId },
  });
  const ownerOnlyTaskId = ownerOnlyTaskRes.json.id;
  const memberOtherDone = await req('PATCH', `${tasksBase}/${ownerOnlyTaskId}`, {
    token: memberToken,
    body: { status: 'DONE' },
  });
  assert('different member cannot mark someone else task DONE', memberOtherDone.status === 403);

  // Create task assigned to member, member marks done - allowed
  const memberTaskRes = await req('POST', tasksBase, {
    token: ownerToken,
    body: { title: 'Member assigned', assigneeId: memberId },
  });
  const memberTaskId = memberTaskRes.json.id;
  const assigneeDone = await req('PATCH', `${tasksBase}/${memberTaskId}`, {
    token: memberToken,
    body: { status: 'DONE' },
  });
  assert('assignee marks own task DONE', assigneeDone.status === 200);
  assert('assignee DONE sets completedAt', assigneeDone.json.completedAt !== null);

  const clearDone = await req('PATCH', `${tasksBase}/${memberTaskId}`, {
    token: memberToken,
    body: { status: 'IN_PROGRESS' },
  });
  assert('DONE -> IN_PROGRESS returns 200', clearDone.status === 200);
  assert('DONE -> IN_PROGRESS clears completedAt', clearDone.json.completedAt === null);

  // Task assigned to member - another member can't mark done (only owner and assignee exist here)
  // Use owner-created task assigned to member; owner tries - allowed
  const ownerMarksDone = await req('PATCH', `${tasksBase}/${taskId}`, {
    token: ownerToken,
    body: { status: 'DONE' },
  });
  assert('owner marks assigned task DONE', ownerMarksDone.status === 200);

  await req('PATCH', `${tasksBase}/${taskId}`, { token: ownerToken, body: { status: 'TODO' } });

  // Unassigned task - member cannot mark done
  const memberUnassignedDone = await req('PATCH', `${tasksBase}/${unassignedTaskId}`, {
    token: memberToken,
    body: { status: 'DONE' },
  });
  assert('member cannot mark unassigned task DONE', memberUnassignedDone.status === 403);

  const ownerUnassignedDone = await req('PATCH', `${tasksBase}/${unassignedTaskId}`, {
    token: ownerToken,
    body: { status: 'DONE' },
  });
  assert('owner can mark unassigned task DONE', ownerUnassignedDone.status === 200);

  // Self-assign + DONE same request - member should fail (not assignee before update)
  const selfAssignDone = await req('PATCH', `${tasksBase}/${unassignedTaskId}`, {
    token: memberToken,
    body: { assigneeId: memberId, status: 'DONE' },
  });
  assert('self-assign + DONE same request blocked for non-assignee', selfAssignDone.status === 403);

  // Cross-project access
  const project2Res = await req('POST', '/api/projects', {
    token: memberToken,
    body: { name: 'Member Project' },
  });
  const project2Id = project2Res.json.id;
  const crossAccess = await req('GET', `/api/projects/${project2Id}/tasks/${taskId}`, {
    token: memberToken,
  });
  assert('cross-project task access returns 404', crossAccess.status === 404);

  // Pagination uses DB (indirect): list returns shape
  const listRes = await req('GET', `${tasksBase}?page=1&limit=2`, { token: ownerToken });
  assert('list tasks paginated shape', listRes.status === 200 && Array.isArray(listRes.json.data));
  assert('list has total/page/totalPages', listRes.json.total !== undefined && listRes.json.page === 1);

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.log('\nFailures:');
    failed.forEach((f) => console.log(` - ${f.name}: ${f.detail}`));
    process.exit(1);
  }
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
