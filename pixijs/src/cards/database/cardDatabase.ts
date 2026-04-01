import staticCards from '../../assets/cards.static.json';

import type { CardDatabaseBackend, CardQuery, CardRecord } from './cardTypes';
import { TestCardDatabase } from './testCardDatabase';

/**
 * Facade for card data access.
 *
 * This class currently delegates to an in-memory test backend and can later
 * be switched to a SpacetimeDB-backed implementation without changing callers.
 */
export class CardDatabase {
  private backend: CardDatabaseBackend;

  constructor(backend: CardDatabaseBackend = new TestCardDatabase()) {
    this.backend = backend;
  }

  public async initializeWithStaticCards(): Promise<void> {
    await this.backend.setCards(staticCards as CardRecord[]);
  }

  public async getCardById(cardId: string): Promise<CardRecord | undefined> {
    return this.backend.getCardById(cardId);
  }

  public async listCards(query?: CardQuery): Promise<CardRecord[]> {
    return this.backend.listCards(query);
  }

  public async upsertCard(card: CardRecord): Promise<void> {
    await this.backend.upsertCard(card);
  }

  public async removeCard(cardId: string): Promise<boolean> {
    return this.backend.removeCard(cardId);
  }

  public async replaceAllCards(cards: CardRecord[]): Promise<void> {
    await this.backend.setCards(cards);
  }

  public async clear(): Promise<void> {
    await this.backend.clear();
  }

  public setBackend(backend: CardDatabaseBackend): void {
    this.backend = backend;
  }
}

export const cardDatabase = new CardDatabase();
