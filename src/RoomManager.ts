import { Server, Socket } from 'socket.io';
import { TarneebGame } from './engine/TarneebGame';
import { Player } from './engine/Player';
import crypto from 'crypto';

export class RoomManager {
  private rooms: Map<string, any[]> = new Map(); // roomCode -> players[]
  private games: Map<string, TarneebGame> = new Map(); // roomCode -> game instance
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private turnEndTimes: Map<string, number> = new Map();
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
    
    if (room.length === 4 && !this.games.has(targetRoom)) {
        const game = new TarneebGame();
        room.forEach(p => game.addPlayer(new Player(p.id, p.username)));
        game.startRound(this.globalTargetScore);
        this.games.set(targetRoom, game);
        this.io.to(targetRoom).emit('game_start', { message: 'بدأت اللعبة!' });
        this.broadcastGameState(targetRoom);
    }
  }

  public globalTargetScore: number = 39;
  public globalPrize: number = 100;

  handleGameEvent(socket: Socket, event: string, data: any) {
    // Admin Events
    if (event === 'admin_broadcast') {
      this.io.emit('global_alert', { message: data.message });
      return;
    } else if (event === 'admin_get_stats') {
      const totalPlayers = this.io.engine.clientsCount;
      socket.emit('admin_stats', { activeRooms: this.games.size, totalPlayers });
      return;
    } else if (event === 'admin_set_target_score') {
      this.globalTargetScore = data.targetScore;
      this.io.emit('global_alert', { message: `تم تحديث نقاط الفوز لتصبح: ${this.globalTargetScore}` });
      return;
    } else if (event === 'admin_set_prize') {
      this.globalPrize = data.prizeValue;
      this.io.emit('prize_update', { prizeValue: this.globalPrize });
      return;
    } else if (event === 'admin_test_room') {
      this.adminTestRoom(socket, data.username, data.uid);
      return;

    } else if (event === 'leave_room') {
       this.handleDisconnect(socket);
       return;
    }

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
      this.broadcastGameState(roomCode);
      this.checkTrickEnd(roomCode);
      return;
    } else if (event === 'play_again') {
      game.startRound(this.globalTargetScore);
    }

    this.broadcastGameState(roomCode);
  }

  private resetTimer(roomCode: string) {
    if (this.timers.has(roomCode)) {
      clearTimeout(this.timers.get(roomCode));
    }

    const game = this.games.get(roomCode);
    if (!game || game.state === 'FINISHED') {
      this.turnEndTimes.delete(roomCode);
      return;
    }

    const currentPlayer = game.players[game.currentTurnIndex];
    const isBot = currentPlayer && currentPlayer.id.startsWith('BOT_');
    const delay = isBot ? 1500 : 20000;

    const endTime = Date.now() + delay;
    this.turnEndTimes.set(roomCode, endTime);

    const timeout = setTimeout(() => {
      const g = this.games.get(roomCode);
      if (g && g.state !== 'FINISHED') {
        g.handleTimeout();
        this.broadcastGameState(roomCode);
        this.checkTrickEnd(roomCode);
      }
    }, delay);

    this.timers.set(roomCode, timeout);
  }

  private checkTrickEnd(roomCode: string) {
    const game = this.games.get(roomCode);
    if (game && game.state === 'TRICK_END') {
      setTimeout(() => {
        game.resolveTrick();
        this.broadcastGameState(roomCode);
      }, 1500);
    }
  }

  adminTestRoom(socket: Socket, username: string, uid: string) {
    const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    this.rooms.set(roomCode, []);
    socket.join(roomCode);
    
    const room = this.rooms.get(roomCode)!;
    room.push({ id: socket.id, username: username || "المدير" });
    room.push({ id: `BOT_1_${roomCode}`, username: "بوت 1 (أحمد)" });
    room.push({ id: `BOT_2_${roomCode}`, username: "بوت 2 (سالم)" });
    room.push({ id: `BOT_3_${roomCode}`, username: "بوت 3 (عمر)" });
    
    this.io.to(roomCode).emit('room_update', {
      roomCode,
      players: room
    });
    
    const game = new TarneebGame();
    room.forEach(p => game.addPlayer(new Player(p.id, p.username)));
    game.startRound(this.globalTargetScore);
    
    this.games.set(roomCode, game);
    this.io.to(roomCode).emit('game_start', { message: 'بدأت اللعبة!' });
    this.broadcastGameState(roomCode);
  }

  broadcastGameState(roomCode: string) {
    const game = this.games.get(roomCode);
    const players = this.rooms.get(roomCode);
    if (!game || !players) return;

    this.resetTimer(roomCode);
    const turnEndTime = this.turnEndTimes.get(roomCode);

    players.forEach((p, index) => {
      const state = {
        state: game.state,
        currentBid: game.currentBid,
        highestBidderIndex: game.highestBidderIndex,
        trumpSuit: game.trumpSuit,
        currentTurnIndex: game.currentTurnIndex,
        playerTricks: game.playerTricks,
        playerScores: game.playerScores,
        targetScore: game.targetScore,
        currentTrick: game.currentTrick,
        myIndex: index,
        myHand: game.players[index].cards,
        players: game.players.map(pl => ({ name: pl.name, cardCount: pl.cards.length })),
        turnEndTime
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
        
        if (this.games.has(roomCode)) {
           this.io.to(roomCode).emit('game_state_update', { state: 'PLAYER_DISCONNECTED' });
           this.games.delete(roomCode);
           if (this.timers.has(roomCode)) clearTimeout(this.timers.get(roomCode));
        }

        const humanPlayers = players.filter(p => !p.id.startsWith('BOT_'));
        if (humanPlayers.length === 0) {
          this.rooms.delete(roomCode);
          this.timers.delete(roomCode);
          this.turnEndTimes.delete(roomCode);
        }
        break;
      }
    }
  }


}
