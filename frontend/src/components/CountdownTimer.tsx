import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore';

export const CountdownTimer: React.FC = () => {
  const { t } = useTranslation();
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [prizeFrequency, setPrizeFrequency] = useState('monthly');
  const [challengeEnded, setChallengeEnded] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'global'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.prizeFrequency) setPrizeFrequency(data.prizeFrequency);
        if (data.challengeEnded !== undefined) setChallengeEnded(data.challengeEnded);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date();
      let targetDate = new Date();

      if (prizeFrequency === 'daily') {
        targetDate.setHours(23, 59, 59, 999);
      } else if (prizeFrequency === 'weekly') {
        const daysUntilFriday = (5 + 7 - now.getDay()) % 7;
        // If today is Friday, count down to NEXT Friday
        const daysToAdd = daysUntilFriday === 0 ? 7 : daysUntilFriday;
        targetDate.setDate(now.getDate() + daysToAdd);
        targetDate.setHours(23, 59, 59, 999);
      } else {
        // Monthly
        targetDate = new Date(now.getFullYear(), now.getMonth(), 24);
        if (now.getTime() > targetDate.getTime()) {
          targetDate = new Date(now.getFullYear(), now.getMonth() + 1, 24);
        }
      }

      const difference = targetDate.getTime() - now.getTime();
      if (difference <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0 };
      
      return {
        days: Math.floor(difference / (1000 * 60 * 60 * 24)),
        hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((difference / 1000 / 60) % 60),
        seconds: Math.floor((difference / 1000) % 60)
      };
    };

    setTimeLeft(calculateTimeLeft());
    const timer = setInterval(() => setTimeLeft(calculateTimeLeft()), 1000);
    return () => clearInterval(timer);
  }, [prizeFrequency]);

  return (
    <div className="premium-card" style={{ padding: '15px', textAlign: 'center', marginBottom: '20px' }}>
      <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', color: '#ccc', fontWeight: 'bold' }}>{t('prize_title')}</h3>
      {challengeEnded ? (
        <div style={{ fontWeight: 'bold', fontSize: '20px', color: '#f1c40f', padding: '10px', background: 'rgba(241,196,15,0.08)', borderRadius: '12px', border: '1px dashed #f1c40f' }}>
           التحدي منتهي! جاري تسليم الجوائز للفائزين 🎁
        </div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px' }}>
          <div className="countdown-box-gold">
            <span className="countdown-val">{timeLeft.days}</span>
            <span className="countdown-lbl">{t('day')}</span>
          </div>
          <span style={{ color: '#f1c40f', fontSize: '20px', fontWeight: 'bold' }}>:</span>
          <div className="countdown-box-gold">
            <span className="countdown-val">{timeLeft.hours}</span>
            <span className="countdown-lbl">{t('hour')}</span>
          </div>
          <span style={{ color: '#f1c40f', fontSize: '20px', fontWeight: 'bold' }}>:</span>
          <div className="countdown-box-gold">
            <span className="countdown-val">{timeLeft.minutes}</span>
            <span className="countdown-lbl">{t('minute')}</span>
          </div>
          <span style={{ color: '#f1c40f', fontSize: '20px', fontWeight: 'bold' }}>:</span>
          <div className="countdown-box-gold">
            <span className="countdown-val">{timeLeft.seconds}</span>
            <span className="countdown-lbl">{t('second')}</span>
          </div>
        </div>
      )}
    </div>
  );
};
