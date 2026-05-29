import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { RoomManager } from './RoomManager';

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins for dev
    methods: ["GET", "POST"]
  }
});

const roomManager = new RoomManager(io);

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // When a user requests to create or join a room
  socket.on('join_room', ({ username, roomCode }) => {
    roomManager.joinRoom(socket, username, roomCode);
  });

  socket.on('auto_match', ({ username, uid }) => {
    roomManager.autoMatch(socket, username, uid);
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    roomManager.handleDisconnect(socket);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
