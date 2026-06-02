import React, { useState } from 'react';
import { auth, db } from '../firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';

import logoImg from '../assets/logo.png';

export const Login: React.FC<{ onLogin: () => void }> = ({ onLogin }) => {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isRegistering) {
        if (!username) {
            setError(t('enter_name'));
            setLoading(false);
            return;
        }
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        // Save user profile to Firestore
        await setDoc(doc(db, 'users', userCredential.user.uid), {
          username,
          gamesPlayed: 0,
          points: 0,
          subscribed: false
        });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      onLogin();
    } catch (err: any) {
      if(err.code === 'auth/email-already-in-use') setError(t('email_in_use'));
      else if(err.code === 'auth/invalid-credential') setError(t('invalid_cred'));
      else setError(err.message);
    }
    setLoading(false);
  };

  return (
    <div className="glass-panel" style={{ width: '100%', maxWidth: '400px', margin: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '15px', marginTop: '10px' }}>
        <img 
          src={logoImg} 
          alt="شعار تحدي الطرنيب" 
          style={{ 
            width: '100px', 
            height: '100px', 
            borderRadius: '20px', 
            boxShadow: '0 8px 20px rgba(0,0,0,0.6)', 
            border: '2px solid rgba(243, 156, 18, 0.4)',
            objectFit: 'cover'
          }} 
        />
      </div>
      <h1 style={{ color: '#f39c12', textAlign: 'center', marginBottom: '20px', fontSize: '32px', marginTop: 0 }}>
        {isRegistering ? t('register_title') : t('login_title')}
      </h1>
      
      {error && <div style={{ color: '#e74c3c', background: 'rgba(231, 76, 60, 0.2)', padding: '10px', borderRadius: '5px', marginBottom: '15px', textAlign: 'center', border: '1px solid #e74c3c' }}>{error}</div>}

      <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
        {isRegistering && (
          <input
            type="text"
            className="modern-input"
            placeholder={t('player_name_placeholder')}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        )}
        <input
          type="email"
          className="modern-input"
          placeholder={t('email_placeholder')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          className="modern-input"
          placeholder={t('password_placeholder')}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? t('please_wait') : (isRegistering ? t('create_account_btn') : t('login_btn'))}
        </button>
      </form>

      <p style={{ textAlign: 'center', marginTop: '20px', color: '#ccc', cursor: 'pointer', textDecoration: 'underline' }} onClick={() => { setIsRegistering(!isRegistering); setError(''); }}>
        {isRegistering ? t('have_account') : t('new_player')}
      </p>

      {/* Privacy Policy Link */}
      <a 
        href="/privacy.html" 
        target="_blank" 
        rel="noopener noreferrer"
        style={{ 
          marginTop: '15px', 
          color: 'rgba(255,255,255,0.4)', 
          fontSize: '11px', 
          textDecoration: 'underline', 
          cursor: 'pointer',
          textAlign: 'center'
        }}
      >
        سياسة الخصوصية | Privacy Policy
      </a>
    </div>
  );
};
