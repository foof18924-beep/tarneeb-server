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

  // Send initial prize
  socket.emit('prize_update', { prizeValue: roomManager.globalPrize });

  socket.on('place_bid', (data) => roomManager.handleGameEvent(socket, 'place_bid', data));
  socket.on('select_trump', (data) => roomManager.handleGameEvent(socket, 'select_trump', data));
  socket.on('play_card', (data) => roomManager.handleGameEvent(socket, 'play_card', data));
  socket.on('play_again', (data) => roomManager.handleGameEvent(socket, 'play_again', data));
  socket.on('leave_room', (data) => roomManager.handleGameEvent(socket, 'leave_room', data));
  
  // Admin events
  socket.on('admin_broadcast', (data) => roomManager.handleGameEvent(socket, 'admin_broadcast', data));
  socket.on('admin_get_stats', (data) => roomManager.handleGameEvent(socket, 'admin_get_stats', data));
  socket.on('admin_set_target_score', (data) => roomManager.handleGameEvent(socket, 'admin_set_target_score', data));
  socket.on('admin_set_prize', (data) => roomManager.handleGameEvent(socket, 'admin_set_prize', data));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
