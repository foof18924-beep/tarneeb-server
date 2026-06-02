import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { PlayingCard } from './Card';
import { Socket } from 'socket.io-client';
import { VoiceChatManager } from '../VoiceChatManager';

interface GameBoardProps {
  roomCode: string;
  players: any[];
  myUsername: string;
  gameState?: any;
  socket?: Socket;
}

const getAvatarGradient = (username: string) => {
  const hash = username.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const gradients = [
    'linear-gradient(135deg, #f6d365 0%, #fda085 100%)',
    'linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%)',
    'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
    'linear-gradient(135deg, #f857a6 0%, #ff5858 100%)',
    'linear-gradient(135deg, #a8ff78 0%, #78ffd6 100%)',
    'linear-gradient(135deg, #30cfd0 0%, #330867 100%)',
    'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    'linear-gradient(135deg, #ffb199 0%, #ff0844 100%)'
  ];
  return gradients[hash % gradients.length];
};

const getCounterRotation = (posClass: string) => {
  if (posClass.includes('player-left')) return 'rotate(-90deg)';
  if (posClass.includes('player-right')) return 'rotate(90deg)';
  return 'none';
};

const getTableStyle = (color: 'green' | 'red' | 'blue') => {
  if (color === 'red') {
    return {
      background: 'radial-gradient(circle at center, #800000 0%, #4a0000 100%)',
      border: '18px solid #d4af37'
    };
  }
  if (color === 'blue') {
    return {
      background: 'radial-gradient(circle at center, #0f2d59 0%, #06152b 100%)',
      border: '18px solid #1e293b'
    };
  }
  return {};
};

class CasinoBGMPlayer {
  private ctx: AudioContext | null = null;
  private isPlaying: boolean = false;
  private oscillators: OscillatorNode[] = [];
  private gainNode: GainNode | null = null;
  private timer: any = null;

  start() {
    if (this.isPlaying) return;
    try {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.gainNode = this.ctx.createGain();
      
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(300, this.ctx.currentTime);

      this.gainNode.connect(filter);
      filter.connect(this.ctx.destination);
      this.gainNode.gain.setValueAtTime(0.04, this.ctx.currentTime);

      this.isPlaying = true;
      let step = 0;
      const chords = [
        [130.81, 196.00, 261.63, 329.63], // C3, G3, C4, E4
        [174.61, 261.63, 349.23, 440.00], // F3, C4, F4, A4
        [220.00, 329.63, 440.00, 523.25], // A3, E4, A4, C5
        [196.00, 293.66, 392.00, 493.88]  // G3, D4, G4, B4
      ];

      const playChord = () => {
        if (!this.isPlaying || !this.ctx || !this.gainNode) return;
        
        this.oscillators.forEach(osc => {
          try { osc.stop(); } catch(e) {}
        });
        this.oscillators = [];

        const now = this.ctx.currentTime;
        
        this.gainNode.gain.cancelScheduledValues(now);
        this.gainNode.gain.setValueAtTime(0, now);
        this.gainNode.gain.linearRampToValueAtTime(0.04, now + 1.5);
        this.gainNode.gain.setValueAtTime(0.04, now + 3.5);
        this.gainNode.gain.linearRampToValueAtTime(0, now + 5.0);

        const freqList = chords[step % chords.length];
        freqList.forEach(freq => {
          const osc = this.ctx!.createOscillator();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now);
          osc.connect(this.gainNode!);
          osc.start(now);
          this.oscillators.push(osc);
        });

        step++;
        this.timer = setTimeout(playChord, 5000);
      };

      playChord();
    } catch(e) {
      console.error("Failed to start BGM Synth", e);
    }
  }

  stop() {
    this.isPlaying = false;
    if (this.timer) clearTimeout(this.timer);
    this.oscillators.forEach(osc => {
      try { osc.stop(); } catch(e) {}
    });
    this.oscillators = [];
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
  }
}

