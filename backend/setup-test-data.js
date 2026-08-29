/**
 * Re-invite user 2 to the shared project to reset test state.
 */
const http = require('http');

const request = (method, path, body, token) =>
  new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const url = new URL(path, 'http://localhost:5000');
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

(async () => {
  try {
    // Login as user 1 (owner)
    const login = await request('POST', '/api/auth/login', {
      email: 'test@example.com',
      password: 'password123',
    });
    if (login.status !== 200) throw new Error(`Login failed: ${JSON.stringify(login.body)}`);
    const token = login.body.accessToken;
    console.log('✅ Logged in as user 1 (owner)');

    // Re-invite user 2
    const invite = await request(
      'POST',
      '/api/projects/f980f765-85ef-4429-8b48-e37edf89b3d0/members',
      { email: 'second@example.com' },
      token
    );
    if (invite.status === 201) {
      console.log('✅ User 2 re-invited to shared project');
    } else if (invite.status === 409) {
      console.log('ℹ️  User 2 already a member of the project');
    } else {
      console.log(`⚠️  Invite returned ${invite.status}: ${JSON.stringify(invite.body)}`);
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
})();
