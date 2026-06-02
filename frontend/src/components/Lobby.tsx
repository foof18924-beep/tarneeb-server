import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface LobbyProps {
  onJoin: (username: string, roomCode: string) => void;
}

export const Lobby: React.FC<LobbyProps> = ({ onJoin }) => {
  const { t, i18n } = useTranslation();
  const [username, setUsername] = useState('');
  const [roomCode, setRoomCode] = useState('');

  const toggleLanguage = () => {
    i18n.changeLanguage(i18n.language.startsWith('ar') ? 'en' : 'ar');
  };

  return (
    <div className="glass-panel" style={{ position: 'relative' }}>
      {/* Language Toggle Button */}
      <button 
        onClick={toggleLanguage} 
        style={{ position: 'absolute', top: 10, left: 10, background: 'transparent', border: '1px solid white', color: 'white', borderRadius: '4px', cursor: 'pointer' }}
      >
        {i18n.language.startsWith('ar') ? t('lang_en') : t('lang_ar')}
      </button>

      <h1 style={{ color: '#f39c12', marginBottom: '20px', fontSize: '32px', marginTop: '30px' }}>
        {t('app_title')}
      </h1>
      
      <input
        className="modern-input"
        placeholder={t('username')}
        value={username}
        onChange={e => setUsername(e.target.value)}
      />
      
      <input
        className="modern-input"
        placeholder={t('room_code')}
        value={roomCode}
        onChange={e => setRoomCode(e.target.value)}
      />
      
      <button className="btn-primary" onClick={() => {
        if(username && roomCode) onJoin(username, roomCode);
      }} style={{width: '100%'}}>
        {t('join_room')}
      </button>
    </div>
  );
};
