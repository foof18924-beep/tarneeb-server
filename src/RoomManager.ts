import { Server, Socket } from 'socket.io';
import { TarneebGame } from './engine/TarneebGame';
import { Player } from './engine/Player';

export class RoomManager {
  private rooms: Map<string, any[]> = new Map(); // roomCode -> players[]
  private games: Map<string, TarneebGame> = new Map(); // roomCode -> game instance
  private io: Server;

  constructor(io: Server) {
    this.io = io;
  }

  joinRoom(socket: Socket, username: string, roomCode: string) {
    socket.join(roomCode);
    
    if (!this.rooms.has(roomCode)) {
      this.rooms.set(roomCode, []);
    }
    
    const room = this.rooms.get(roomCode)!;
    room.push({ id: socket.id, username });
    
    console.log(`${username} joined room ${roomCode}`);
    
    this.io.to(roomCode).emit('room_update', {
      roomCode,
      players: room
    });
  }

  autoMatch(socket: Socket, username: string, uid: string) {
    let targetRoom = '';
    // Find an existing room with < 4 players
    for (const [roomCode, players] of this.rooms.entries()) {
      if (players.length < 4) {
        targetRoom = roomCode;
        break;
      }
    }
    
    if (!targetRoom) {
      targetRoom = Math.random().toString(36).substring(2, 8).toUpperCase();
      this.rooms.set(targetRoom, []);
    }
    
    socket.join(targetRoom);
    const room = this.rooms.get(targetRoom)!;
    
    if (!room.find(p => p.id === socket.id)) {
        room.push({ id: socket.id, username, uid });
    }
    
    console.log(`${username} auto-matched into room ${targetRoom} (${room.length}/4)`);
    
    this.io.to(targetRoom).emit('room_update', {
      roomCode: targetRoom,
      players: room
    });
    
    // Start game when full
    if (room.length === 4 && !this.games.has(targetRoom)) {
        const game = new TarneebGame();
        room.forEach(p => game.addPlayer(new Player(p.id, p.username)));
        game.startRound();
        this.games.set(targetRoom, game);
        this.io.to(targetRoom).emit('game_start', { message: 'بدأت اللعبة!' });
        this.broadcastGameState(targetRoom);
    }
  }

  // Socket event handlers from index.ts will call these
  handleGameEvent(socket: Socket, event: string, data: any) {
    // Find which room this socket is in
    let roomCode = '';
    let playerIndex = -1;
    
    for (const [rc, players] of this.rooms.entries()) {
      const idx = players.findIndex(p => p.id === socket.id);
      if (idx !== -1) {
        roomCode = rc;
        playerIndex = idx;
        break;
      }
    }

    if (!roomCode || !this.games.has(roomCode)) return;
    
    const game = this.games.get(roomCode)!;

    if (event === 'place_bid') {
      game.placeBid(playerIndex, data.bid);
    } else if (event === 'select_trump') {
      game.selectTrump(playerIndex, data.suit);
    } else if (event === 'play_card') {
      game.playCard(playerIndex, data.cardIndex);
    }

    this.broadcastGameState(roomCode);
  }

  broadcastGameState(roomCode: string) {
    const game = this.games.get(roomCode);
    const players = this.rooms.get(roomCode);
    if (!game || !players) return;

    // Send customized state to each player
    players.forEach((p, index) => {
      const state = {
        state: game.state,
        currentBid: game.currentBid,
        highestBidderIndex: game.highestBidderIndex,
        trumpSuit: game.trumpSuit,
        currentTurnIndex: game.currentTurnIndex,
        team1Tricks: game.team1Tricks,
        team2Tricks: game.team2Tricks,
        team1Score: game.team1Score,
        team2Score: game.team2Score,
        currentTrick: game.currentTrick,
        myIndex: index,
        myHand: game.players[index].cards,
        players: game.players.map(pl => ({ name: pl.name, cardCount: pl.cards.length }))
      };
      
      this.io.to(p.id).emit('game_state_update', state);
    });
  }

  handleDisconnect(socket: Socket) {
    for (const [roomCode, players] of this.rooms.entries()) {
      const index = players.findIndex(p => p.id === socket.id);
      if (index !== -1) {
        players.splice(index, 1);
        this.io.to(roomCode).emit('room_update', {
          roomCode,
          players
        });
        
        // End game if someone leaves
        if (this.games.has(roomCode)) {
           this.io.to(roomCode).emit('game_state_update', { state: 'PLAYER_DISCONNECTED' });
           this.games.delete(roomCode);
        }

        if (players.length === 0) {
          this.rooms.delete(roomCode);
        }
        break;
      }
    }
  }
}
