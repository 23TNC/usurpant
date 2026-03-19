import { BitmapText, Container, Sprite, type Texture } from 'pixi.js';

export interface CardViewOptions {
  width?: number;
  height?: number;
  artSize?: number;
  artTopPadding?: number;
  titleTopPadding?: number;
  stackBadgeSize?: number;
  stackBadgeInset?: number;
  titleMaxChars?: number;
  titleFontName?: string;
  titleFontSize?: number;
  stackFontName?: string;
  stackFontSize?: number;
}

const DEFAULT_OPTIONS: Required<CardViewOptions> = {
  width: 180,
  height: 260,
  artSize: 140,
  artTopPadding: 14,
  titleTopPadding: 168,
  stackBadgeSize: 44,
  stackBadgeInset: 8,
  titleMaxChars: 24,
  titleFontName: 'card-title',
  titleFontSize: 18,
  stackFontName: 'card-stack',
  stackFontSize: 16
};

/**
 * Visual representation of a card or card stack.
 */
export class CardView extends Container {
  private readonly config: Required<CardViewOptions>;

  private readonly backgroundSprite: Sprite;
  private readonly artSprite: Sprite;
  private readonly titleText: BitmapText;
  private readonly stackBadgeSprite: Sprite;
  private readonly stackCountText: BitmapText;

  constructor(options?: CardViewOptions) {
    super();

    this.config = { ...DEFAULT_OPTIONS, ...options };

    this.backgroundSprite = new Sprite();
    this.backgroundSprite.width = this.config.width;
    this.backgroundSprite.height = this.config.height;

    this.artSprite = new Sprite();
    this.artSprite.width = this.config.artSize;
    this.artSprite.height = this.config.artSize;
    this.artSprite.position.set((this.config.width - this.config.artSize) * 0.5, this.config.artTopPadding);

    this.titleText = new BitmapText({
      text: '',
      style: {
        fontFamily: this.config.titleFontName,
        fontSize: this.config.titleFontSize,
        fill: 0xffffff,
        align: 'center'
      }
    });
    this.titleText.anchor.set(0.5, 0);
    this.titleText.position.set(this.config.width * 0.5, this.config.titleTopPadding);

    this.stackBadgeSprite = new Sprite();
    this.stackBadgeSprite.width = this.config.stackBadgeSize;
    this.stackBadgeSprite.height = this.config.stackBadgeSize;
    this.stackBadgeSprite.anchor.set(1, 1);
    this.stackBadgeSprite.position.set(
      this.config.width - this.config.stackBadgeInset,
      this.config.height - this.config.stackBadgeInset
    );

    this.stackCountText = new BitmapText({
      text: '',
      style: {
        fontFamily: this.config.stackFontName,
        fontSize: this.config.stackFontSize,
        fill: 0xffffff,
        align: 'center'
      }
    });
    this.stackCountText.anchor.set(0.5, 0.5);

    this.addChild(this.backgroundSprite, this.artSprite, this.titleText, this.stackBadgeSprite, this.stackCountText);

    this.eventMode = 'static';
    this.cursor = 'pointer';
  }

  public setBackgroundTexture(texture: Texture): void {
    this.backgroundSprite.texture = texture;
  }

  public setArtTexture(texture: Texture): void {
    this.artSprite.texture = texture;
  }

  public setStackBadgeTexture(texture: Texture): void {
    this.stackBadgeSprite.texture = texture;
  }

  public setTitle(title: string): void {
    const cleanTitle = title.trim();
    const displayTitle =
      cleanTitle.length > this.config.titleMaxChars
        ? `${cleanTitle.slice(0, this.config.titleMaxChars - 1)}…`
        : cleanTitle;
    this.titleText.text = displayTitle;
  }

  public setStackCount(stackCount: number): void {
    const hasStack = stackCount > 1;
    this.stackBadgeSprite.visible = hasStack;
    this.stackCountText.visible = hasStack;

    if (!hasStack) {
      this.stackCountText.text = '';
      return;
    }

    this.stackCountText.text = String(stackCount);
    this.stackCountText.position.set(
      this.stackBadgeSprite.position.x - this.stackBadgeSprite.width * 0.5,
      this.stackBadgeSprite.position.y - this.stackBadgeSprite.height * 0.5
    );
  }

  public isStackBadgeHit(localX: number, localY: number): boolean {
    if (!this.stackBadgeSprite.visible) {
      return false;
    }

    const badgeLeft = this.stackBadgeSprite.x - this.stackBadgeSprite.width;
    const badgeRight = this.stackBadgeSprite.x;
    const badgeTop = this.stackBadgeSprite.y - this.stackBadgeSprite.height;
    const badgeBottom = this.stackBadgeSprite.y;

    return localX >= badgeLeft && localX <= badgeRight && localY >= badgeTop && localY <= badgeBottom;
  }
}
