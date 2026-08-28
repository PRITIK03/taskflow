require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');

const app = express();
const server = http.createServer(app);
// needed so Socket.io can attach to the same server later

app.use(cors());
app.use(express.json());

const authRoutes = require('./routes/authRoutes');
app.use('/api/auth', authRoutes);

// Simple health check route — confirms the server boots correctly
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
