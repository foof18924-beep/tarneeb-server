import React from 'react';

interface CardProps {
  suit: string;
  rank: string;
  onClick?: () => void;
  style?: React.CSSProperties;
  isTarneeb?: boolean;
}

const suitSymbols: Record<string, string> = {
  'Hearts': '♥',
  'Diamonds': '♦',
  'Clubs': '♣',
  'Spades': '♠'
};

const suitColors: Record<string, string> = {
  'Hearts': 'card-red',
  'Diamonds': 'card-red',
  'Clubs': 'card-black',
  'Spades': 'card-black'
};

export const PlayingCard: React.FC<CardProps> = ({ suit, rank, onClick, style, isTarneeb }) => {
  const colorClass = suitColors[suit] || 'card-black';
  const symbol = suitSymbols[suit] || suit;
  const tarneebClass = isTarneeb ? 'tarneeb-suit-card' : '';

  return (
    <div className={`playing-card ${colorClass} ${tarneebClass}`} onClick={onClick} style={style}>
      <div className="card-top">{rank} {symbol}</div>
      <div className="card-center" style={{ textAlign: 'center', fontSize: '32px' }}>{symbol}</div>
      <div className="card-bottom" style={{ transform: 'rotate(180deg)' }}>{rank} {symbol}</div>
    </div>
  );
};
