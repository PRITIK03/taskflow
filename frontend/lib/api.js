const BASE_URL = 'http://localhost:5000';

/**
 * Fetch wrapper that automatically includes credentials and optional auth token.
 * @param {string} path - API endpoint path (e.g., '/api/auth/login')
 * @param {RequestInit} options - Fetch options
 * @param {string|null} token - Optional access token to include in Authorization header
 * @returns {Promise<Response>}
 */
export async function apiFetch(path, options = {}, token = null) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include', // Always include cookies
  });

  return response;
}
