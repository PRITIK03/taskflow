/**
 * Wraps an async route handler so that any thrown error or rejected promise
 * is forwarded to Express's next(err) error-handling middleware instead of
 * causing an unhandled rejection that either hangs the request or crashes
 * the process.
 *
 * Usage:
 *   router.get('/foo', asyncHandler(async (req, res) => { ... }));
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
