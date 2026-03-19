import { BitmapFont, Container, FederatedPointerEvent, Texture } from 'pixi.js';

import { CardView, type CardViewOptions } from './cardView';

export interface CardTextureAtlas {
  subscribeTexture(textureId: string): Texture;
  unsubscribeTexture(textureId: string): void;
}

export interface CardStackData {
  stackId: string;
  cardTypeId: string;
  title: string;
  backgroundTextureId: string;
  artTextureId: string;
  stackBadgeTextureId: string;
  count: number;
  x: number;
  y: number;
}

export interface CardManagerOptions {
  cardView?: CardViewOptions;
  titleFontFamily?: string;
  stackFontFamily?: string;
  titleFontSize?: number;
  stackFontSize?: number;
}

interface DragState {
  stackId: string;
  offsetX: number;
  offsetY: number;
}

interface CardStackEntry {
  data: CardStackData;
  view: CardView;
}

const DEFAULT_TITLE_FONT_FAMILY = 'Arial';
const DEFAULT_STACK_FONT_FAMILY = 'Arial';

/**
 * Owns card stack state, visual card objects, and card interaction flow.
 */
export class CardManager {
  private readonly root: Container;
  private readonly atlas: CardTextureAtlas;
  private readonly options: CardManagerOptions;

  private static fontsRegistered = false;

  private readonly stacks = new Map<string, CardStackEntry>();
  private dragState?: DragState;

  constructor(root: Container, atlas: CardTextureAtlas, options?: CardManagerOptions) {
    this.root = root;
    this.atlas = atlas;
    this.options = options ?? {};

    this.ensureBitmapFontsRegistered();

    this.root.eventMode = 'static';
    this.root.on('pointermove', this.onPointerMove, this);
    this.root.on('pointerup', this.onPointerUp, this);
    this.root.on('pointerupoutside', this.onPointerUp, this);
  }

  public upsertStack(data: CardStackData): void {
    const normalizedData = this.normalizeStackData(data);
    const existing = this.stacks.get(normalizedData.stackId);

    if (existing) {
      this.updateExistingStack(existing, normalizedData);
      return;
    }

    const entry = this.createStackEntry(normalizedData);
    this.stacks.set(entry.data.stackId, entry);
    this.root.addChild(entry.view);
  }

  public removeStack(stackId: string): void {
    const entry = this.stacks.get(stackId);
    if (!entry) {
      return;
    }

    this.releaseStackTextures(entry.data);
    entry.view.removeFromParent();
    entry.view.destroy();
    this.stacks.delete(stackId);

    if (this.dragState?.stackId === stackId) {
      this.dragState = undefined;
    }
  }

  public getStack(stackId: string): CardStackData | undefined {
    const entry = this.stacks.get(stackId);
    return entry ? { ...entry.data } : undefined;
  }

  public getAllStacks(): CardStackData[] {
    return Array.from(this.stacks.values()).map((entry) => ({ ...entry.data }));
  }

  public destroy(): void {
    this.root.off('pointermove', this.onPointerMove, this);
    this.root.off('pointerup', this.onPointerUp, this);
    this.root.off('pointerupoutside', this.onPointerUp, this);

    const stackIds = Array.from(this.stacks.keys());
    for (const stackId of stackIds) {
      this.removeStack(stackId);
    }

    this.dragState = undefined;
  }

  private createStackEntry(data: CardStackData): CardStackEntry {
    const view = new CardView({
      ...(this.options.cardView ?? {}),
      titleFontName: 'card-title',
      stackFontName: 'card-stack'
    });

    view.setBackgroundTexture(this.atlas.subscribeTexture(data.backgroundTextureId));
    view.setArtTexture(this.atlas.subscribeTexture(data.artTextureId));
    view.setStackBadgeTexture(this.atlas.subscribeTexture(data.stackBadgeTextureId));
    view.setTitle(data.title);
    view.setStackCount(data.count);
    view.position.set(data.x, data.y);

    view.on('pointerdown', (event: FederatedPointerEvent) => {
      this.onStackPointerDown(data.stackId, event);
    });

    return { data, view };
  }

