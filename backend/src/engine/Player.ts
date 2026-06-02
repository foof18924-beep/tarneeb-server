import { Card } from './Card';

export class Player {
  public cards: Card[] = [];
  
  constructor(public id: string, public name: string) {}

  addCards(cards: Card[]) {
    this.cards.push(...cards);
    this.sortCards();
  }

  playCard(cardIndex: number): Card | null {
    if (cardIndex < 0 || cardIndex >= this.cards.length) return null;
    return this.cards.splice(cardIndex, 1)[0];
  }

  private sortCards() {
    // Sort by suit, then by value
    this.cards.sort((a, b) => {
      if (a.suit !== b.suit) {
        return a.suit.localeCompare(b.suit);
      }
      return b.value - a.value; // Descending order
    });
  }
}
