import { Deck } from './Deck';
import { Player } from './Player';
import { Card, Suit } from './Card';
import { Game } from './Game';

export type GameState = 'WAITING' | 'BIDDING' | 'SELECTING_TRUMP' | 'PLAYING' | 'FINISHED';

export class TarneebGame implements Game {
  public players: Player[] = [];
  public state: GameState = 'WAITING';
  public deck: Deck;
  
  public currentBid: number = 2; // minimum valid bid is 3
  public highestBidderIndex: number = -1;
  public trumpSuit: Suit | null = null;
  
  public currentTurnIndex: number = 0;
  private consecutivePasses: number = 0;
  
  // Teams: Team 1 (Player 0, 2) vs Team 2 (Player 1, 3)
  public team1Tricks: number = 0;
  public team2Tricks: number = 0;
  
  public team1Score: number = 0;
  public team2Score: number = 0;

  public currentTrick: { playerIndex: number, card: Card }[] = [];
  public leadSuit: Suit | null = null;
  public tricksPlayed: number = 0;

  constructor() {
    this.deck = new Deck();
  }

  addPlayer(player: Player) {
    if (this.players.length < 4) {
      this.players.push(player);
    }
  }

  startRound() {
    if (this.players.length !== 4) throw new Error("Need exactly 4 players");
    this.state = 'BIDDING';
    this.deck.initialize();
    this.deck.shuffle();
    
    // Deal 13 cards to each player
    this.players.forEach(p => p.cards = []); 
    for (let i = 0; i < 4; i++) {
      this.players[i].addCards(this.deck.deal(13));
    }
    
    this.currentBid = 2; // minimum bid is 3
    this.highestBidderIndex = -1;
    this.currentTurnIndex = 0;
    this.consecutivePasses = 0;
    this.team1Tricks = 0;
    this.team2Tricks = 0;
    this.trumpSuit = null;
    this.currentTrick = [];
    this.leadSuit = null;
    this.tricksPlayed = 0;
  }

  placeBid(playerIndex: number, bid: number | 'PASS') {
    if (this.state !== 'BIDDING' || playerIndex !== this.currentTurnIndex) return;

    if (bid === 'PASS') {
      this.consecutivePasses++;
    } else {
      if (bid > this.currentBid && bid <= 13) {
        this.currentBid = bid;
        this.highestBidderIndex = playerIndex;
        this.consecutivePasses = 0;
      }
    }
    
    if (this.consecutivePasses >= 3 || this.currentBid === 13) {
      if (this.highestBidderIndex === -1) {
        this.startRound(); // redeal
        return;
      }
      this.state = 'SELECTING_TRUMP';
      this.currentTurnIndex = this.highestBidderIndex;
    } else {
      this.currentTurnIndex = (this.currentTurnIndex + 1) % 4;
    }
  }

  selectTrump(playerIndex: number, suit: Suit) {
    if (this.state !== 'SELECTING_TRUMP' || playerIndex !== this.currentTurnIndex) return;
    this.trumpSuit = suit;
    this.state = 'PLAYING';
    this.currentTurnIndex = this.highestBidderIndex;
  }

  playCard(playerIndex: number, cardIndex: number) {
    if (this.state !== 'PLAYING' || playerIndex !== this.currentTurnIndex) return;
    
    const player = this.players[playerIndex];
    const cardToPlay = player.cards[cardIndex];
    if (!cardToPlay) return;

    // Validate if the player MUST play the lead suit
    if (this.leadSuit && cardToPlay.suit !== this.leadSuit) {
      const hasLeadSuit = player.cards.some(c => c.suit === this.leadSuit);
      if (hasLeadSuit) {
        return; // Invalid play, must follow lead suit
      }
    }

    const playedCard = player.playCard(cardIndex)!;
    
    if (this.currentTrick.length === 0) {
      this.leadSuit = playedCard.suit;
    }

    this.currentTrick.push({ playerIndex, card: playedCard });
    
    if (this.currentTrick.length === 4) {
      this.resolveTrick();
    } else {
      this.currentTurnIndex = (this.currentTurnIndex + 1) % 4;
    }
  }

  private resolveTrick() {
    let winningPlay = this.currentTrick[0];

    for (let i = 1; i < 4; i++) {
      const play = this.currentTrick[i];
      const currentWinningCard = winningPlay.card;
      const playedCard = play.card;

      if (playedCard.suit === this.trumpSuit) {
        if (currentWinningCard.suit !== this.trumpSuit) {
          winningPlay = play;
        } else if (playedCard.value > currentWinningCard.value) {
          winningPlay = play;
        }
      } else if (playedCard.suit === this.leadSuit && currentWinningCard.suit !== this.trumpSuit) {
        if (playedCard.value > currentWinningCard.value) {
          winningPlay = play;
        }
      }
    }

    const winnerIndex = winningPlay.playerIndex;
    
    if (winnerIndex === 0 || winnerIndex === 2) {
      this.team1Tricks++;
    } else {
      this.team2Tricks++;
    }

    this.tricksPlayed++;
    
    if (this.tricksPlayed === 13) {
      this.resolveRound();
    } else {
      this.currentTurnIndex = winnerIndex;
      this.currentTrick = [];
      this.leadSuit = null;
    }
  }

  private resolveRound() {
    // Calculate scores based on the bid
    const team1Bid = (this.highestBidderIndex === 0 || this.highestBidderIndex === 2) ? this.currentBid : 0;
    const team2Bid = (this.highestBidderIndex === 1 || this.highestBidderIndex === 3) ? this.currentBid : 0;

    if (team1Bid > 0) {
      if (this.team1Tricks >= team1Bid) {
        this.team1Score += this.team1Tricks;
      } else {
        this.team1Score -= team1Bid;
      }
      this.team2Score += this.team2Tricks;
    } else {
      if (this.team2Tricks >= team2Bid) {
        this.team2Score += this.team2Tricks;
      } else {
        this.team2Score -= team2Bid;
      }
      this.team1Score += this.team1Tricks;
    }

    // Target score to win
    if (this.team1Score >= 31 || this.team2Score >= 31) {
      this.state = 'FINISHED';
    } else {
      this.startRound();
    }
  }
}