  private updateExistingStack(existing: CardStackEntry, nextData: CardStackData): void {
    const previousData = existing.data;

    if (previousData.backgroundTextureId !== nextData.backgroundTextureId) {
      this.atlas.unsubscribeTexture(previousData.backgroundTextureId);
      existing.view.setBackgroundTexture(this.atlas.subscribeTexture(nextData.backgroundTextureId));
    }

    if (previousData.artTextureId !== nextData.artTextureId) {
      this.atlas.unsubscribeTexture(previousData.artTextureId);
      existing.view.setArtTexture(this.atlas.subscribeTexture(nextData.artTextureId));
    }

    if (previousData.stackBadgeTextureId !== nextData.stackBadgeTextureId) {
      this.atlas.unsubscribeTexture(previousData.stackBadgeTextureId);
      existing.view.setStackBadgeTexture(this.atlas.subscribeTexture(nextData.stackBadgeTextureId));
    }

    existing.data = nextData;
    existing.view.setTitle(nextData.title);
    existing.view.setStackCount(nextData.count);
    existing.view.position.set(nextData.x, nextData.y);
  }

  private normalizeStackData(data: CardStackData): CardStackData {
    return {
      ...data,
      count: Math.max(1, Math.floor(data.count))
    };
  }

  private releaseStackTextures(data: CardStackData): void {
    this.atlas.unsubscribeTexture(data.backgroundTextureId);
    this.atlas.unsubscribeTexture(data.artTextureId);
    this.atlas.unsubscribeTexture(data.stackBadgeTextureId);
  }

  private onStackPointerDown(stackId: string, event: FederatedPointerEvent): void {
    const entry = this.stacks.get(stackId);
    if (!entry) {
      return;
    }

    event.stopPropagation();

    const localPosition = event.getLocalPosition(entry.view);
    const selectedStackBadge = entry.view.isStackBadgeHit(localPosition.x, localPosition.y);

    let dragTarget = entry;

    if (!selectedStackBadge && entry.data.count > 1) {
      dragTarget = this.extractSingleCardFromStack(entry, event.global.x, event.global.y);
    }

    dragTarget.view.zIndex = this.root.children.length + 1;

    const localToTarget = event.getLocalPosition(this.root);
    this.dragState = {
      stackId: dragTarget.data.stackId,
      offsetX: localToTarget.x - dragTarget.view.x,
      offsetY: localToTarget.y - dragTarget.view.y
    };
  }

  private extractSingleCardFromStack(sourceEntry: CardStackEntry, x: number, y: number): CardStackEntry {
    const remainingCount = Math.max(1, sourceEntry.data.count - 1);
    sourceEntry.data = {
      ...sourceEntry.data,
      count: remainingCount
    };
    sourceEntry.view.setStackCount(sourceEntry.data.count);

    const newStackId = this.generateDetachedStackId(sourceEntry.data.stackId);
    const detachedData = this.normalizeStackData({
      ...sourceEntry.data,
      stackId: newStackId,
      count: 1,
      x,
      y
    });

    const detachedEntry = this.createStackEntry(detachedData);
    this.stacks.set(detachedData.stackId, detachedEntry);
    this.root.addChild(detachedEntry.view);

    return detachedEntry;
  }

  private generateDetachedStackId(parentStackId: string): string {
    let sequence = 1;
    let candidate = `${parentStackId}::split-${sequence}`;

    while (this.stacks.has(candidate)) {
      sequence += 1;
      candidate = `${parentStackId}::split-${sequence}`;
    }

    return candidate;
  }

  private onPointerMove(event: FederatedPointerEvent): void {
    if (!this.dragState) {
      return;
    }

    const entry = this.stacks.get(this.dragState.stackId);
    if (!entry) {
      this.dragState = undefined;
      return;
    }

    const local = event.getLocalPosition(this.root);
    const nextX = local.x - this.dragState.offsetX;
    const nextY = local.y - this.dragState.offsetY;

    entry.data = {
      ...entry.data,
      x: nextX,
      y: nextY
    };

    entry.view.position.set(nextX, nextY);
  }

  private onPointerUp(): void {
    if (!this.dragState) {
      return;
    }

    const entry = this.stacks.get(this.dragState.stackId);
    if (entry) {
      entry.view.zIndex = 0;
    }

    this.dragState = undefined;
  }

  private ensureBitmapFontsRegistered(): void {
    if (CardManager.fontsRegistered) {
      return;
    }

    BitmapFont.install({
      name: 'card-title',
      style: {
        fontFamily: this.options.titleFontFamily ?? DEFAULT_TITLE_FONT_FAMILY,
        fontSize: this.options.titleFontSize ?? 18,
        fill: 0xffffff
      }
    });

    BitmapFont.install({
      name: 'card-stack',
      style: {
        fontFamily: this.options.stackFontFamily ?? DEFAULT_STACK_FONT_FAMILY,
        fontSize: this.options.stackFontSize ?? 16,
        fill: 0xffffff,
        fontWeight: 'bold'
      }
    });

    CardManager.fontsRegistered = true;
  }
}
