import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';

export const WinnersLog: React.FC = () => {
  const [winners, setWinners] = useState<any[]>([]);

  useEffect(() => {
    const fetchWinners = async () => {
      try {
        const q = query(collection(db, 'winners'), orderBy('timestamp', 'desc'), limit(50));
        const querySnapshot = await getDocs(q);
        const data: any[] = [];
        querySnapshot.forEach((doc) => {
          data.push({ id: doc.id, ...doc.data() });
        });
        setWinners(data);
      } catch (e) {
        console.error("Error fetching winners log", e);
      }
    };
    fetchWinners();
  }, []);

  return (
    <div className="premium-card" style={{ width: '100%', maxWidth: '450px', margin: '0 auto', padding: '24px' }}>
      <div style={{ textAlign: 'center', marginBottom: '22px' }}>
        <span style={{ fontSize: '32px', display: 'block', marginBottom: '8px' }}>🎖️</span>
        <h2 style={{ color: '#f1c40f', margin: '0', fontSize: '24px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          سجل الفائزين
        </h2>
        <p style={{ color: '#888', fontSize: '13px', margin: '5px 0 0 0' }}>أحدث الانتصارات والمباريات المكتملة</p>
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {winners.map((w, idx) => {
          // Format date if timestamp exists
          let timeString = '';
          if (w.timestamp && w.timestamp.toDate) {
             const date = w.timestamp.toDate();
             timeString = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          }

          return (
            <div 
              key={w.id} 
              style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                background: 'rgba(255,255,255,0.03)', 
                padding: '14px 16px', 
                borderRadius: '14px', 
                border: '1px solid rgba(255, 255, 255, 0.05)',
                borderLeft: '4px solid #f1c40f',
                boxShadow: '0 4px 10px rgba(0,0,0,0.15)' 
              }}
            >
              <div>
                <span style={{ display: 'block', color: 'white', fontSize: '16px', fontWeight: 'bold' }}>{w.username}</span>
                <span style={{ display: 'block', color: '#888', fontSize: '11px', marginTop: '3px' }}>{timeString}</span>
              </div>
              <div style={{ background: 'linear-gradient(135deg, #2ecc71 0%, #27ae60 100%)', color: 'white', padding: '6px 14px', borderRadius: '12px', fontWeight: '900', fontSize: '14px', boxShadow: '0 4px 10px rgba(46,204,113,0.2)' }}>
                {w.score} نقطة
              </div>
            </div>
          )
        })}
        
        {winners.length === 0 && (
          <div style={{ color: '#aaa', textAlign: 'center', padding: '30px 20px', background: 'rgba(255,255,255,0.01)', borderRadius: '14px', border: '1px dashed rgba(255,255,255,0.08)' }}>
            لا يوجد سجل فائزين حتى الآن... كن أول الفائزين!
          </div>
        )}
      </div>
    </div>
  );
};
