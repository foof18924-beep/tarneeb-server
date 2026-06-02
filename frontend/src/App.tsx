import React, { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { useTranslation } from 'react-i18next';
import { GameBoard } from './components/GameBoard';
import { Leaderboard } from './components/Leaderboard';
import { Login } from './components/Login';
import { CountdownTimer } from './components/CountdownTimer';
import { AdminPanel } from './components/AdminPanel';
import { WinnersLog } from './components/WinnersLog';
import { auth, db } from './firebase';
import { doc, getDoc, setDoc, onSnapshot, collection } from 'firebase/firestore';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

// Connect to backend server
// On native Android/iOS (APK), Capacitor sets hostname to 'localhost' even in production
// So we MUST check isNativePlatform() first to always use the real server on mobile
const PRODUCTION_SERVER = 'https://tarneeb-server.onrender.com';
const isNative = Capacitor.isNativePlatform(); // true on Android APK / iOS IPA
const isLocalDev = !isNative && typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
const socketUrl = isLocalDev ? 'http://localhost:3001' : PRODUCTION_SERVER;
const socket: Socket = io(socketUrl, {
  transports: ['websocket', 'polling'],
  timeout: 20000,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
});

function App() {
  const { t, i18n } = useTranslation();
  const [user, setUser] = useState<any>(null);
  const [username, setUsername] = useState('');
  const [gamesPlayed, setGamesPlayed] = useState(0);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [freeGamesLimit, setFreeGamesLimit] = useState(7);

  const [inRoom, setInRoom] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [players, setPlayers] = useState<any[]>([]);
  const [gameState, setGameState] = useState<any>(null);
  const [gameMode, setGameMode] = useState<'PARTNERSHIP' | 'INDIVIDUAL'>('PARTNERSHIP');

  const [isConnected, setIsConnected] = useState(false);
  const [showSubscription, setShowSubscription] = useState(false);
  const [prizeValue, setPrizeValue] = useState(100);
  const [globalAlert, setGlobalAlert] = useState('');
  
  // Navigation State
  const [activeTab, setActiveTab] = useState<'home' | 'leaderboard' | 'admin'>('home');

  useEffect(() => {
    // Listen to Auth State
    const unsubscribe = auth.onAuthStateChanged(async (u) => {
      setUser(u);
      if (u) {
        // Realtime listener for user document
        const unsubDoc = onSnapshot(doc(db, 'users', u.uid), (docSnap) => {
          if (docSnap.exists()) {
              setGamesPlayed(docSnap.data().gamesPlayed || 0);
              setUsername(docSnap.data().username || 'لاعب');
              setIsSubscribed(docSnap.data().subscribed || false);
          }
        });
        
        return () => unsubDoc();
      }
    });

    const unsubSettings = onSnapshot(doc(db, 'settings', 'global'), (snap) => {
      if (snap.exists() && snap.data().freeGamesLimit !== undefined) {
         setFreeGamesLimit(Number(snap.data().freeGamesLimit));
      }
    });

    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));
    
    socket.on('room_update', (data) => {
      setPlayers(data.players);
      setRoomCode(data.roomCode);
      setInRoom(true);
    });

    socket.on('game_state_update', (data) => {
      setGameState(data);
    });

    socket.on('global_alert', (data) => {
      setGlobalAlert(data.message);
    });

    socket.on('prize_update', (data) => {
      setPrizeValue(data.prizeValue);
    });

    // Hardware Back Button handler
    const backButtonListener = CapacitorApp.addListener('backButton', () => {
      if (inRoom) {
        socket.emit('leave_room', {});
        setInRoom(false);
        setRoomCode('');
        setGameState(null);
      } else {
        // Let it exit the app if not in room (or handle other navigation)
        CapacitorApp.exitApp();
      }
    });

    // Initialize IAP (cordova-plugin-purchase)
    if ((window as any).CdvPurchase && (window as any).CdvPurchase.store) {
      const store = (window as any).CdvPurchase.store;
      store.register([{
        type: store.PAID_SUBSCRIPTION,
        id: 'me',
        platform: store.GOOGLE_PLAY
      }, {
        type: store.PAID_SUBSCRIPTION,
        id: 'ye',
        platform: store.GOOGLE_PLAY
      }]);

      store.when().approved((p: any) => p.verify());
      store.when().verified(async (p: any) => {
        p.finish();
        alert(t('sub_success'));
        setShowSubscription(false);
        setIsSubscribed(true);
        if (auth.currentUser) {
           await setDoc(doc(db, 'users', auth.currentUser.uid), { subscribed: true }, { merge: true });
        }
      });
      store.initialize([store.GOOGLE_PLAY]);
    }

    return () => {
      unsubscribe();
      unsubSettings();
      backButtonListener.then(l => l.remove());
      socket.off('connect');
      socket.off('disconnect');
      socket.off('room_update');
      socket.off('game_state_update');
      socket.off('global_alert');
      socket.off('prize_update');
    };
  }, [inRoom]);

  const handlePlayNow = async () => {
    if (!isConnected) {
      alert(t('wait_server'));
      return;
    }

    if (!isSubscribed && gamesPlayed >= freeGamesLimit) {
      setShowSubscription(true);
      return;
    }
    
    // Auto Matchmaking
    socket.emit('auto_match', { username, uid: user?.uid, gameMode });
    
    // Increment games played in Firebase (only if not subscribed)
    if (user && !isSubscribed) {
       try {
         const userRef = doc(db, 'users', user.uid);
         setGamesPlayed(prev => prev + 1);
         await setDoc(userRef, { gamesPlayed: gamesPlayed + 1 }, { merge: true });
       } catch (err) {
         console.error("Firebase update failed", err);
       }
    }
  };

  const handleSubscribe = async (type: 'me' | 'ye') => {
    if ((window as any).CdvPurchase && (window as any).CdvPurchase.store) {
      const store = (window as any).CdvPurchase.store;
      const product = store.get(type, store.GOOGLE_PLAY);
      if (product) {
        store.order(product);
        return;
      }
    }
    
    // Fallback if not on Android or plugin missing
    alert('عذراً، متجر جوجل بلاي غير متوفر حالياً. يرجى التأكد من تحميل التطبيق من المتجر الرسمي.');
  };

  const toggleLanguage = () => {
    i18n.changeLanguage(i18n.language.startsWith('ar') ? 'en' : 'ar');
  };

  // Login Screen
  if (!user) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'radial-gradient(circle at center, #1a1a1a 0%, #000 100%)', padding: '20px' }}>
         <div style={{ alignSelf: 'flex-end', marginBottom: '20px' }}>
           <button onClick={toggleLanguage} style={{ background: 'transparent', border: '1px solid white', color: 'white', borderRadius: '4px', cursor: 'pointer', padding: '5px 10px' }}>
             {i18n.language.startsWith('ar') ? t('lang_en') : t('lang_ar')}
           </button>
         </div>
         <Login onLogin={() => {}} />
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      
      {/* Premium Header Bar */}
      {!inRoom && (
        <div className="premium-app-header">
          <div className="header-user-badge">
            <div className="header-user-avatar">
              {username ? username.charAt(0).toUpperCase() : 'U'}
            </div>
            <div className="header-user-name">{username}</div>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="connection-pill">
              <span className={`connection-dot ${isConnected ? 'online' : 'offline'}`} />
              <span style={{ color: '#ccc' }}>
                {isConnected ? t('connected') : t('connecting')}
              </span>
            </div>
            
            <button 
              onClick={toggleLanguage} 
              style={{ 
                background: 'rgba(255,255,255,0.06)', 
                border: '1px solid rgba(255,255,255,0.15)', 
                color: 'white', 
                borderRadius: '12px', 
                cursor: 'pointer', 
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 'bold',
                transition: 'background 0.2s'
              }}
            >
              {i18n.language.startsWith('ar') ? 'English' : 'العربية'}
            </button>
          </div>
        </div>
      )}

      {/* Legacy Top Bar fallback for GameRoom only (styled cleanly) */}
      {inRoom && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '15px', display: 'flex', justifyContent: 'space-between', zIndex: 1000 }}>
          <div style={{ color: isConnected ? '#2ecc71' : '#e74c3c', background: 'rgba(0,0,0,0.6)', padding: '5px 10px', borderRadius: '5px', fontSize: '12px' }}>
            {isConnected ? t('connected') : t('connecting')}
          </div>
          <button onClick={toggleLanguage} style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.3)', color: 'white', borderRadius: '4px', cursor: 'pointer', padding: '5px 10px' }}>
            {i18n.language.startsWith('ar') ? t('lang_en') : t('lang_ar')}
          </button>
        </div>
      )}

      {/* Subscription Paywall */}
      {showSubscription && (
        <div style={{ position: 'fixed', zIndex: 9999, top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(10,10,15,0.98)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '20px' }}>
           <div className="premium-card" style={{ maxWidth: '400px', textAlign: 'center', border: '2px solid #f1c40f', background: 'radial-gradient(circle, rgba(30,30,45,0.9) 0%, rgba(15,15,25,0.95) 100%)' }}>
             <span style={{ fontSize: '50px', display: 'block', marginBottom: '10px' }}>👑</span>
             <h1 style={{ color: '#f1c40f', fontSize: '28px', marginBottom: '10px', fontWeight: '900' }}>{t('free_ended_title')}</h1>
             <p style={{ color: '#ccc', fontSize: '15px', lineHeight: '1.6', marginBottom: '25px' }}>
               {t('free_ended_desc')}
             </p>
             <button className="play-btn-premium" style={{ marginBottom: '12px', background: 'linear-gradient(135deg, #f1c40f 0%, #f39c12 100%)', boxShadow: '0 8px 20px rgba(241,196,15,0.3)', color: 'black' }} onClick={() => handleSubscribe('me')}>{t('sub_monthly')}</button>
             <button className="play-btn-premium" style={{ marginBottom: '15px', background: 'linear-gradient(135deg, #2980b9 0%, #3498db 100%)', boxShadow: '0 8px 20px rgba(41,128,185,0.3)' }} onClick={() => handleSubscribe('ye')}>{t('sub_yearly')}</button>
             
             <button onClick={() => setShowSubscription(false)} style={{ background: 'transparent', border: 'none', color: '#888', textDecoration: 'underline', cursor: 'pointer', fontSize: '14px' }}>
               إغلاق
             </button>
           </div>
        </div>
      )}

      {/* Main Content Area */}
      {!inRoom ? (
        <div className="premium-home-container">
           
           {activeTab === 'home' && (
             <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: '500px', margin: '0 auto' }}>
                
                {/* Gold Prize Badge Banner */}
                <div className="gold-prize-badge">
                  <span className="gold-prize-title">🏆 جائزة التحدي الذهبي 🏆</span>
                  <span className="gold-prize-value">${prizeValue}</span>
                </div>

                {/* Countdown Timer Card */}
                <CountdownTimer />
                
                {/* Game Mode Selector */}
                <div style={{
                  display: 'flex',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '16px',
                  padding: '4px',
                  width: '100%',
                  marginBottom: '20px',
                  boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
                  direction: 'rtl'
                }}>
                  <button
                    onClick={() => setGameMode('PARTNERSHIP')}
                    style={{
                      flex: 1,
                      background: gameMode === 'PARTNERSHIP' ? 'linear-gradient(135deg, #f1c40f 0%, #f39c12 100%)' : 'transparent',
                      color: gameMode === 'PARTNERSHIP' ? 'black' : 'white',
                      border: 'none',
                      borderRadius: '12px',
                      padding: '12px 10px',
                      fontSize: '14px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      transition: 'all 0.3s ease',
                      boxShadow: gameMode === 'PARTNERSHIP' ? '0 4px 10px rgba(241,196,15,0.2)' : 'none'
                    }}
                  >
                    🤝 {t('partnership')}
                  </button>
                  <button
                    onClick={() => setGameMode('INDIVIDUAL')}
                    style={{
                      flex: 1,
                      background: gameMode === 'INDIVIDUAL' ? 'linear-gradient(135deg, #f1c40f 0%, #f39c12 100%)' : 'transparent',
                      color: gameMode === 'INDIVIDUAL' ? 'black' : 'white',
                      border: 'none',
                      borderRadius: '12px',
                      padding: '12px 10px',
                      fontSize: '14px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      transition: 'all 0.3s ease',
                      boxShadow: gameMode === 'INDIVIDUAL' ? '0 4px 10px rgba(241,196,15,0.2)' : 'none'
                    }}
                  >
                    👤 {t('individual')}
                  </button>
                </div>
                
                {/* Play Button */}
                <button onClick={handlePlayNow} className="play-btn-premium">
                  <span>{t('play_now')}</span>
                </button>

                {/* VIP / Progress Account Card */}
                {isSubscribed ? (
                  <div className="vip-account-card">
                    <span style={{ fontSize: '26px' }}>👑</span>
                    <span style={{ fontWeight: '900', color: '#f1c40f', fontSize: '18px' }}>{t('vip_account')}</span>
                  </div>
                ) : (
                  <div className="free-account-card">
                    <div className="free-account-header">
                      <span style={{ color: '#aaa', fontWeight: 'bold' }}>{t('free_games_left')}</span>
                      <span style={{ color: 'white', fontWeight: 'bold', fontSize: '16px' }}>
                        {Math.max(0, freeGamesLimit - gamesPlayed)} / {freeGamesLimit}
                      </span>
                    </div>
                    <div className="progress-bar-container">
                      <div className="progress-bar-fill" style={{ width: `${(Math.max(0, freeGamesLimit - gamesPlayed) / freeGamesLimit) * 100}%` }}></div>
                    </div>
                    <button onClick={() => setShowSubscription(true)} className="upgrade-vip-link">
                      <span>👑 ترقية الحساب إلى VIP</span>
                    </button>
                  </div>
                )}

                 {/* Request Account Deletion Link */}
                 <a 
                   href="/delete-account.html" 
                   target="_blank" 
                   rel="noopener noreferrer"
                   style={{ 
                     marginTop: '25px', 
                     color: 'rgba(255,255,255,0.4)', 
                     fontSize: '12px', 
                     textDecoration: 'underline', 
                     cursor: 'pointer',
                     textAlign: 'center',
                     transition: 'color 0.2s'
                   }}
                   onMouseOver={(e) => e.currentTarget.style.color = '#e74c3c'}
                   onMouseOut={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.4)'}
                 >
                   {i18n.language.startsWith('ar') ? 'طلب حذف الحساب والبيانات' : 'Request Account & Data Deletion'}
                 </a>
              </div>
           )}

           {activeTab === 'winners' && (
             <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: '500px', margin: '0 auto' }}>
                <WinnersLog />
             </div>
           )}

           {activeTab === 'leaderboard' && (
             <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: '500px', margin: '0 auto' }}>
                <Leaderboard currentUserUid={user.uid} />
             </div>
           )}

           {activeTab === 'admin' && user?.email === 'hanitareq2250@gmail.com' && (
             <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: '600px', margin: '0 auto' }}>
                <AdminPanel socket={socket} prizeValue={prizeValue} />
             </div>
           )}

        </div>
      ) : (
        <GameBoard roomCode={roomCode} players={players} myUsername={username} gameState={gameState} socket={socket} />
      )}

      {/* Bottom Navigation Bar */}
      {!inRoom && (
        <div className="floating-nav-bar">
          <div onClick={() => setActiveTab('home')} className={`nav-item ${activeTab === 'home' ? 'active' : ''}`}>
            <span className="nav-icon">
              <svg viewBox="0 0 24 24">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></path>
                <polyline points="9 22 9 12 15 12 15 22" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></polyline>
              </svg>
            </span>
            <span className="nav-label">{t('home_tab')}</span>
            {activeTab === 'home' && <div className="nav-active-dot" />}
          </div>
          <div onClick={() => setActiveTab('leaderboard')} className={`nav-item ${activeTab === 'leaderboard' ? 'active' : ''}`}>
            <span className="nav-icon">
              <svg viewBox="0 0 24 24">
                <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></path>
                <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></path>
                <path d="M4 22h16" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></path>
                <path d="M10 14.66V17c0 .55-.45 1-1 1H4v2h16v-2h-5c-.55 0-1-.45-1-1v-2.34" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></path>
                <path d="M12 2a6 6 0 0 1 6 6v5a6 6 0 0 1-6 6 6 6 0 0 1-6-6V8a6 6 0 0 1 6-6z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></path>
              </svg>
            </span>
            <span className="nav-label">{t('leaderboard_tab')}</span>
            {activeTab === 'leaderboard' && <div className="nav-active-dot" />}
          </div>
          <div onClick={() => setActiveTab('winners')} className={`nav-item ${activeTab === 'winners' ? 'active' : ''}`}>
            <span className="nav-icon">
              <svg viewBox="0 0 24 24">
                <circle cx="12" cy="9" r="6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></circle>
                <path d="M9 14.85V22l3-3 3 3v-7.15" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></path>
                <line x1="12" y1="6" x2="12" y2="12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></line>
                <line x1="9" y1="9" x2="15" y2="9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></line>
              </svg>
            </span>
            <span className="nav-label">الفائزون</span>
            {activeTab === 'winners' && <div className="nav-active-dot" />}
          </div>
          {user?.email === 'hanitareq2250@gmail.com' && (
            <div onClick={() => setActiveTab('admin')} className={`nav-item admin-nav ${activeTab === 'admin' ? 'active' : ''}`}>
              <span className="nav-icon">
                <svg viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></circle>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></path>
                </svg>
              </span>
              <span className="nav-label">الإدارة</span>
              {activeTab === 'admin' && <div className="nav-active-dot" />}
            </div>
          )}
        </div>
      )}

      {/* Global Alert Modal */}
      {globalAlert && (
        <div style={{ position: 'fixed', zIndex: 99999, top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ background: '#2c3e50', padding: '30px', borderRadius: '15px', width: '90%', maxWidth: '400px', textAlign: 'center', boxShadow: '0 10px 30px rgba(0,0,0,0.7)', border: '2px solid #e74c3c' }}>
            <div style={{ fontSize: '40px', marginBottom: '15px' }}>📢</div>
            <h2 style={{ color: 'white', marginBottom: '20px', lineHeight: '1.5' }}>{globalAlert}</h2>
            <button 
              onClick={() => setGlobalAlert('')} 
              style={{ background: '#e74c3c', color: 'white', border: 'none', padding: '12px 30px', fontSize: '18px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
              حسناً
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
