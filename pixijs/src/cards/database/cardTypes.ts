export type CardKind = 'attribute' | 'character' | (string & {});

export type CardAttributes = Record<string, unknown>;

export interface CardRecord {
  id: string;
  kind: CardKind;
  name: string;
  description?: string;
  attributes?: CardAttributes;
  tags?: string[];
}

export interface CardQuery {
  kind?: CardKind;
  tag?: string;
}

export interface CardDatabaseBackend {
  getCardById(cardId: string): Promise<CardRecord | undefined>;
  listCards(query?: CardQuery): Promise<CardRecord[]>;
  upsertCard(card: CardRecord): Promise<void>;
  removeCard(cardId: string): Promise<boolean>;
  setCards(cards: CardRecord[]): Promise<void>;
  clear(): Promise<void>;
}
