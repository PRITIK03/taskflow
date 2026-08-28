const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.split(' ')[1]
    : null;

  if (!token) {
    return res.status(401).json({ error: 'Access token required.' });
  }

  jwt.verify(token, process.env.JWT_ACCESS_SECRET, (err, decoded) => {
    if (err) {
      // Same 401 for expired AND invalid tokens — frontend reacts
      // the same way either way (tries a refresh)
      return res.status(401).json({ error: 'Invalid or expired access token.' });
    }
    req.userId = decoded.userId;
    next();
  });
};

module.exports = authenticateToken;
