import React, { useState, useEffect, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { db } from '../firebase';
import { collection, query, orderBy, limit, getDocs, doc, setDoc, updateDoc } from 'firebase/firestore';

interface AdminPanelProps {
  socket: Socket;
  prizeValue: number;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ socket, prizeValue: globalPrize }) => {
  const [stats, setStats] = useState({ activeRooms: 0, partnershipRooms: 0, individualRooms: 0, totalPlayers: 0 });
  const [testGameMode, setTestGameMode] = useState<'PARTNERSHIP' | 'INDIVIDUAL'>('PARTNERSHIP');
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [targetScore, setTargetScore] = useState(39);
  const [prizeValue, setPrizeValue] = useState(globalPrize);
  const [prizeFrequency, setPrizeFrequency] = useState('monthly');
  const [freeGamesLimit, setFreeGamesLimit] = useState(7);
  
  const [winners, setWinners] = useState<any[]>([]);
  const [searchUid, setSearchUid] = useState('');
  
  const [challengeEnded, setChallengeEnded] = useState(false);
  const [prizeClaims, setPrizeClaims] = useState<any[]>([]);

  useEffect(() => {
    // Request stats every 5 seconds
    const interval = setInterval(() => {
      socket.emit('admin_get_stats', {});
    }, 5000);

    socket.on('admin_stats', (data) => {
      setStats(data);
    });

    fetchWinners();

    return () => {
      clearInterval(interval);
      socket.off('admin_stats');
    };
  }, []);

  useEffect(() => {
    import('firebase/firestore').then(({ doc, getDoc, onSnapshot }) => {
      const unsub = onSnapshot(doc(db, 'settings', 'global'), (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (data.prizeFrequency) setPrizeFrequency(data.prizeFrequency);
          if (data.challengeEnded !== undefined) setChallengeEnded(data.challengeEnded);
          if (data.freeGamesLimit !== undefined) setFreeGamesLimit(Number(data.freeGamesLimit));
        }
      });
      return () => unsub();
    }).catch(console.error);
  }, []);

  const fetchPrizeClaims = async () => {
    try {
      const q = query(collection(db, 'prize_claims'), orderBy('timestamp', 'desc'));
      const querySnapshot = await getDocs(q);
      const data: any[] = [];
      querySnapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() });
      });
      setPrizeClaims(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchPrizeClaims();
  }, []);

  const fetchWinners = async () => {
    try {
      const q = query(collection(db, 'winners'), orderBy('timestamp', 'desc'), limit(10));
      const querySnapshot = await getDocs(q);
      const data: any[] = [];
      querySnapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() });
      });
      setWinners(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    setPrizeValue(globalPrize);
  }, [globalPrize]);

  const handleSetFreeGamesLimit = async () => {
    try {
      await setDoc(doc(db, 'settings', 'global'), { freeGamesLimit }, { merge: true });
      alert('تم تحديث عدد الجولات المجانية بنجاح!');
    } catch (e) {
      console.error(e);
      alert('حدث خطأ أثناء الحفظ');
    }
  };



  const handleBroadcast = () => {
    if (broadcastMsg.trim()) {
      socket.emit('admin_broadcast', { message: broadcastMsg });
      setBroadcastMsg('');
      alert('تم الإرسال لجميع اللاعبين!');
    }
  };

  const handleSetTargetScore = () => {
    socket.emit('admin_set_target_score', { targetScore });
    alert('تم تغيير نقاط الفوز');
  };

  const handleSetPrize = async () => {
    socket.emit('admin_set_prize', { prizeValue });
    alert('تم تغيير قيمة الجائزة');
  };

  const handleSetPrizeFrequency = async () => {
    try {
      await setDoc(doc(db, 'settings', 'global'), { prizeFrequency }, { merge: true });
      alert('تم تحديث مدة الحصول على الجائزة بنجاح!');
    } catch (e) {
      console.error("Error saving prize frequency: ", e);
      alert('حدث خطأ أثناء الحفظ، يرجى المحاولة مرة أخرى.');
    }
  };

  const handleToggleVip = async () => {
    if (!searchUid.trim()) return;
    try {
      await updateDoc(doc(db, 'users', searchUid), { subscribed: true });
      alert('تم تفعيل الـ VIP للمستخدم بنجاح!');
    } catch (e) {
      alert('حدث خطأ، تأكد من الـ UID');
    }
  };

  const handleToggleChallenge = async (status: boolean) => {
    try {
      if (!status) {
        const confirmReset = window.confirm("هل أنت متأكد من بدء تحدي جديد؟ هذا سيؤدي إلى تصفير نقاط جميع اللاعبين في قائمة المتصدرين!");
        if (!confirmReset) return;
        
        const { writeBatch } = await import('firebase/firestore');
        const usersSnapshot = await getDocs(collection(db, 'users'));
        let batch = writeBatch(db);
        let count = 0;
        
        for (const docSnap of usersSnapshot.docs) {
          batch.update(docSnap.ref, { points: 0 });
          count++;
          if (count === 400) {
            await batch.commit();
            batch = writeBatch(db);
            count = 0;
          }
        }
        if (count > 0) {
          await batch.commit();
        }
      }

      await setDoc(doc(db, 'settings', 'global'), { challengeEnded: status }, { merge: true });
      alert(status ? 'تم إنهاء التحدي وفتح التسجيل للفائزين!' : 'تم بدء تحدي جديد وتصفير نقاط جميع اللاعبين!');
    } catch (e) {
      console.error(e);
      alert('حدث خطأ أثناء تغيير حالة التحدي.');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', maxWidth: '650px', margin: '0 auto', gap: '20px', paddingBottom: '40px' }}>
      
      {/* Title */}
      <div className="premium-card" style={{ padding: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
        <span style={{ fontSize: '30px' }}>⚙️</span>
        <div>
          <h2 style={{ color: '#f1c40f', margin: 0, fontSize: '22px', fontWeight: '900' }}>لوحة التحكم للإدارة</h2>
          <p style={{ color: '#aaa', margin: '3px 0 0 0', fontSize: '12px' }}>إدارة غرف اللعب، إعداد التحديات، وحسابات الـ VIP</p>
        </div>
      </div>

      {/* Stats Dashboard Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
        <div className="premium-card" style={{ padding: '16px', textAlign: 'center', margin: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(46, 204, 113, 0.25)' }}>
          <span style={{ color: '#2ecc71', fontSize: '13px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>اللاعبين متصلين</span>
          <p style={{ fontSize: '32px', color: 'white', fontWeight: '900', margin: '8px 0 0 0', textShadow: '0 0 10px rgba(46, 204, 113, 0.3)' }}>
            {stats.totalPlayers}
          </p>
        </div>
        <div className="premium-card" style={{ padding: '16px', textAlign: 'center', margin: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(231, 76, 60, 0.25)' }}>
          <span style={{ color: '#e74c3c', fontSize: '13px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>الغرف النشطة</span>
          <p style={{ fontSize: '32px', color: 'white', fontWeight: '900', margin: '8px 0 0 0', textShadow: '0 0 10px rgba(231, 76, 60, 0.3)' }}>
            {stats.activeRooms}
          </p>
          <div style={{ fontSize: '11px', color: '#aaa', marginTop: '6px', display: 'flex', gap: '10px' }}>
            <span>🤝 شراكة: {stats.partnershipRooms || 0}</span>
            <span>👤 فردي: {stats.individualRooms || 0}</span>
          </div>
        </div>
      </div>

      {/* Developer Sandbox Panel */}
      <div className="premium-card" style={{ border: '1px solid rgba(46, 204, 113, 0.35)', background: 'linear-gradient(135deg, rgba(46,204,113,0.06) 0%, rgba(25,25,38,0.65) 100%)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <span style={{ fontSize: '20px' }}>🛠️</span>
          <h3 style={{ color: '#2ecc71', margin: 0, fontSize: '16px', fontWeight: 'bold' }}>أدوات المطور والاختبار</h3>
        </div>
        <p style={{ fontSize: '13px', color: '#ccc', lineHeight: '1.5', marginBottom: '15px' }}>
          انشئ غرفة فورية مع 3 لاعبين وهميين (بوتات ذكية) لتجربة اللعب بشكل منفرد واختبار منطق اللعبة والسرعة.
        </p>
        
        {/* Game Mode Selector for Test Room */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', direction: 'rtl' }}>
          <button 
            onClick={() => setTestGameMode('PARTNERSHIP')}
            style={{
              flex: 1,
              padding: '8px 12px',
              background: testGameMode === 'PARTNERSHIP' ? '#2ecc71' : 'rgba(255,255,255,0.05)',
              color: testGameMode === 'PARTNERSHIP' ? 'black' : 'white',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            🤝 غرفه تجريبية شراكة
          </button>
          <button 
            onClick={() => setTestGameMode('INDIVIDUAL')}
            style={{
              flex: 1,
              padding: '8px 12px',
              background: testGameMode === 'INDIVIDUAL' ? '#2ecc71' : 'rgba(255,255,255,0.05)',
              color: testGameMode === 'INDIVIDUAL' ? 'black' : 'white',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px',
              fontSize: '12px',
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            👤 غرفه تجريبية فردي
          </button>
        </div>

        <button 
          onClick={() => { socket.emit('admin_test_room', { username: 'المدير', gameMode: testGameMode }); }} 
          className="play-btn-premium"
          style={{ 
            background: 'linear-gradient(135deg, #2ecc71 0%, #27ae60 100%)', 
            boxShadow: '0 6px 20px rgba(46, 204, 113, 0.3)',
            fontSize: '16px', 
            padding: '12px 16px',
            margin: 0
          }}
        >
          الدخول لغرفة تجريبية (مع 3 بوتات)
        </button>
      </div>

      {/* Challenge Control (Crucial Panel) */}
      <div className="premium-card" style={{ border: '1px solid rgba(231, 76, 60, 0.35)', background: 'linear-gradient(135deg, rgba(231,76,60,0.06) 0%, rgba(25,25,38,0.65) 100%)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <span style={{ fontSize: '20px' }}>⏳</span>
          <h3 style={{ color: '#e74c3c', margin: 0, fontSize: '16px', fontWeight: 'bold' }}>التحكم بالتحدي والعداد</h3>
        </div>
        <p style={{ fontSize: '13px', color: '#ccc', lineHeight: '1.5', marginBottom: '15px' }}>
          عند إنهاء التحدي، سيتوقف العداد عن العمل لدى الجميع وسيظهر زر استلام الجائزة للفائز بالمركز الأول في المتصدرين لإرسال بياناته.
        </p>
        <div style={{ display: 'flex', gap: '12px' }}>
           <button 
             onClick={() => handleToggleChallenge(true)} 
             disabled={challengeEnded} 
             style={{ 
               flex: 1, 
               background: challengeEnded ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, #e74c3c 0%, #c0392b 100%)', 
               color: challengeEnded ? '#666' : 'white', 
               padding: '12px 14px', 
               border: 'none', 
               borderRadius: '12px', 
               cursor: challengeEnded ? 'not-allowed' : 'pointer',
               fontWeight: 'bold',
               fontSize: '14px',
               boxShadow: challengeEnded ? 'none' : '0 4px 15px rgba(231, 76, 60, 0.2)',
               transition: 'all 0.2s'
             }}
           >
             إنهاء التحدي وتفعيل استلام الجوائز
           </button>
           <button 
             onClick={() => handleToggleChallenge(false)} 
             disabled={!challengeEnded} 
             style={{ 
               flex: 1, 
               background: !challengeEnded ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg, #2ecc71 0%, #27ae60 100%)', 
               color: !challengeEnded ? '#666' : 'white', 
               padding: '12px 14px', 
               border: 'none', 
               borderRadius: '12px', 
               cursor: !challengeEnded ? 'not-allowed' : 'pointer',
               fontWeight: 'bold',
               fontSize: '14px',
               boxShadow: !challengeEnded ? 'none' : '0 4px 15px rgba(46, 204, 113, 0.2)',
               transition: 'all 0.2s'
             }}
           >
             بدء تحدي جديد (تصفير المتصدرين)
           </button>
        </div>
      </div>

      {/* Game Settings */}
      <div className="premium-card">
        <h3 style={{ color: 'white', margin: '0 0 16px 0', fontSize: '16px', fontWeight: 'bold' }}>إعدادات اللعبة وقيمة الجائزة 🏆</h3>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          
          <div>
            <label style={{ color: '#aaa', fontSize: '13px', display: 'block', marginBottom: '6px' }}>النقاط المطلوبة للفوز بالجولة:</label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input 
                type="number" 
                value={targetScore} 
                onChange={e => setTargetScore(Number(e.target.value))} 
                className="modern-input"
                style={{ flex: 1, margin: 0 }}
              />
              <button 
                onClick={handleSetTargetScore} 
                style={{ background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', padding: '0 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}
              >
                تحديث
              </button>
            </div>
          </div>

          <div>
            <label style={{ color: '#aaa', fontSize: '13px', display: 'block', marginBottom: '6px' }}>قيمة جائزة التحدي الذهبي ($):</label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input 
                type="number" 
                value={prizeValue} 
                onChange={e => setPrizeValue(Number(e.target.value))} 
                className="modern-input"
                style={{ flex: 1, margin: 0 }}
              />
              <button 
                onClick={handleSetPrize} 
                style={{ background: '#f39c12', color: 'black', border: 'none', padding: '0 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px', boxShadow: '0 4px 10px rgba(243,156,18,0.2)' }}
              >
                حفظ
              </button>
            </div>
          </div>

          <div>
            <label style={{ color: '#aaa', fontSize: '13px', display: 'block', marginBottom: '6px' }}>فترة أو دورية التحدي (لإعادة الحساب):</label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <select 
                value={prizeFrequency} 
                onChange={e => setPrizeFrequency(e.target.value)} 
                style={{ 
                  flex: 1, 
                  background: 'rgba(255,255,255,0.06)', 
                  border: '1px solid rgba(255,255,255,0.15)', 
                  padding: '10px 12px', 
                  borderRadius: '8px', 
                  color: 'white',
                  outline: 'none',
                  fontSize: '14px'
                }}
              >
                <option value="daily" style={{ background: '#1e1e2f' }}>تحدي يومي (تحديث 12 ليلاً)</option>
                <option value="weekly" style={{ background: '#1e1e2f' }}>تحدي أسبوعي (كل جمعة)</option>
                <option value="monthly" style={{ background: '#1e1e2f' }}>تحدي شهري (يوم 24 من كل شهر)</option>
              </select>
              <button 
                onClick={handleSetPrizeFrequency} 
                style={{ background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', padding: '0 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}
              >
                حفظ الدورية
              </button>
            </div>
          </div>

          <div>
            <label style={{ color: '#aaa', fontSize: '13px', display: 'block', marginBottom: '6px' }}>عدد الجولات المجانية المتاحة للاعبين:</label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input 
                type="number" 
                value={freeGamesLimit} 
                onChange={e => setFreeGamesLimit(Number(e.target.value))} 
                className="modern-input"
                style={{ flex: 1, margin: 0 }}
              />
              <button 
                onClick={handleSetFreeGamesLimit} 
                style={{ background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', padding: '0 20px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}
              >
                تحديث الحد
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* Broadcast Message */}
      <div className="premium-card">
        <h3 style={{ color: 'white', margin: '0 0 10px 0', fontSize: '16px', fontWeight: 'bold' }}>إرسال إشعار عام فوري 📢</h3>
        <p style={{ fontSize: '12px', color: '#888', marginBottom: '12px' }}>سيظهر الإشعار لجميع اللاعبين المتواجدين داخل التطبيق في نفس اللحظة كنافذة منبثقة.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <input 
            type="text" 
            value={broadcastMsg} 
            onChange={(e) => setBroadcastMsg(e.target.value)} 
            placeholder="اكتب رسالة الإعلان هنا..."
            className="modern-input"
            style={{ margin: 0 }}
          />
          <button 
            onClick={handleBroadcast} 
            className="play-btn-premium"
            style={{ margin: 0, padding: '12px', fontSize: '16px' }}
          >
            بث الإشعار الآن
          </button>
        </div>
      </div>



      {/* VIP Management */}
      <div className="premium-card">
        <h3 style={{ color: 'white', margin: '0 0 10px 0', fontSize: '16px', fontWeight: 'bold' }}>تفعيل اشتراك VIP يدوياً 👑</h3>
        <p style={{ fontSize: '12px', color: '#888', marginBottom: '12px' }}>قم بنسخ معرف المستخدم (UID) من طلبات الجوائز أو من لوحة قاعدة البيانات لتفعيل حسابه مجاناً.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <input 
            type="text" 
            value={searchUid} 
            onChange={(e) => setSearchUid(e.target.value)} 
            placeholder="أدخل معرف المستخدم (UID)..."
            className="modern-input"
            style={{ margin: 0 }}
          />
          <button 
            onClick={handleToggleVip} 
            style={{ 
              width: '100%', 
              padding: '12px', 
              background: 'linear-gradient(135deg, #9b59b6 0%, #8e44ad 100%)', 
              color: 'white', 
              border: 'none', 
              borderRadius: '12px', 
              cursor: 'pointer', 
              fontWeight: 'bold',
              fontSize: '15px',
              boxShadow: '0 4px 15px rgba(142, 68, 173, 0.3)'
            }}
          >
            منح رتبة VIP للمستخدم
          </button>
        </div>
      </div>

      {/* Prize Claims (Requests received) */}
      <div className="premium-card" style={{ border: '1px solid rgba(241, 196, 15, 0.35)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '20px' }}>🎁</span>
            <h3 style={{ color: '#f1c40f', margin: 0, fontSize: '16px', fontWeight: 'bold' }}>طلبات استلام الجوائز</h3>
          </div>
          <button 
            onClick={fetchPrizeClaims} 
            style={{ background: 'transparent', color: '#f1c40f', border: '1px solid rgba(241,196,15,0.4)', cursor: 'pointer', borderRadius: '8px', padding: '6px 12px', fontSize: '12px', fontWeight: 'bold' }}
          >
            تحديث الطلبات 🔄
          </button>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {prizeClaims.map(claim => (
            <div 
              key={claim.id} 
              style={{ 
                background: 'rgba(255,255,255,0.03)', 
                padding: '15px', 
                borderRadius: '14px', 
                border: '1px solid rgba(255, 255, 255, 0.05)',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 'bold', fontSize: '16px', color: 'white' }}>{claim.username}</span>
                <span style={{ background: '#2ecc71', color: 'black', padding: '3px 10px', borderRadius: '10px', fontWeight: 'bold', fontSize: '12px' }}>
                  {claim.points} نقطة
                </span>
              </div>
              <div style={{ color: '#aaa', fontSize: '11px' }}>وقت الطلب: {new Date(claim.timestamp?.toMillis?.() || Date.now()).toLocaleString('ar-JO')}</div>
              <div style={{ color: '#f1c40f', fontWeight: 'bold', fontSize: '13px', padding: '8px 12px', background: 'rgba(241,196,15,0.08)', borderRadius: '8px', border: '1px dashed rgba(241,196,15,0.25)', marginTop: '4px' }}>
                 وسيلة التواصل: {claim.contact}
              </div>
              <div style={{ color: '#777', fontSize: '11px', fontFamily: 'monospace', marginTop: '2px' }}>UID: {claim.uid}</div>
            </div>
          ))}
          {prizeClaims.length === 0 && (
            <div style={{ color: '#aaa', textAlign: 'center', padding: '20px', background: 'rgba(255,255,255,0.01)', borderRadius: '12px', border: '1px dashed rgba(255,255,255,0.06)' }}>
              لا توجد أي طلبات مستلمة حالياً
            </div>
          )}
        </div>
      </div>

      {/* Winners Log */}
      <div className="premium-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '20px' }}>📝</span>
            <h3 style={{ color: 'white', margin: 0, fontSize: '16px', fontWeight: 'bold' }}>سجل الانتصارات الأخيرة</h3>
          </div>
          <button 
            onClick={fetchWinners} 
            style={{ background: 'transparent', color: 'white', border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer', borderRadius: '8px', padding: '6px 12px', fontSize: '12px' }}
          >
            تحديث السجل 🔄
          </button>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {winners.map(w => (
            <div 
              key={w.id} 
              style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                background: 'rgba(255,255,255,0.02)', 
                padding: '10px 14px', 
                borderRadius: '10px',
                borderBottom: '1px solid rgba(255,255,255,0.04)'
              }}
            >
              <div>
                <span style={{ color: '#2ecc71', fontWeight: 'bold', fontSize: '14px' }}>{w.username}</span>
                <span style={{ color: '#888', fontSize: '11px', display: 'block', marginTop: '2px' }}>
                  {w.timestamp && new Date(w.timestamp.toMillis?.() || Date.now()).toLocaleDateString('ar-JO')}
                </span>
              </div>
              <span style={{ fontWeight: 'bold', color: 'white', fontSize: '14px' }}>{w.score} نقطة</span>
            </div>
          ))}
          {winners.length === 0 && (
            <div style={{ color: '#aaa', textAlign: 'center', padding: '15px' }}>لا توجد سجلات مكتملة بعد</div>
          )}
        </div>
      </div>

    </div>
  );
};
