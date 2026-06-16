const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Store io instance so controllers can use it
app.set('io', io);

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Join a project room
  socket.on('join_project', (projectId) => {
    socket.join(`project:${projectId}`);
    console.log(`User ${socket.id} joined project:${projectId}`);
  });

  // Join a workspace room
  socket.on('join_workspace', (workspaceId) => {
    socket.join(`workspace:${workspaceId}`);
    console.log(`User ${socket.id} joined workspace:${workspaceId}`);
  });

  // User is typing
  socket.on('typing', ({ projectId, userId, taskId }) => {
    socket.to(`project:${projectId}`).emit('user_typing', {
      userId,
      taskId
    });
  });

  // User presence
  socket.on('user_online', ({ workspaceId, userId, name }) => {
    socket.to(`workspace:${workspaceId}`).emit('member_online', {
      userId,
      name,
      socketId: socket.id
    });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`PulseBoard server running on port ${PORT}`);
  console.log(`WebSocket server ready`);
});