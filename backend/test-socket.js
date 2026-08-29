const { io } = require('socket.io-client');

const socket = io('http://localhost:5000', {
  auth: { token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJlZTIyYmNkYS05OTFjLTRmOTEtODRhMC00NTg2N2Y2MzgxMDciLCJpYXQiOjE3ODgwMTQ2MjEsImV4cCI6MTc4ODAxNTUyMX0.r-vHNityLCrtFfvxhPdBcw-8CQysDZe74cLvCcG2fAk' },
});

socket.on('connect', () => {
  console.log('✅ Connected! Socket ID:', socket.id);
});

socket.on('connect_error', (err) => {
  console.log('❌ Connection failed:', err.message);
});

socket.on('task:created', (task) => {
  console.log('📦 task:created event received:', task);
});

socket.on('task:updated', (task) => {
  console.log('📦 task:updated event received:', task);
});

socket.on('comment:added', (comment) => {
  console.log('📦 comment:added event received:', comment);
});
