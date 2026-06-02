import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import https from 'https';
import { RoomManager } from './RoomManager';

const app = express();
app.use(cors());
app.use(express.json());

// Health check endpoint for Render.com
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/', (_req, res) => {
  res.status(200).json({ message: 'Tarneeb Server is running 🃏', status: 'online' });
});

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

  socket.on('auto_match', ({ username, uid, gameMode }) => {
    roomManager.autoMatch(socket, username, uid, gameMode);
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
  
  socket.on('send_emoji', (data) => {
    if (data && data.roomCode) {
      socket.to(data.roomCode).emit('emoji_received', {
        senderIndex: data.senderIndex,
        targetIndex: data.targetIndex,
        emoji: data.emoji
      });
    }
  });
  
  socket.on('send_chat_bubble', (data) => {
    if (data && data.roomCode) {
      socket.to(data.roomCode).emit('chat_bubble_received', {
        senderIndex: data.senderIndex,
        text: data.text
      });
    }
  });
  
  // Admin events
  socket.on('admin_broadcast', (data) => roomManager.handleGameEvent(socket, 'admin_broadcast', data));
  socket.on('admin_get_stats', (data) => roomManager.handleGameEvent(socket, 'admin_get_stats', data));
  socket.on('admin_set_target_score', (data) => roomManager.handleGameEvent(socket, 'admin_set_target_score', data));
  socket.on('admin_set_prize', (data) => roomManager.handleGameEvent(socket, 'admin_set_prize', data));
  socket.on('admin_test_room', (data) => roomManager.handleGameEvent(socket, 'admin_test_room', data));

  // WebRTC Signaling
  socket.on('webrtc_offer', (data) => {
    socket.to(data.targetId).emit('webrtc_offer', {
      senderId: socket.id,
      offer: data.offer
    });
  });

  socket.on('webrtc_answer', (data) => {
    socket.to(data.targetId).emit('webrtc_answer', {
      senderId: socket.id,
      answer: data.answer
    });
  });

  socket.on('webrtc_ice_candidate', (data) => {
    socket.to(data.targetId).emit('webrtc_ice_candidate', {
      senderId: socket.id,
      candidate: data.candidate
    });
  });
});

const PORT = process.env.PORT || 3001;
const RENDER_URL = process.env.RENDER_EXTERNAL_URL || '';

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  
  // Self-ping every 14 minutes to prevent Render.com free tier from sleeping
  // Render spins down after 15 minutes of inactivity
  if (RENDER_URL) {
    const pingInterval = 14 * 60 * 1000; // 14 minutes
    setInterval(() => {
      const url = `${RENDER_URL}/health`;
      https.get(url, (res) => {
        console.log(`[Keep-Alive] Pinged ${url} - Status: ${res.statusCode}`);
      }).on('error', (err) => {
        console.error('[Keep-Alive] Ping failed:', err.message);
      });
    }, pingInterval);
    console.log(`[Keep-Alive] Self-ping enabled every 14 minutes -> ${RENDER_URL}/health`);
  }
});
