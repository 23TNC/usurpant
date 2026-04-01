import type { CardDatabaseBackend, CardQuery, CardRecord } from './cardTypes';

/**
 * In-memory test implementation used while the runtime database integration is pending.
 */
export class TestCardDatabase implements CardDatabaseBackend {
  private readonly cardsById = new Map<string, CardRecord>();

  constructor(seedCards: CardRecord[] = []) {
    this.setCardsSync(seedCards);
  }

  public async getCardById(cardId: string): Promise<CardRecord | undefined> {
    return this.cloneCard(this.cardsById.get(cardId));
  }

  public async listCards(query?: CardQuery): Promise<CardRecord[]> {
    const allCards = Array.from(this.cardsById.values());
    const filteredCards = allCards.filter((card) => this.matchesQuery(card, query));
    return filteredCards.map((card) => this.cloneCardRequired(card));
  }

  public async upsertCard(card: CardRecord): Promise<void> {
    this.cardsById.set(card.id, this.cloneCardRequired(card));
  }

  public async removeCard(cardId: string): Promise<boolean> {
    return this.cardsById.delete(cardId);
  }

  public async setCards(cards: CardRecord[]): Promise<void> {
    this.setCardsSync(cards);
  }

  public async clear(): Promise<void> {
    this.cardsById.clear();
  }

  private setCardsSync(cards: CardRecord[]): void {
    this.cardsById.clear();
    for (const card of cards) {
      this.cardsById.set(card.id, this.cloneCardRequired(card));
    }
  }

  private matchesQuery(card: CardRecord, query?: CardQuery): boolean {
    if (!query) {
      return true;
    }

    if (query.kind && card.kind !== query.kind) {
      return false;
    }

    if (query.tag && !card.tags?.includes(query.tag)) {
      return false;
    }

    return true;
  }

  private cloneCardRequired(card: CardRecord): CardRecord {
    return {
      ...card,
      attributes: card.attributes ? structuredClone(card.attributes) : undefined,
      tags: card.tags ? [...card.tags] : undefined
    };
  }

  private cloneCard(card?: CardRecord): CardRecord | undefined {
    return card ? this.cloneCardRequired(card) : undefined;
  }
}
