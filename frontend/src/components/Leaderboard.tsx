import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, limit, getDocs, doc, onSnapshot } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';

export const Leaderboard: React.FC<{ currentUserUid?: string }> = ({ currentUserUid }) => {
  const { t } = useTranslation();
  const [leaders, setLeaders] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [contact, setContact] = useState('');
  const [challengeEnded, setChallengeEnded] = useState(false);

  useEffect(() => {
    const fetchLeaders = async () => {
      try {
        const q = query(collection(db, 'users'), orderBy('points', 'desc'), limit(10));
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setLeaders(data);
      } catch(e) {
        console.error("Error fetching leaderboard", e);
        setLeaders([
          { id: '1', username: 'أحمد', points: 3500 },
          { id: '2', username: 'سالم', points: 2800 },
          { id: '3', username: 'عمر', points: 1900 },
        ]);
      }
    };

    const unsubSettings = onSnapshot(doc(db, 'settings', 'global'), (snap) => {
      if (snap.exists() && snap.data().challengeEnded !== undefined) {
        setChallengeEnded(snap.data().challengeEnded);
      }
    });

    fetchLeaders();
    return () => unsubSettings();
  }, []);

  const isTopPlayer = leaders.length > 0 && leaders[0].id === currentUserUid;
  const topPlayer = isTopPlayer ? leaders[0] : null;

  return (
    <div className="premium-card" style={{ marginTop: '20px', width: '100%', maxWidth: '450px', padding: '24px' }}>
      <div style={{ textAlign: 'center', marginBottom: '22px' }}>
        <span style={{ fontSize: '32px', display: 'block', marginBottom: '8px' }}>🏆</span>
        <h2 style={{ color: '#f1c40f', margin: '0', fontSize: '24px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {t('leaderboard_title')}
        </h2>
        <p style={{ color: '#888', fontSize: '13px', margin: '5px 0 0 0' }}>ترتيب المتصدرين الحالي للتحدي</p>
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {leaders.map((user, idx) => {
          let itemBg = 'rgba(255, 255, 255, 0.03)';
          let borderStyle = '1px solid rgba(255, 255, 255, 0.06)';
          let rankIcon = '';
          let rankColor = 'white';

          if (idx === 0) {
            itemBg = 'linear-gradient(135deg, rgba(241, 196, 15, 0.15) 0%, rgba(243, 156, 18, 0.05) 100%)';
            borderStyle = '1px solid rgba(241, 196, 15, 0.4)';
            rankIcon = '👑';
            rankColor = '#f1c40f';
          } else if (idx === 1) {
            itemBg = 'linear-gradient(135deg, rgba(189, 195, 199, 0.12) 0%, rgba(189, 195, 199, 0.03) 100%)';
            borderStyle = '1px solid rgba(189, 195, 199, 0.25)';
            rankIcon = '🥈';
            rankColor = '#bdc3c7';
          } else if (idx === 2) {
            itemBg = 'linear-gradient(135deg, rgba(211, 84, 0, 0.1) 0%, rgba(211, 84, 0, 0.02) 100%)';
            borderStyle = '1px solid rgba(211, 84, 0, 0.2)';
            rankIcon = '🥉';
            rankColor = '#d35400';
          }

          const isCurrentUser = user.id === currentUserUid;

          return (
            <div 
              key={user.id} 
              style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                background: itemBg, 
                padding: '12px 16px', 
                borderRadius: '14px', 
                border: borderStyle,
                boxShadow: isCurrentUser ? '0 0 10px rgba(46, 204, 113, 0.25)' : 'none',
                outline: isCurrentUser ? '1.5px solid #2ecc71' : 'none'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '15px', color: rankColor, fontWeight: 'bold', width: '22px', textAlign: 'center' }}>
                  {rankIcon || `${idx + 1}`}
                </span>
                <span style={{ fontSize: '16px', fontWeight: isCurrentUser ? 'bold' : 'normal', color: isCurrentUser ? '#2ecc71' : 'white' }}>
                  {user.username || `لاعب ${user.id.substring(0, 4)}`}
                  {isCurrentUser && <span style={{ fontSize: '11px', color: '#2ecc71', marginRight: '6px' }}>{t('you')}</span>}
                </span>
              </div>
              <span style={{ fontWeight: '900', color: rankColor, fontSize: '16px' }}>
                {user.points || 0} <span style={{ fontSize: '12px', fontWeight: 'normal', color: '#aaa' }}>{t('points')}</span>
              </span>
            </div>
          );
        })}
      </div>
      
      {/* Prize claim button for the winner ONLY when challenge is ended by admin */}
      {challengeEnded && isTopPlayer && (
        <>
          <button 
            className="play-btn-premium" 
            style={{ 
              width: '100%', 
              marginTop: '20px', 
              background: 'linear-gradient(135deg, #27ae60 0%, #2ecc71 100%)', 
              boxShadow: '0 8px 20px rgba(46, 204, 113, 0.3)',
              fontSize: '18px',
              padding: '12px 20px'
            }} 
            onClick={() => setShowForm(!showForm)}
          >
            {t('claim_prize_btn')}
          </button>

          {showForm && (
            <div className="premium-card" style={{ marginTop: '15px', background: 'rgba(10, 10, 15, 0.65)', border: '1px solid #2ecc71', padding: '18px' }}>
              <h3 style={{ color: '#2ecc71', margin: '0 0 10px 0', fontSize: '18px', fontWeight: 'bold' }}>{t('congrats')}</h3>
              <p style={{ fontSize: '13px', color: '#ccc', lineHeight: '1.5', marginBottom: '15px' }}>{t('prize_desc')}</p>
              <input 
                className="modern-input" 
                placeholder={t('contact_placeholder')} 
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                style={{ marginBottom: '12px' }}
              />
              <button 
                className="play-btn-premium" 
                style={{ width: '100%', padding: '10px', fontSize: '16px', background: '#27ae60', margin: '0' }} 
                onClick={async () => {
                  if(!contact) return;
                  try {
                    const { addDoc, collection, serverTimestamp } = await import('firebase/firestore');
                    await addDoc(collection(db, 'prize_claims'), {
                      uid: topPlayer.id,
                      username: topPlayer.username,
                      points: topPlayer.points,
                      contact: contact,
                      timestamp: serverTimestamp()
                    });
                    alert(t('prize_success'));
                    setShowForm(false);
                  } catch(e) {
                    console.error(e);
                    alert('حدث خطأ أثناء الإرسال');
                  }
                }}
              >
                {t('submit_prize')}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
