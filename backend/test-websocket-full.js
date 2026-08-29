/**
 * Full end-to-end WebSocket test suite for TaskFlow backend.
 * Run with: node test-websocket-full.js
 * Server must already be running (npm run dev).
 */

const { io: ioClient } = require('socket.io-client');
const http = require('http');

const BASE = 'http://localhost:5000';
const SHARED_PROJECT_ID = 'f980f765-85ef-4429-8b48-e37edf89b3d0';
const TIMEOUT_MS = 3000;

// ─── helpers ────────────────────────────────────────────────────────────────

const request = (method, path, body, token) =>
  new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const url = new URL(path, BASE);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });

const connectSocket = (token) =>
  new Promise((resolve, reject) => {
    const socket = ioClient(BASE, {
      auth: { token },
      transports: ['websocket'],
    });
    const timer = setTimeout(() => {
      socket.disconnect();
      reject(new Error('Connection timed out after 3s'));
    }, TIMEOUT_MS);
    socket.on('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.on('connect_error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });

// Wait for a specific event on a socket within TIMEOUT_MS.
// Returns the payload, or rejects with a timeout error.
const waitForEvent = (socket, event, timeoutMs = TIMEOUT_MS) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout: '${event}' not received within ${timeoutMs}ms`));
    }, timeoutMs);
    socket.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });

// Wait and assert NO event arrives within timeoutMs.
// Resolves with true if nothing arrived, rejects if it did.
const assertNoEvent = (socket, event, timeoutMs = TIMEOUT_MS) =>
  new Promise((resolve, reject) => {
    const handler = (data) => {
      clearTimeout(timer);
      reject(new Error(`Unexpected '${event}' event received: ${JSON.stringify(data)}`));
    };
    const timer = setTimeout(() => {
      socket.off(event, handler);
      resolve(true);
    }, timeoutMs);
    socket.once(event, handler);
  });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const pass = (label) => console.log(`  ✅ PASS — ${label}`);
const fail = (label, err) => console.log(`  ❌ FAIL — ${label}: ${err?.message || err}`);

// Track per-test results for the final summary
const results = {};
const mark = (test, passed) => { results[test] = passed; };

// ─── main ────────────────────────────────────────────────────────────────────

(async () => {
  let socket1, socket2b, socket3;
  let user1Token, user2Token, user3Token;
  let user3Id, thirdProjectId;

  try {
    // ── SETUP ────────────────────────────────────────────────────────────────
    console.log('\n══════════════════════════════════════════');
    console.log('  SETUP');
    console.log('══════════════════════════════════════════');

    // 1. Login as user 1
    const login1 = await request('POST', '/api/auth/login', {
      email: 'test@example.com',
      password: 'password123',
    });
    if (login1.status !== 200) throw new Error(`User 1 login failed: ${JSON.stringify(login1.body)}`);
    user1Token = login1.body.accessToken;
    const user1Id = login1.body.user.id;
    console.log(`✅ User 1 logged in — id: ${user1Id}`);

    // 2. Login as user 2
    const login2 = await request('POST', '/api/auth/login', {
      email: 'second@example.com',
      password: 'password123',
    });
    if (login2.status !== 200) throw new Error(`User 2 login failed: ${JSON.stringify(login2.body)}`);
    user2Token = login2.body.accessToken;
    const user2Id = login2.body.user.id;
    const user2Email = login2.body.user.email;
    console.log(`✅ User 2 logged in — id: ${user2Id}`);

    // 3. Sign up + login as brand new user 3
    const ts = Date.now();
    const user3Email = `thirduser+${ts}@example.com`;
    const signup3 = await request('POST', '/api/auth/signup', {
      name: 'Third User',
      email: user3Email,
      password: 'password123',
    });
    if (signup3.status !== 201) throw new Error(`User 3 signup failed: ${JSON.stringify(signup3.body)}`);
    const login3 = await request('POST', '/api/auth/login', {
      email: user3Email,
      password: 'password123',
    });
    if (login3.status !== 200) throw new Error(`User 3 login failed`);
    user3Token = login3.body.accessToken;
    user3Id = login3.body.user.id;
    console.log(`✅ User 3 signed up and logged in — id: ${user3Id} (${user3Email})`);

    // ── TEST A — task:created event ──────────────────────────────────────────
    console.log('\n══════════════════════════════════════════');
    console.log('  TEST A — Basic connection + task:created');
    console.log('══════════════════════════════════════════');

    let testA = true;

    // 5. Connect socket as user 1
    try {
      socket1 = await connectSocket(user1Token);
      pass(`Socket connected as user 1 — id: ${socket1.id}`);
    } catch (err) {
      fail('Socket connect as user 1', err);
      testA = false;
    }

    // 6 + 7. Create task and assert task:created
    if (socket1) {
      try {
        const eventPromise = waitForEvent(socket1, 'task:created');
        const createTask = await request(
          'POST',
          `/api/projects/${SHARED_PROJECT_ID}/tasks`,
          { title: `Test A task ${ts}` },
          user1Token
        );
        if (createTask.status !== 201) throw new Error(`Task create failed: ${JSON.stringify(createTask.body)}`);
        const event = await eventPromise;
        if (event.title === `Test A task ${ts}`) {
          pass(`task:created received with correct title: "${event.title}"`);
        } else {
          fail('task:created title mismatch', new Error(`expected "${`Test A task ${ts}`}", got "${event.title}"`));
          testA = false;
        }
      } catch (err) {
        fail('task:created event', err);
        testA = false;
      }
    }

    mark('A', testA);

    // ── TEST B — comment:added + task:updated ────────────────────────────────
    console.log('\n══════════════════════════════════════════');
    console.log('  TEST B — comment:added + task:updated');
    console.log('══════════════════════════════════════════');

    let testB = true;

    // 8 + 9. Create a task, then comment on it
    if (socket1) {
      try {
        // Create a fresh task to comment on
        const freshTask = await request(
          'POST',
          `/api/projects/${SHARED_PROJECT_ID}/tasks`,
          { title: `Test B comment task ${ts}` },
          user1Token
        );
        if (freshTask.status !== 201) throw new Error(`Fresh task create failed: ${JSON.stringify(freshTask.body)}`);
        const freshTaskId = freshTask.body.id;

        // Skip the task:created event for this one since we're testing comment
        await sleep(100);

        const commentEventPromise = waitForEvent(socket1, 'comment:added');
        const addComment = await request(
          'POST',
          `/api/projects/${SHARED_PROJECT_ID}/tasks/${freshTaskId}/comments`,
          { body: 'WebSocket test comment' },
          user1Token
        );
        if (addComment.status !== 201) throw new Error(`Comment create failed: ${JSON.stringify(addComment.body)}`);
        const commentEvent = await commentEventPromise;
        if (commentEvent.body === 'WebSocket test comment') {
          pass(`comment:added received with correct body: "${commentEvent.body}"`);
        } else {
          fail('comment:added body mismatch', new Error(`got "${commentEvent.body}"`));
          testB = false;
        }
      } catch (err) {
        fail('comment:added event', err);
        testB = false;
      }

      // 10 + 11. Create a fresh task and PATCH its status
      try {
        const patchTask = await request(
          'POST',
          `/api/projects/${SHARED_PROJECT_ID}/tasks`,
          { title: `Test B patch task ${ts}` },
          user1Token
        );
        if (patchTask.status !== 201) throw new Error(`Patch task create failed: ${JSON.stringify(patchTask.body)}`);
        const patchTaskId = patchTask.body.id;

        await sleep(100); // let task:created event clear

        const updatedEventPromise = waitForEvent(socket1, 'task:updated');
        const patchRes = await request(
          'PATCH',
          `/api/projects/${SHARED_PROJECT_ID}/tasks/${patchTaskId}`,
          { status: 'IN_PROGRESS' },
          user1Token
        );
        if (patchRes.status !== 200) throw new Error(`Task PATCH failed: ${JSON.stringify(patchRes.body)}`);
        const updatedEvent = await updatedEventPromise;
        if (updatedEvent.status === 'IN_PROGRESS') {
          pass(`task:updated received with correct status: "${updatedEvent.status}"`);
        } else {
          fail('task:updated status mismatch', new Error(`got "${updatedEvent.status}"`));
          testB = false;
        }
      } catch (err) {
        fail('task:updated event', err);
        testB = false;
      }
    } else {
      fail('TEST B skipped — socket1 not connected', new Error('prerequisite failed'));
      testB = false;
    }

    mark('B', testB);

    // ── TEST C — Cross-project isolation ─────────────────────────────────────
    console.log('\n══════════════════════════════════════════');
    console.log('  TEST C — Cross-project isolation (security)');
    console.log('══════════════════════════════════════════');

    let testC = true;

    // 12. User 3 creates their own project and a task in it
    try {
      const proj3 = await request(
        'POST',
        '/api/projects',
        { name: `User3 Isolated Project ${ts}` },
        user3Token
      );
      if (proj3.status !== 201) throw new Error(`User 3 project create failed: ${JSON.stringify(proj3.body)}`);
      thirdProjectId = proj3.body.id;
      console.log(`  User 3 created project: ${thirdProjectId}`);

      // 13. Assert socket1 does NOT receive task:created for user3's project
      const noLeakPromise = assertNoEvent(socket1, 'task:created', TIMEOUT_MS);

      const task3 = await request(
        'POST',
        `/api/projects/${thirdProjectId}/tasks`,
        { title: `User3 isolated task ${ts}` },
        user3Token
      );
      if (task3.status !== 201) throw new Error(`User 3 task create failed: ${JSON.stringify(task3.body)}`);
      console.log(`  User 3 created task in their project — waiting ${TIMEOUT_MS}ms for any leak...`);

      await noLeakPromise;
      pass('No task:created event leaked to user 1 from user 3\'s project (isolation confirmed)');
    } catch (err) {
      if (err.message.startsWith('Unexpected')) {
        fail('Cross-project event LEAKED to user 1 socket — SECURITY ISSUE', err);
      } else {
        fail('Cross-project isolation test error', err);
      }
      testC = false;
    }

    mark('C', testC);

    // ── TEST D — Eviction on member removal ───────────────────────────────────
    console.log('\n══════════════════════════════════════════');
    console.log('  TEST D — Eviction on member removal');
    console.log('══════════════════════════════════════════');

    let testD = true;

    // 14. Connect socket as user 2
    try {
      socket2b = await connectSocket(user2Token);
      pass(`Socket connected as user 2 — id: ${socket2b.id}`);
    } catch (err) {
      fail('Socket connect as user 2', err);
      testD = false;
    }

    if (socket2b && socket1) {
      // 15. Owner removes user 2 from shared project
      try {
        const removeRes = await request(
          'DELETE',
          `/api/projects/${SHARED_PROJECT_ID}/members/${user2Id}`,
          null,
          user1Token
        );
        if (removeRes.status !== 200) throw new Error(`Remove member failed: ${JSON.stringify(removeRes.body)}`);
        console.log('  User 2 removed from shared project via REST');

        // Small pause to allow socket eviction to process
        await sleep(200);

        // 16 + 17. Owner creates a new task — user 2 must NOT receive task:created
        const noEventForUser2 = assertNoEvent(socket2b, 'task:created', TIMEOUT_MS);
        // 18. User 1 SHOULD still receive it
        const eventForUser1 = waitForEvent(socket1, 'task:created', TIMEOUT_MS);

        const evictTask = await request(
          'POST',
          `/api/projects/${SHARED_PROJECT_ID}/tasks`,
          { title: `Post-eviction task ${ts}` },
          user1Token
        );
        if (evictTask.status !== 201) throw new Error(`Post-eviction task create failed: ${JSON.stringify(evictTask.body)}`);

        // Check user 2 gets nothing
        try {
          await noEventForUser2;
          pass('Evicted user 2 did NOT receive task:created after removal (eviction confirmed)');
        } catch (err) {
          fail('Evicted user 2 still received task:created — eviction FAILED', err);
          testD = false;
        }

        // Check user 1 still gets it
        try {
          const u1Event = await eventForUser1;
          if (u1Event.title === `Post-eviction task ${ts}`) {
            pass(`User 1 (non-removed member) still received task:created correctly: "${u1Event.title}"`);
          } else {
            fail('User 1 task:created title mismatch', new Error(`got "${u1Event.title}"`));
            testD = false;
          }
        } catch (err) {
          fail('User 1 should have received task:created but did not', err);
          testD = false;
        }

      } catch (err) {
        fail('TEST D eviction flow', err);
        testD = false;
      }
    } else {
      fail('TEST D skipped — prerequisite socket not connected', new Error(''));
      testD = false;
    }

    mark('D', testD);

    // ── TEST E — member:removed event before eviction ─────────────────────────
    console.log('\n══════════════════════════════════════════');
    console.log('  TEST E — member:removed event before eviction');
    console.log('══════════════════════════════════════════');

    let testE = true;

    // 19. Re-invite user 2
    try {
      const reInvite = await request(
        'POST',
        `/api/projects/${SHARED_PROJECT_ID}/members`,
        { email: user2Email },
        user1Token
      );
      if (reInvite.status !== 201) throw new Error(`Re-invite failed: ${JSON.stringify(reInvite.body)}`);
      console.log('  User 2 re-invited to shared project');

      // Disconnect old socket2b and reconnect so they're in the room again
      if (socket2b) socket2b.disconnect();

      // Need fresh token since time may have passed
      const reLogin2 = await request('POST', '/api/auth/login', {
        email: 'second@example.com',
        password: 'password123',
      });
      if (reLogin2.status !== 200) throw new Error(`User 2 re-login failed`);
      const freshToken2 = reLogin2.body.accessToken;

      socket2b = await connectSocket(freshToken2);
      pass(`User 2 socket reconnected after re-invite — id: ${socket2b.id}`);

      await sleep(200); // let DB room join settle

      // 20 + 21. Owner removes user 2 — assert member:removed received by user 2
      const memberRemovedPromise = waitForEvent(socket2b, 'member:removed', TIMEOUT_MS);

      const removeRes2 = await request(
        'DELETE',
        `/api/projects/${SHARED_PROJECT_ID}/members/${user2Id}`,
        null,
        user1Token
      );
      if (removeRes2.status !== 200) throw new Error(`Second remove failed: ${JSON.stringify(removeRes2.body)}`);

      try {
        const memberRemovedEvent = await memberRemovedPromise;
        if (memberRemovedEvent.userId === user2Id) {
          pass(`member:removed event received by user 2 before eviction — userId: ${memberRemovedEvent.userId}`);
        } else {
          fail('member:removed userId mismatch', new Error(`expected ${user2Id}, got ${memberRemovedEvent.userId}`));
          testE = false;
        }
      } catch (err) {
        fail('member:removed event NOT received by user 2', err);
        testE = false;
      }

    } catch (err) {
      fail('TEST E setup or assertion', err);
      testE = false;
    }

    mark('E', testE);

  } catch (err) {
    console.error('\n❌ FATAL setup error:', err.message || err);
    console.error(err.stack || '(no stack)');
  } finally {
    // ── CLEANUP ──────────────────────────────────────────────────────────────
    console.log('\n══════════════════════════════════════════');
    console.log('  CLEANUP');
    console.log('══════════════════════════════════════════');
    if (socket1) { socket1.disconnect(); console.log('  Socket 1 disconnected'); }
    if (socket2b) { socket2b.disconnect(); console.log('  Socket 2 disconnected'); }
    if (socket3) { socket3.disconnect(); console.log('  Socket 3 disconnected'); }

    // ── FINAL SUMMARY ─────────────────────────────────────────────────────────
    console.log('\n══════════════════════════════════════════');
    console.log('  FINAL SUMMARY');
    console.log('══════════════════════════════════════════');
    const tests = ['A', 'B', 'C', 'D', 'E'];
    const labels = {
      A: 'Basic connection + task:created',
      B: 'comment:added + task:updated',
      C: 'Cross-project isolation (security)',
      D: 'Eviction on member removal',
      E: 'member:removed event before eviction',
    };
    let allPassed = true;
    for (const t of tests) {
      const status = results[t] === true ? '✅ PASS' : results[t] === false ? '❌ FAIL' : '⚠️  SKIP';
      if (results[t] !== true) allPassed = false;
      console.log(`  ${status} — Test ${t}: ${labels[t]}`);
    }
    console.log('──────────────────────────────────────────');
    console.log(allPassed ? '  ✅ ALL TESTS PASSED' : '  ❌ SOME TESTS FAILED');
    console.log('══════════════════════════════════════════\n');

    process.exit(allPassed ? 0 : 1);
  }
})();