export const GameBoard: React.FC<GameBoardProps> = ({ roomCode, players, myUsername, gameState, socket }) => {
  const { t } = useTranslation();
  const isMyTurn = gameState && gameState.currentTurnIndex === gameState.myIndex;
  const [timeLeft, setTimeLeft] = useState(20);
  const [delayedTrick, setDelayedTrick] = useState<any[]>([]);
  const [trickWinnerIndex, setTrickWinnerIndex] = useState<number | null>(null);

  // Scoreboard drag state
  const [scorePos, setScorePos] = useState({ x: 0, y: 10 });
  const scoreDragRef = useRef({ isDragging: false, startX: 0, startY: 0, initialX: 0, initialY: 0 });

  // Emoji states
  const [activePickerIndex, setActivePickerIndex] = useState<number | null>(null);
  const [activeEmojis, setActiveEmojis] = useState<any[]>([]);

  // Chat Bubble states
  const [activeChatBubbles, setActiveChatBubbles] = useState<any[]>([]);

  // Trump overlay states
  const [showTrumpOverlay, setShowTrumpOverlay] = useState<string | null>(null);
  const prevTrumpSuitRef = useRef<string | null>(null);

  // Settings and BGM states
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [tableColor, setTableColor] = useState<'green' | 'red' | 'blue'>('green');
  const [isBgmOn, setIsBgmOn] = useState(false);
  const bgmPlayerRef = useRef<CasinoBGMPlayer | null>(null);

  useEffect(() => {
    if (isBgmOn) {
      if (!bgmPlayerRef.current) {
        bgmPlayerRef.current = new CasinoBGMPlayer();
      }
      bgmPlayerRef.current.start();
    } else {
      if (bgmPlayerRef.current) {
        bgmPlayerRef.current.stop();
        bgmPlayerRef.current = null;
      }
    }
    return () => {
      if (bgmPlayerRef.current) {
        bgmPlayerRef.current.stop();
      }
    };
  }, [isBgmOn]);

  // Dealing animation state
  const [animateDeal, setAnimateDeal] = useState(false);
  const prevHandLengthRef = useRef(0);
  const prevRoundStateRef = useRef('');

  // Voice Chat
  const [remoteStreams, setRemoteStreams] = useState<{ [peerId: string]: MediaStream }>({});
  const [isMicMuted, setIsMicMuted] = useState(true);
  const voiceManagerRef = useRef<VoiceChatManager | null>(null);

  // Draggable Mic
  const [micOffset, setMicOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef({ isDragging: false, startX: 0, startY: 0, initialOffsetX: 0, initialOffsetY: 0, hasMoved: false });

  useEffect(() => {
    if (socket && !voiceManagerRef.current) {
      voiceManagerRef.current = new VoiceChatManager(
        (peerId, stream) => setRemoteStreams(prev => ({ ...prev, [peerId]: stream })),
        (peerId) => setRemoteStreams(prev => {
          const next = { ...prev };
          delete next[peerId];
          return next;
        })
      );
      voiceManagerRef.current.initialize(socket);
    }
  }, [socket]);

  useEffect(() => {
    if (players && players.length > 0 && voiceManagerRef.current) {
       const pIds = players.map(p => p.id);
       voiceManagerRef.current.connectToPeers(pIds);
    }
  }, [players]);

  useEffect(() => {
    return () => {
      voiceManagerRef.current?.disconnectAll();
    };
  }, []);

  const handleMicClick = () => {
    if (dragRef.current.hasMoved) return; // Prevent click if we were dragging
    if (voiceManagerRef.current) {
      const muted = voiceManagerRef.current.toggleMute();
      setIsMicMuted(muted);
    }
  };

  const handleDragStart = (e: React.TouchEvent | React.MouseEvent) => {
    dragRef.current.isDragging = true;
    dragRef.current.hasMoved = false;
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    dragRef.current.startX = clientX;
    dragRef.current.startY = clientY;
    dragRef.current.initialOffsetX = micOffset.x;
    dragRef.current.initialOffsetY = micOffset.y;
  };

  const handleDragMove = (e: TouchEvent | MouseEvent) => {
    if (!dragRef.current.isDragging) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
    
    const dx = clientX - dragRef.current.startX;
    const dy = clientY - dragRef.current.startY;
    
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      dragRef.current.hasMoved = true;
    }

    const isPortrait = window.innerHeight > window.innerWidth;
    if (isPortrait) {
      setMicOffset({
        x: dragRef.current.initialOffsetX + dy,
        y: dragRef.current.initialOffsetY - dx
      });
    } else {
      setMicOffset({
        x: dragRef.current.initialOffsetX + dx,
        y: dragRef.current.initialOffsetY + dy
      });
    }
  };

  const handleDragEnd = () => {
    dragRef.current.isDragging = false;
  };

  // Scoreboard Drag Handlers
  const handleScoreDragStart = (e: React.TouchEvent | React.MouseEvent) => {
    scoreDragRef.current.isDragging = true;
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    scoreDragRef.current.startX = clientX;
    scoreDragRef.current.startY = clientY;
    scoreDragRef.current.initialX = scorePos.x;
    scoreDragRef.current.initialY = scorePos.y;
  };

  const handleScoreDragMove = (e: TouchEvent | MouseEvent) => {
    if (!scoreDragRef.current.isDragging) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
    
    const dx = clientX - scoreDragRef.current.startX;
    const dy = clientY - scoreDragRef.current.startY;
    
    const isPortrait = window.innerHeight > window.innerWidth;
    if (isPortrait) {
      setScorePos({
        x: scoreDragRef.current.initialX + dy,
        y: scoreDragRef.current.initialY - dx
      });
    } else {
      setScorePos({
        x: scoreDragRef.current.initialX + dx,
        y: scoreDragRef.current.initialY + dy
      });
    }
  };

  const handleScoreDragEnd = () => {
    scoreDragRef.current.isDragging = false;
  };

  // Combined effect for mouse/touch interactions
  useEffect(() => {
    const onMove = (e: TouchEvent | MouseEvent) => {
      handleDragMove(e);
      handleScoreDragMove(e);
    };
    const onEnd = () => {
      handleDragEnd();
      handleScoreDragEnd();
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };
  }, []);

  // Sound Synth
  const playSound = (type: 'tick' | 'throw') => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      if (type === 'tick') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, ctx.currentTime);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
      } else if (type === 'throw') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(300, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
      }
    } catch(e) {}
  };

  const getTrickWinner = (trick: any[], trumpSuit: string) => {
    if (!trick || trick.length === 0) return null;
    const leadSuit = trick[0].card.suit;
    let winningPlay = trick[0];

    const getCardValue = (rank: string) => {
      const values: any = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
      return values[rank] || 0;
    };

    for (let i = 1; i < trick.length; i++) {
      const play = trick[i];
      const currentWinningCard = winningPlay.card;
      const playedCard = play.card;
      
      const pVal = getCardValue(playedCard.rank);
      const wVal = getCardValue(currentWinningCard.rank);

      if (playedCard.suit === trumpSuit) {
        if (currentWinningCard.suit !== trumpSuit) {
          winningPlay = play;
        } else if (pVal > wVal) {
          winningPlay = play;
        }
      } else if (playedCard.suit === leadSuit && currentWinningCard.suit !== trumpSuit) {
        if (pVal > wVal) {
          winningPlay = play;
        }
      }
    }
    return winningPlay.playerIndex;
  };

  useEffect(() => {
    if (gameState && gameState.currentTrick) {
      if (gameState.currentTrick.length === 0 && delayedTrick.length === 4) {
        // Trick ended
        const winner = getTrickWinner(delayedTrick, gameState.trumpSuit);
        const animTimer = setTimeout(() => setTrickWinnerIndex(winner), 800);
        const clearTimer = setTimeout(() => {
           setDelayedTrick([]);
           setTrickWinnerIndex(null);
        }, 1500);
        return () => { clearTimeout(animTimer); clearTimeout(clearTimer); };
      } else {
        setDelayedTrick(gameState.currentTrick);
        setTrickWinnerIndex(null);
      }
    }
  }, [gameState]);

  useEffect(() => {
    if (gameState && gameState.turnEndTime && gameState.state !== 'FINISHED') {
      const interval = setInterval(() => {
        const remaining = Math.max(0, Math.floor((gameState.turnEndTime - Date.now()) / 1000));
        setTimeLeft(remaining);
        if (remaining > 0 && remaining <= 5 && isMyTurn) playSound('tick');
      }, 500);
      return () => clearInterval(interval);
    }
  }, [gameState, isMyTurn]);

  useEffect(() => {
    if (gameState && gameState.state === 'FINISHED') {
      const maxScore = Math.max(...gameState.playerScores);
      const winnerIndex = gameState.playerScores.findIndex((s: number) => s === maxScore);

      import('../firebase').then(({ db, auth }) => {
        import('firebase/firestore').then(({ doc, updateDoc, increment, addDoc, collection, serverTimestamp }) => {
          // If this player is the winner, record in the global winners log
          if (winnerIndex === gameState.myIndex) {
             addDoc(collection(db, 'winners'), {
               username: myUsername,
               score: maxScore,
               timestamp: serverTimestamp()
             }).catch(e => console.error(e));
          }
          // Everyone adds their score to their overall points for the leaderboard
          if (auth.currentUser) {
             const userPoints = gameState.playerScores[gameState.myIndex];
             updateDoc(doc(db, 'users', auth.currentUser.uid), { points: increment(userPoints) }).catch(e => console.error(e));
          }
        });
      });
    }
  }, [gameState?.state]);

  // Trigger dealing animation when state switches to BIDDING or hand increases to 13 cards
  useEffect(() => {
    if (gameState) {
      const currentHandLength = gameState.myHand ? gameState.myHand.length : 0;
      if (
        (gameState.state === 'BIDDING' && prevRoundStateRef.current !== 'BIDDING') ||
        (currentHandLength > prevHandLengthRef.current && currentHandLength === 13)
      ) {
        setAnimateDeal(true);
        const timer = setTimeout(() => setAnimateDeal(false), 3000);
        return () => clearTimeout(timer);
      }
      prevHandLengthRef.current = currentHandLength;
      prevRoundStateRef.current = gameState.state;
    }
  }, [gameState]);

  // Socket listeners for emoji and chat bubbles
  useEffect(() => {
    if (socket) {
      const handleEmoji = (data: any) => {
        triggerFloatingEmoji(data.senderIndex, data.targetIndex, data.emoji);
      };
      const handleChatBubble = (data: any) => {
        triggerChatBubble(data.senderIndex, data.text);
      };
      
      socket.on('emoji_received', handleEmoji);
      socket.on('chat_bubble_received', handleChatBubble);
      
      return () => {
        socket.off('emoji_received', handleEmoji);
        socket.off('chat_bubble_received', handleChatBubble);
      };
    }
  }, [socket]);

  const triggerChatBubble = (senderIndex: number, text: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setActiveChatBubbles(prev => [...prev, { id, senderIndex, text }]);
    setTimeout(() => {
      setActiveChatBubbles(prev => prev.filter(b => b.id !== id));
    }, 3500);
  };

  const sendChatBubble = (text: string) => {
    if (socket && gameState) {
      socket.emit('send_chat_bubble', {
        roomCode,
        senderIndex: gameState.myIndex,
        text
      });
      triggerChatBubble(gameState.myIndex, text);
    }
  };

  // Trump suit selection popup overlay trigger
  useEffect(() => {
    if (gameState && gameState.trumpSuit && gameState.state === 'PLAYING') {
      if (prevTrumpSuitRef.current !== gameState.trumpSuit) {
        setShowTrumpOverlay(gameState.trumpSuit);
        const timer = setTimeout(() => setShowTrumpOverlay(null), 2500);
        return () => clearTimeout(timer);
      }
    }
    if (gameState) {
      prevTrumpSuitRef.current = gameState.trumpSuit;
    }
  }, [gameState?.trumpSuit, gameState?.state]);

  // Close emoji picker on clicking outside
  useEffect(() => {
    const handleOutsideClick = () => {
      setActivePickerIndex(null);
    };
    window.addEventListener('click', handleOutsideClick);
    return () => {
      window.removeEventListener('click', handleOutsideClick);
    };
  }, []);

  const triggerFloatingEmoji = (senderIndex: number, targetIndex: number, emoji: string) => {
    const container = document.querySelector('.game-container');
    const senderEl = document.querySelector(`.player-name-pos-${senderIndex}`);
    const targetEl = document.querySelector(`.player-name-pos-${targetIndex}`);

    if (container && senderEl && targetEl) {
      const containerRect = container.getBoundingClientRect();
      const senderRect = senderEl.getBoundingClientRect();
      const targetRect = targetEl.getBoundingClientRect();

      let x1 = senderRect.left + senderRect.width / 2;
      let y1 = senderRect.top + senderRect.height / 2;
      let x2 = targetRect.left + targetRect.width / 2;
      let y2 = targetRect.top + targetRect.height / 2;

      const isPortrait = window.innerHeight > window.innerWidth;
      if (isPortrait) {
        const W = window.innerWidth;
        const x1_local = y1;
        const y1_local = W - x1;
        const x2_local = y2;
        const y2_local = W - x2;

        x1 = x1_local;
        y1 = y1_local;
        x2 = x2_local;
        y2 = y2_local;
      } else {
        x1 = x1 - containerRect.left;
        y1 = y1 - containerRect.top;
        x2 = x2 - containerRect.left;
        y2 = y2 - containerRect.top;
      }

      const id = Math.random().toString(36).substring(2, 9);
      setActiveEmojis(prev => [...prev, { id, emoji, senderIndex, targetIndex, x1, y1, x2, y2, phase: 'flying' }]);

      if (emoji === '🍅') {
        setTimeout(() => {
          setActiveEmojis(prev => prev.map(e => e.id === id ? { ...e, phase: 'splat' } : e));
          setTimeout(() => {
            setActiveEmojis(prev => prev.filter(e => e.id !== id));
          }, 600);
        }, 800);
      } else {
        setTimeout(() => {
          setActiveEmojis(prev => prev.filter(e => e.id !== id));
        }, 1000);
      }
    }
  };

  const sendEmoji = (targetIndex: number, emoji: string) => {
    if (socket && gameState) {
      socket.emit('send_emoji', {
        roomCode,
        senderIndex: gameState.myIndex,
        targetIndex,
        emoji
      });
      triggerFloatingEmoji(gameState.myIndex, targetIndex, emoji);
    }
  };

  const handlePlaceBid = (bid: number | 'PASS') => {
    if (socket) socket.emit('place_bid', { bid });
  };

  const handleSelectTrump = (suit: string) => {
    if (socket) socket.emit('select_trump', { suit });
  };

  const handlePlayCard = (cardIndex: number) => {
    if (socket && isMyTurn && gameState.state === 'PLAYING') {
      socket.emit('play_card', { cardIndex });
    }
  };

  const handlePlayAgain = () => {
    if (socket) socket.emit('play_again', {});
  };

  const getPositionClass = (idx: number, myIndex: number) => {
    if (idx === myIndex) return "player-bottom";
    const diff = (idx - myIndex + 4) % 4;
    if (diff === 1) return "player-right";
    if (diff === 2) return "player-top";
    if (diff === 3) return "player-left";
    return "player-top";
  };

  if (!gameState) {
    return (
      <div className="game-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle at center, #1a2a6c, #112240, #0a192f)', padding: '10px' }}>
         <h1 style={{ color: '#f1c40f', fontSize: '24px', marginBottom: '15px', textShadow: '0 3px 10px rgba(0,0,0,0.5)', marginTop: '5px' }}>{t('waiting_room')} ({players.length}/4)</h1>
         <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '10px', width: '95%', maxWidth: '500px', marginBottom: '20px' }}>
            {players.map((p, idx) => (
              <div key={idx} style={{ background: 'rgba(255,255,255,0.08)', backdropFilter: 'blur(8px)', padding: '10px 16px', borderRadius: '12px', color: 'white', borderLeft: '4px solid #2ecc71', fontSize: '14px', fontWeight: 'bold', display: 'flex', alignItems: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', minWidth: '130px', justifyContent: 'flex-start' }}>
                <span style={{ fontSize: '18px', marginRight: '8px' }}>👤</span> <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100px' }}>{p.username}</span> {p.id === socket?.id && <span style={{ color: '#f1c40f', fontSize: '10px', marginLeft: '4px' }}>({t('you')})</span>}
              </div>
            ))}
         </div>
         <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
           <div className="spinner" style={{ width: '35px', height: '35px', border: '4px solid rgba(255,255,255,0.1)', borderTop: '4px solid #f1c40f', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
           <p style={{ color: '#aaa', margin: 0, fontSize: '13px' }}>{t('waiting_players')}</p>
         </div>
         <style>{`
           @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
         `}</style>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Hidden audio tags for peers */}
      {Object.entries(remoteStreams).map(([peerId, stream]) => (
        <audio key={peerId} autoPlay ref={el => { if (el && el.srcObject !== stream) el.srcObject = stream; }} />
      ))}
      <div className="game-container">
        <div className="poker-table" style={getTableStyle(tableColor)}>
          
          {/* Settings Button */}
          <button 
             onClick={() => setIsSettingsOpen(true)} 
             style={{
               position: 'absolute', top: '20px', right: '20px', zIndex: 1000,
               background: 'rgba(15, 23, 42, 0.75)', color: '#f1c40f',
               border: '1px solid rgba(241, 196, 15, 0.3)', borderRadius: '50%', width: '45px', height: '45px',
               fontSize: '22px', cursor: 'pointer', boxShadow: '0 4px 10px rgba(0,0,0,0.5)',
               display: 'flex', alignItems: 'center', justifyContent: 'center',
               backdropFilter: 'blur(8px)'
             }}>
            ⚙️
          </button>

          {/* Settings Modal */}
          {isSettingsOpen && (
            <div 
              style={{
                position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
                display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000
              }}
              onClick={() => setIsSettingsOpen(false)}
            >
              <div 
                style={{
                  background: 'rgba(15, 23, 42, 0.95)', border: '1px solid rgba(241, 196, 15, 0.4)',
                  borderRadius: '20px', padding: '20px 25px', width: '90%', maxWidth: '320px',
                  boxShadow: '0 15px 35px rgba(0,0,0,0.6)', textAlign: 'center',
                  display: 'flex', flexDirection: 'column', gap: '15px'
                }}
                onClick={e => e.stopPropagation()}
              >
                <h3 style={{ color: '#f1c40f', margin: '0 0 5px 0', fontSize: '18px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px' }}>إعدادات الطاولة</h3>
                
                {/* Table Color Selection */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', textAlign: 'right' }}>
                  <span style={{ color: '#aaa', fontSize: '12px' }}>لون قماش الطاولة:</span>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '15px', marginTop: '4px' }}>
                    {[
                      { name: 'green', color: '#0f5132', label: 'كلاسيكي' },
                      { name: 'red', color: '#800000', label: 'VIP ملكي' },
                      { name: 'blue', color: '#0f2d59', label: 'ليلي' }
                    ].map(opt => (
                      <button
                        key={opt.name}
                        onClick={() => setTableColor(opt.name as any)}
                        style={{
                          background: opt.color,
                          border: tableColor === opt.name ? '3px solid #f1c40f' : '1.5px solid rgba(255,255,255,0.3)',
                          width: '45px', height: '45px', borderRadius: '50%', cursor: 'pointer',
                          boxShadow: '0 4px 8px rgba(0,0,0,0.4)', transition: 'transform 0.2s',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white',
                          fontSize: '9px', fontWeight: 'bold'
                        }}
                        onMouseDown={e => e.currentTarget.style.transform='scale(0.9)'}
                        onMouseUp={e => e.currentTarget.style.transform='scale(1)'}
                        title={opt.label}
                      >
                        {tableColor === opt.name ? '✓' : ''}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-around', fontSize: '10px', color: '#ccc' }}>
                    <span>كلاسيكي</span>
                    <span>VIP ملكي</span>
                    <span>أزرق ليلي</span>
                  </div>
                </div>
                
                {/* Separator */}
                <div style={{ height: '1px', background: 'rgba(255,255,255,0.1)' }} />
                
                {/* Music Toggle */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button
                    onClick={() => setIsBgmOn(!isBgmOn)}
                    style={{
                      background: isBgmOn ? '#2ecc71' : 'rgba(255,255,255,0.1)',
                      border: '1px solid rgba(255,255,255,0.2)',
                      borderRadius: '8px', padding: '6px 12px', color: 'white',
                      fontSize: '12px', fontWeight: 'bold', cursor: 'pointer',
                      transition: 'background 0.2s'
                    }}
                  >
                    {isBgmOn ? 'تشغيل 🔊' : 'إيقاف 🔇'}
                  </button>
                  <span style={{ color: '#aaa', fontSize: '12px', textAlign: 'right' }}>الموسيقى الخلفية:</span>
                </div>
                
                {/* Close Button */}
                <button 
                  onClick={() => setIsSettingsOpen(false)}
                  style={{
                    background: 'linear-gradient(135deg, #f39c12, #e67e22)',
                    border: 'none', borderRadius: '8px', padding: '10px',
                    color: 'white', fontWeight: 'bold', fontSize: '14px',
                    cursor: 'pointer', marginTop: '10px', boxShadow: '0 4px 10px rgba(230, 126, 34, 0.3)'
                  }}
                >
                  حفظ وإغلاق
                </button>
              </div>
            </div>
          )}

          {/* Voice Chat Toggle Button */}
          <button 
             onMouseDown={handleDragStart}
             onTouchStart={handleDragStart}
             onClick={handleMicClick} 
             style={{
               position: 'absolute', bottom: '20px', right: '20px', zIndex: 1000,
               transform: `translate(${micOffset.x}px, ${micOffset.y}px)`,
               background: isMicMuted ? '#ef4444' : '#2ecc71', color: 'white',
               border: 'none', borderRadius: '50%', width: '50px', height: '50px',
               fontSize: '24px', cursor: 'grab', boxShadow: '0 4px 10px rgba(0,0,0,0.5)',
               display: 'flex', alignItems: 'center', justifyContent: 'center',
               touchAction: 'none'
             }}>
            {isMicMuted ? '🔇' : '🎤'}
          </button>

          {/* Draggable Scoreboard */}
          <div 
             onMouseDown={handleScoreDragStart}
             onTouchStart={handleScoreDragStart}
             className="draggable-scoreboard"
             style={{ 
               position: 'absolute', 
               top: `${scorePos.y}px`, 
               left: `calc(50% + ${scorePos.x}px)`, 
               transform: 'translateX(-50%)', 
               width: '280px', 
               maxWidth: '95%', 
               zIndex: 950, 
               display: 'flex', 
               flexDirection: 'column',
               background: 'rgba(15, 23, 42, 0.75)', 
               backdropFilter: 'blur(12px)',
               border: '1px solid rgba(241, 196, 15, 0.35)',
               borderRadius: '12px',
               padding: '4px 8px',
               boxShadow: '0 6px 20px rgba(0, 0, 0, 0.5)',
               cursor: 'grab',
               userSelect: 'none',
               touchAction: 'none'
             }}
          >
             {/* Drag Handle Indicator */}
             <div style={{ width: '30px', height: '3px', background: 'rgba(255,255,255,0.2)', borderRadius: '1.5px', alignSelf: 'center', marginBottom: '4px' }}></div>
             
             <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', gap: '8px', width: '100%' }}>
                {gameState && gameState.gameMode === 'PARTNERSHIP' ? (
                  <>
                    {/* Team A (Your Team) - scores are shared between partners */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: '9.5px', color: 'white', lineHeight: '1.1', flex: 1 }}>
                       <span style={{ color: '#2ecc71', fontWeight: 'bold', whiteSpace: 'nowrap' }}>فريقك</span>
                       <span style={{ color: '#aaa', fontSize: '7.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100px', marginTop: '1px' }}>
                         {gameState.players[gameState.myIndex].name.split(' ')[0]} + {gameState.players[(gameState.myIndex + 2) % 4].name.split(' ')[0]}
                       </span>
                       <span style={{color: '#f1c40f', fontWeight: 'bold', fontSize: '10.5px', marginTop: '2px'}}>
                         {gameState.playerScores[gameState.myIndex]} <span style={{color: '#ccc', fontSize: '8px', fontWeight: 'normal'}}>({gameState.playerTricks[gameState.myIndex] + gameState.playerTricks[(gameState.myIndex + 2) % 4]}أوراق)</span>
                       </span>
                    </div>

                    {/* Divider */}
                    <div style={{ width: '1px', height: '22px', background: 'rgba(255,255,255,0.1)' }} />

                    {/* Team B (Opponents) */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: '9.5px', color: 'white', lineHeight: '1.1', flex: 1 }}>
                       <span style={{ color: '#e74c3c', fontWeight: 'bold', whiteSpace: 'nowrap' }}>الخصم</span>
                       <span style={{ color: '#aaa', fontSize: '7.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100px', marginTop: '1px' }}>
                         {gameState.players[(gameState.myIndex + 1) % 4].name.split(' ')[0]} + {gameState.players[(gameState.myIndex + 3) % 4].name.split(' ')[0]}
                       </span>
                       <span style={{color: '#f1c40f', fontWeight: 'bold', fontSize: '10.5px', marginTop: '2px'}}>
                         {gameState.playerScores[(gameState.myIndex + 1) % 4]} <span style={{color: '#ccc', fontSize: '8px', fontWeight: 'normal'}}>({gameState.playerTricks[(gameState.myIndex + 1) % 4] + gameState.playerTricks[(gameState.myIndex + 3) % 4]}أوراق)</span>
                       </span>
                    </div>
                  </>
                ) : (
                  gameState && gameState.players.map((p: any, idx: number) => (
                    <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: '9.5px', color: 'white', lineHeight: '1.1' }}>
                       <span style={{ color: idx === gameState.myIndex ? '#2ecc71' : '#aaa', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '55px' }}>{p.name.split(' ')[0]}</span>
                       <span style={{color: '#f1c40f', fontWeight: 'bold', fontSize: '10.5px'}}>
                         {gameState.playerScores[idx]} <span style={{color: '#ccc', fontSize: '8px', fontWeight: 'normal'}}>({gameState.playerTricks[idx]})</span>
                       </span>
                    </div>
                  ))
                )}
                {gameState && gameState.state !== 'WAITING' && (
                  <div style={{ fontSize: '9.5px', color: 'white', fontWeight: 'bold', padding: '2px 5px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', display: 'flex', gap: '3px', alignItems: 'center' }}>
                     {gameState.currentBid > 0 && <span>الطلب: <span style={{color: '#3498db'}}>{gameState.currentBid}</span></span>}
                     {gameState.trumpSuit && (
                       <span style={{color: ['Hearts','Diamonds'].includes(gameState.trumpSuit) ? '#e74c3c' : 'white', fontSize: '11px', lineHeight: '1'}}>
                         {gameState.trumpSuit === 'Hearts' ? '♥' : gameState.trumpSuit === 'Diamonds' ? '♦' : gameState.trumpSuit === 'Clubs' ? '♣' : '♠'}
                       </span>
                     )}
                  </div>
                )}
             </div>
          </div>

          {/* Finished UI */}
          {gameState && gameState.state === 'FINISHED' && (
            <div style={{ position: 'absolute', zIndex: 100, top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: 'rgba(15, 23, 42, 0.9)', padding: '40px', borderRadius: '20px', textAlign: 'center', border: '2px solid #f1c40f', boxShadow: '0 10px 50px rgba(0,0,0,0.8)', minWidth: '300px' }}>
              <h1 style={{ color: '#f1c40f', fontSize: '48px', marginBottom: '10px', textShadow: '2px 2px 4px black' }}>{t('game_over')}</h1>
              {(() => {
                let winnerIdx = 0;
                let winnerName = '';
                if (gameState.gameMode === 'PARTNERSHIP') {
                  // In partnership, compare team totals (players 0+2 vs 1+3)
                  const teamAScore = gameState.playerScores[0] + gameState.playerScores[2];
                  const teamBScore = gameState.playerScores[1] + gameState.playerScores[3];
                  winnerIdx = teamAScore >= teamBScore ? 0 : 1;
                  const partnerIdx = (winnerIdx + 2) % 4;
                  winnerName = `${gameState.players[winnerIdx].name} و ${gameState.players[partnerIdx].name}`;
                } else {
                  const maxScore = Math.max(...gameState.playerScores);
                  winnerIdx = gameState.playerScores.findIndex((s: number) => s === maxScore);
                  winnerName = gameState.players[winnerIdx].name;
                }

                return (
                  <>
                    <h2 style={{ color: 'white', marginBottom: '30px' }}>
                      {t('winner_is')}
                      <span style={{ color: '#2ecc71' }}>{winnerName}</span>
                    </h2>
                    <div style={{ display: 'flex', gap: '20px', marginBottom: '30px', flexWrap: 'wrap', justifyContent: 'center' }}>
                      {gameState.players.map((p: any, idx: number) => {
                        const isWinner = gameState.gameMode === 'PARTNERSHIP'
                          ? (idx === winnerIdx || idx === (winnerIdx + 2) % 4)
                          : (idx === winnerIdx);
                          
                        return (
                          <div key={idx} style={{ background: 'rgba(255,255,255,0.1)', padding: '15px', borderRadius: '10px', textAlign: 'center', border: isWinner ? '2px solid #f1c40f' : '1px solid transparent' }}>
                             <div style={{ color: '#aaa', fontSize: '18px' }}>{p.name}</div>
                             <div style={{ color: 'white', fontSize: '24px', fontWeight: 'bold' }}>{gameState.playerScores[idx]}</div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
              <button onClick={handlePlayAgain} style={{ padding: '15px 40px', fontSize: '24px', background: '#2ecc71', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', boxShadow: '0 5px 15px rgba(46,204,113,0.4)' }}>{t('play_again')}</button>
            </div>
          )}

          {/* Bidding UI (Professional) */}
          {gameState && gameState.state === 'BIDDING' && isMyTurn && (
            <div style={{ position: 'absolute', zIndex: 1000, top: '25%', left: '50%', transform: 'translate(-50%, -50%)', background: 'rgba(15, 23, 42, 0.9)', backdropFilter: 'blur(10px)', padding: '15px', borderRadius: '16px', textAlign: 'center', border: '1px solid rgba(59, 130, 246, 0.5)', boxShadow: '0 10px 30px rgba(0,0,0,0.6)', width: '95%', maxWidth: '380px' }}>
              <h3 style={{ color: 'white', fontSize: '16px', margin: '0 0 6px 0' }}>{t('choose_bid')}</h3>
              <div style={{ color: '#ef4444', fontSize: '13px', fontWeight: 'bold', marginBottom: '10px' }}>⏳ {timeLeft} {t('seconds')}</div>
              
              <div style={{ display: 'flex', justifyContent: 'center', gap: '4px', marginBottom: '10px', overflowX: 'auto', paddingBottom: '4px', width: '100%' }}>
                {(gameState.gameMode === 'PARTNERSHIP' ? [7, 8, 9, 10, 11, 12, 13] : [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]).map(b => (
                   <button key={b} onClick={() => handlePlaceBid(b)} disabled={b <= gameState.currentBid} style={{ padding: '6px 8px', background: b <= gameState.currentBid ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, #3b82f6, #2563eb)', color: b <= gameState.currentBid ? '#555' : 'white', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', cursor: b <= gameState.currentBid ? 'not-allowed' : 'pointer', transition: 'transform 0.1s' }} onMouseDown={(e) => e.currentTarget.style.transform='scale(0.92)'} onMouseUp={(e) => e.currentTarget.style.transform='scale(1)'}>
                      {b}
                   </button>
                ))}
              </div>
              <button onClick={() => handlePlaceBid('PASS')} style={{ width: '100%', padding: '8px', background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '6px', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer', transition: 'background 0.2s' }}>
                 {t('pass')}
              </button>
            </div>
          )}

          {/* Waiting for other player to bid */}
          {gameState && gameState.state === 'BIDDING' && !isMyTurn && (
            <div style={{ position: 'absolute', zIndex: 999, bottom: '30%', left: '50%', transform: 'translateX(-50%)', background: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(8px)', padding: '8px 16px', borderRadius: '12px', textAlign: 'center', border: '1px solid rgba(255,255,255,0.1)' }}>
              <p style={{ color: '#aaa', margin: 0, fontSize: '12px' }}>
                ⏳ بانتظار {gameState.players[gameState.currentTurnIndex]?.name.split(' ')[0]} ليزايد...
              </p>
            </div>
          )}

          {/* Trump Suit Selection UI */}
          {gameState && gameState.state === 'SELECTING_TRUMP' && isMyTurn && (
            <div style={{ position: 'absolute', zIndex: 1000, top: '25%', left: '50%', transform: 'translate(-50%, -50%)', background: 'rgba(15, 23, 42, 0.9)', backdropFilter: 'blur(10px)', padding: '20px', borderRadius: '16px', textAlign: 'center', border: '1px solid rgba(241, 196, 15, 0.5)', boxShadow: '0 10px 30px rgba(0,0,0,0.6)', width: '95%', maxWidth: '380px' }}>
              <h3 style={{ color: 'white', fontSize: '16px', margin: '0 0 6px 0' }}>{t('select_trump')}</h3>
              <div style={{ color: '#ef4444', fontSize: '13px', fontWeight: 'bold', marginBottom: '15px' }}>⏳ {timeLeft} {t('seconds')}</div>
              
              <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginBottom: '10px' }}>
                {[
                  { name: 'Hearts', char: '♥', color: '#e74c3c', label: 'كبة' },
                  { name: 'Diamonds', char: '♦', color: '#e74c3c', label: 'ديناري' },
                  { name: 'Clubs', char: '♣', color: 'white', label: 'سباتي' },
                  { name: 'Spades', char: '♠', color: 'white', label: 'باص' }
                ].map(suit => (
                  <button 
                    key={suit.name} 
                    onClick={() => handleSelectTrump(suit.name)} 
                    style={{ 
                      padding: '12px 18px', 
                      background: 'rgba(255, 255, 255, 0.08)', 
                      color: suit.color, 
                      border: '1px solid rgba(255,255,255,0.15)', 
                      borderRadius: '10px', 
                      fontSize: '24px', 
                      cursor: 'pointer', 
                      transition: 'transform 0.1s, background 0.2s',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '4px',
                      minWidth: '70px'
                    }} 
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                    onMouseDown={(e) => e.currentTarget.style.transform='scale(0.92)'} 
                    onMouseUp={(e) => e.currentTarget.style.transform='scale(1)'}
                  >
                    <span>{suit.char}</span>
                    <span style={{ fontSize: '11px', color: '#ccc' }}>{suit.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Waiting for Trump Selection UI */}
          {gameState && gameState.state === 'SELECTING_TRUMP' && !isMyTurn && (
            <div style={{ position: 'absolute', zIndex: 1000, top: '25%', left: '50%', transform: 'translate(-50%, -50%)', background: 'rgba(15, 23, 42, 0.9)', backdropFilter: 'blur(10px)', padding: '20px', borderRadius: '16px', textAlign: 'center', border: '1px solid rgba(255, 255, 255, 0.1)', boxShadow: '0 10px 30px rgba(0,0,0,0.6)', width: '90%', maxWidth: '320px' }}>
              <div className="spinner" style={{ width: '25px', height: '25px', border: '3px solid rgba(255,255,255,0.1)', borderTop: '3px solid #f1c40f', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 10px auto' }}></div>
              <p style={{ color: 'white', margin: 0, fontSize: '14px' }}>
                {t('waiting_trump_selection', { name: gameState.players[gameState.highestBidderIndex]?.name.split(' ')[0] })}
              </p>
            </div>
          )}

          {/* Players */}
          {gameState.players.map((p: any, idx: number) => {
            const posClass = getPositionClass(idx, gameState.myIndex);
            const isMe = idx === gameState.myIndex;
            const isTheirTurn = gameState.currentTurnIndex === idx;

            return (
              <div 
                key={idx} 
                className={`player-hand ${posClass} player-pos-${idx}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  flexDirection: posClass.includes('player-right') ? 'row-reverse' : 'row'
                }}
              >
                 {/* Profile Avatar Widget */}
                 <div 
                   className={`player-profile-widget player-name-pos-${idx}`}
                   onClick={(e) => {
                     e.stopPropagation();
                     setActivePickerIndex(activePickerIndex === idx ? null : idx);
                   }}
                   style={{ 
                     display: 'flex', 
                     flexDirection: 'column', 
                     alignItems: 'center', 
                     cursor: 'pointer',
                     userSelect: 'none',
                     transform: getCounterRotation(posClass),
                     transformOrigin: 'center center',
                     zIndex: 150,
                     width: '50px',
                     position: 'relative'
                   }}
                 >
                    <div style={{ position: 'relative', width: '50px', height: '50px' }}>
                      {/* Bidding Action Badge */}
                      {gameState.state === 'BIDDING' && gameState.playerBids && gameState.playerBids[idx] !== null && gameState.playerBids[idx] !== undefined && (
                        <div style={{
                          position: 'absolute',
                          top: '-12px',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          background: gameState.playerBids[idx] === 'PASS' ? '#7f8c8d' : 'linear-gradient(135deg, #f1c40f, #d35400)',
                          color: 'white',
                          padding: '2px 6px',
                          borderRadius: '8px',
                          fontSize: '9px',
                          fontWeight: 'bold',
                          boxShadow: '0 2px 5px rgba(0,0,0,0.4)',
                          border: '1px solid rgba(255,255,255,0.4)',
                          zIndex: 160,
                          whiteSpace: 'nowrap'
                        }}>
                          {gameState.playerBids[idx] === 'PASS' ? 'باص' : `${gameState.playerBids[idx]}`}
                        </div>
                      )}
                      {/* SVG Timer */}
                      {isTheirTurn && gameState.state !== 'FINISHED' && (
                       <svg style={{ position: 'absolute', top: 0, left: 0, transform: 'rotate(-90deg)', width: '50px', height: '50px', pointerEvents: 'none' }}>
                         <circle
                           cx="25"
                           cy="25"
                           r="22"
                           fill="none"
                           stroke="rgba(255,255,255,0.15)"
                           strokeWidth="2.5"
                         />
                         <circle
                           cx="25"
                           cy="25"
                           r="22"
                           fill="none"
                           stroke="#f1c40f"
                           strokeWidth="2.5"
                           strokeDasharray="138.2"
                           strokeDashoffset={138.2 * (1 - timeLeft / 20)}
                           strokeLinecap="round"
                           style={{ transition: 'stroke-dashoffset 0.5s linear' }}
                         />
                       </svg>
                     )}
                     {/* Circular Avatar */}
                     <div 
                       className={isTheirTurn ? "pulse-active-avatar" : ""}
                       style={{
                         position: 'absolute',
                         top: '5px',
                         left: '5px',
                         width: '40px',
                         height: '40px',
                         borderRadius: '50%',
                         background: getAvatarGradient(p.name),
                         display: 'flex',
                         alignItems: 'center',
                         justifyContent: 'center',
                         fontSize: '15px',
                         fontWeight: 'bold',
                         color: 'white',
                         border: isTheirTurn ? '1.5px solid #f1c40f' : '1px solid rgba(255,255,255,0.1)'
                       }}
                     >
                       {p.name.charAt(0).toUpperCase()}
                     </div>
                     {/* Dealer Button Badge */}
                     {gameState && gameState.dealerIndex === idx && (
                       <div style={{
                         position: 'absolute',
                         top: '1px',
                         right: '1px',
                         width: '18px',
                         height: '18px',
                         borderRadius: '50%',
                         background: 'linear-gradient(135deg, #FFE07D 0%, #F39C12 100%)',
                         color: '#120a00',
                         fontSize: '10px',
                         fontWeight: 'bold',
                         display: 'flex',
                         alignItems: 'center',
                         justifyContent: 'center',
                         boxShadow: '0 2px 4px rgba(0,0,0,0.5)',
                         border: '1px solid white',
                         zIndex: 10
                       }}>
                         D
                       </div>
                     )}
                   </div>
                   
                   {/* Player Name */}
                   <div style={{
                     marginTop: '4px',
                     background: isTheirTurn ? '#f1c40f' : 'rgba(0,0,0,0.7)',
                     color: isTheirTurn ? 'black' : 'white',
                     padding: '2px 6px',
                     borderRadius: '6px',
                     fontSize: '9px',
                     fontWeight: 'bold',
                     whiteSpace: 'nowrap',
                     maxWidth: '65px',
                     overflow: 'hidden',
                     textOverflow: 'ellipsis',
                     boxShadow: '0 2px 5px rgba(0,0,0,0.3)',
                     border: isTheirTurn ? 'none' : '1px solid rgba(255,255,255,0.1)',
                     textAlign: 'center'
                   }}>
                     {p.name.split(' ')[0]}
                   </div>

                   {/* Team Label */}
                   {gameState.gameMode === 'PARTNERSHIP' && (
                     <div style={{
                       marginTop: '2px',
                       background: (idx === gameState.myIndex || idx === (gameState.myIndex + 2) % 4) ? 'rgba(52, 152, 219, 0.2)' : 'rgba(231, 76, 60, 0.2)',
                       color: (idx === gameState.myIndex || idx === (gameState.myIndex + 2) % 4) ? '#3498db' : '#e74c3c',
                       border: `1px solid ${(idx === gameState.myIndex || idx === (gameState.myIndex + 2) % 4) ? 'rgba(52, 152, 219, 0.4)' : 'rgba(231, 76, 60, 0.4)'}`,
                       padding: '1px 4px',
                       borderRadius: '4px',
                       fontSize: '7.5px',
                       fontWeight: 'bold',
                       whiteSpace: 'nowrap'
                     }}>
                       {(idx === gameState.myIndex || idx === (gameState.myIndex + 2) % 4) ? 'فريقك' : 'الخصم'}
                     </div>
                   )}

                   {/* Chat Bubble overlay */}
                   {activeChatBubbles.filter(b => b.senderIndex === idx).map(b => (
                     <div key={b.id} className="chat-bubble-pop" style={{
                       position: 'absolute',
                       bottom: '65px',
                       left: '50%',
                       transform: 'translateX(-50%)',
                       background: '#ffffff',
                       color: '#000000',
                       border: '2px solid #2ecc71',
                       padding: '4px 8px',
                       borderRadius: '10px',
                       fontSize: '11px',
                       fontWeight: 'bold',
                       whiteSpace: 'nowrap',
                       zIndex: 1000,
                       boxShadow: '0 5px 15px rgba(0,0,0,0.4)',
                       animation: 'bubbleFadeInUp 0.3s ease-out'
                     }}>
                       {b.text}
                       {/* Arrow indicator */}
                       <div style={{
                         position: 'absolute',
                         bottom: '-6px',
                         left: '50%',
                         transform: 'translateX(-50%) rotate(45deg)',
                         width: '10px',
                         height: '10px',
                         background: '#ffffff',
                         borderRight: '2px solid #2ecc71',
                         borderBottom: '2px solid #2ecc71'
                       }} />
                     </div>
                   ))}

                   {/* Emoji & Phrase Picker Popover */}
                   {activePickerIndex === idx && (
                     <div 
                       className="emoji-picker-bubble"
                       style={{
                         position: 'absolute',
                         bottom: '65px',
                         left: '50%',
                         transform: 'translateX(-50%)',
                         background: 'rgba(15, 23, 42, 0.96)',
                         backdropFilter: 'blur(12px)',
                         border: '1px solid rgba(241, 196, 15, 0.45)',
                         borderRadius: '16px',
                         padding: '8px 10px',
                         display: 'flex',
                         flexDirection: 'column',
                         gap: '8px',
                         zIndex: 999,
                         boxShadow: '0 10px 30px rgba(0,0,0,0.6)',
                         minWidth: '150px'
                       }}
                     >
                       {/* Emojis Row */}
                       <div style={{ display: 'flex', justifyContent: 'space-around', gap: '8px' }}>
                         {['💖', '👏', '🍅'].map(emoji => (
                           <button
                             key={emoji}
                             onClick={(e) => {
                               e.stopPropagation();
                               sendEmoji(idx, emoji);
                               setActivePickerIndex(null);
                             }}
                             style={{
                               background: 'none',
                               border: 'none',
                               fontSize: '22px',
                               cursor: 'pointer',
                               padding: '2px',
                               transition: 'transform 0.1s'
                             }}
                             onMouseDown={(e) => e.currentTarget.style.transform = 'scale(1.2)'}
                             onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
                           >
                             {emoji}
                           </button>
                         ))}
                       </div>
                       
                       {/* Line Separator */}
                       <div style={{ height: '1px', background: 'rgba(255,255,255,0.1)' }} />
                       
                       {/* Phrases List */}
                       <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                         {['كفو! 👍', 'طرنيب! 🃏', 'العب بسرعة! ⏱️', 'حظ أوفر! 😉', 'يا وحش! 🔥'].map(phrase => (
                           <button
                             key={phrase}
                             onClick={(e) => {
                               e.stopPropagation();
                               sendChatBubble(phrase);
                               setActivePickerIndex(null);
                             }}
                             style={{
                               background: 'rgba(255,255,255,0.06)',
                               border: 'none',
                               borderRadius: '6px',
                               color: 'white',
                               fontSize: '10px',
                               fontWeight: 'bold',
                               padding: '4px 6px',
                               cursor: 'pointer',
                               textAlign: 'center',
                               transition: 'background 0.2s'
                             }}
                             onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
                             onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                           >
                             {phrase}
                           </button>
                         ))}
                       </div>
                     </div>
                   )}
                 </div>
                 
                 {isMe ? (
                   <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                     {gameState.myHand.map((card: any, i: number) => {
                       const dealClass = animateDeal ? 'deal-card-bottom' : '';
                       return (
                         <div 
                           key={i} 
                           onClick={() => handlePlayCard(i)} 
                           onMouseEnter={() => { if (isMyTurn) playSound('tick'); }}
                           style={{ 
                             cursor: isMyTurn ? 'pointer' : 'default', 
                             transform: isMyTurn ? 'translateY(-10px)' : 'none', 
                             transition: 'transform 0.2s, z-index 0s', 
                             zIndex: i, 
                             position: 'relative',
                             animationDelay: animateDeal ? `${i * 0.08}s` : undefined
                           }} 
                           className={`my-card-hover ${dealClass}`}
                         >
                            <PlayingCard suit={card.suit} rank={card.rank} isTarneeb={card.suit === gameState.trumpSuit} />
                         </div>
                       );
                     })}
                   </div>
                 ) : (
                   <div style={{ display: 'flex' }}>
                      {Array.from({length: p.cardCount}).map((_, i) => {
                        const dealClass = animateDeal ? `deal-card-${posClass.replace('player-', '')}` : '';
                        return (
                          <div 
                            key={i} 
                            className={`opponent-card ${dealClass}`} 
                            style={{ 
                              zIndex: i,
                              animationDelay: animateDeal ? `${i * 0.08}s` : undefined
                            }}
                          />
                        );
                      })}
                   </div>
                 )}
              </div>
            );
          })}

          {/* Center play area (Current Trick) */}
          <div className="center-play-area" style={{ display: 'flex', gap: '10px' }}>
             {delayedTrick && delayedTrick.map((trickPlay: any, idx: number) => {
                // Create deterministic rotation per player position
                const rotations = [5, -8, 12, -5];
                const diff = (trickPlay.playerIndex - gameState.myIndex + 4) % 4;
                let dx = '0px', dy = '150px'; // Bottom
                if (diff === 1) { dx = '150px'; dy = '0px'; } // Right
                else if (diff === 2) { dx = '0px'; dy = '-150px'; } // Top
                else if (diff === 3) { dx = '-150px'; dy = '0px'; } // Left

                let pullClass = '';
                if (trickWinnerIndex !== null) {
                    const winnerDiff = (trickWinnerIndex - gameState.myIndex + 4) % 4;
                    pullClass = `pull-to-${winnerDiff}`;
                }

                return (
                  <div key={idx} className={`thrown-card ${pullClass}`} style={{ '--rot': `${rotations[trickPlay.playerIndex]}deg`, '--dx': dx, '--dy': dy } as any}>
                     <PlayingCard suit={trickPlay.card.suit} rank={trickPlay.card.rank} isTarneeb={trickPlay.card.suit === gameState.trumpSuit} />
                  </div>
                );
             })}
          </div>

          {/* Active flying and splatting emojis */}
          {activeEmojis.map(e => {
            if (e.phase === 'splat') {
              return (
                <div 
                  key={e.id}
                  className="tomato-splat"
                  style={{
                    '--x2': `${e.x2}px`,
                    '--y2': `${e.y2}px`
                  } as any}
                />
              );
            }
            return (
              <div
                key={e.id}
                className="flying-emoji"
                style={{
                  '--x1': `${e.x1}px`,
                  '--y1': `${e.y1}px`,
                  '--x2': `${e.x2}px`,
                  '--y2': `${e.y2}px`
                } as any}
              >
                {e.emoji}
              </div>
            );
          })}

          {/* Cinematic Trump Declaration Overlay */}
          {showTrumpOverlay && (
            <div className="trump-declaration-overlay">
              <div className="trump-overlay-card">
                <h2 style={{ fontSize: '18px', color: '#aaa', margin: '0 0 10px 0', textTransform: 'uppercase', letterSpacing: '1px' }}>تم اختيار الطرنيب</h2>
                <div className={`trump-overlay-suit ${['Hearts','Diamonds'].includes(showTrumpOverlay) ? 'red' : 'black'}`} style={{ fontSize: '70px', fontWeight: 'bold', margin: '10px 0', textShadow: '0 0 15px rgba(255,255,255,0.2)' }}>
                  {showTrumpOverlay === 'Hearts' && '♥'}
                  {showTrumpOverlay === 'Diamonds' && '♦'}
                  {showTrumpOverlay === 'Clubs' && '♣'}
                  {showTrumpOverlay === 'Spades' && '♠'}
                </div>
                <p style={{ fontSize: '24px', fontWeight: 'bold', color: '#f1c40f', margin: 0 }}>
                  {showTrumpOverlay === 'Hearts' && 'كبة (Hearts)'}
                  {showTrumpOverlay === 'Diamonds' && 'ديناري (Diamonds)'}
                  {showTrumpOverlay === 'Clubs' && 'سباتي (Clubs)'}
                  {showTrumpOverlay === 'Spades' && 'باص (Spades)'}
                </p>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
