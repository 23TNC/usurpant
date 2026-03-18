import { Assets, CanvasSource, Rectangle, Texture } from 'pixi.js';

export interface TextureAtlasCacheOptions {
  textureSize: number;
  atlasPixelSize?: number;
  lookupUrl?: string;
}

export interface TextureLookupManifest {
  textures: Record<string, string>;
}

export type AtlasTextureStatus = 'pending' | 'ready' | 'error';

interface AtlasTextureEntry {
  slot: number;
  texture: Texture;
  frame: Rectangle;
  status: AtlasTextureStatus;
  referenceCount: number;
}

const DEFAULT_ATLAS_PIXEL_SIZE = 2048;
const DEFAULT_LOOKUP_URL = '/textures/lookup.json';
const TEXTURE_PADDING = 1;

/**
 * Generic fixed-tile texture atlas cache.
 *
 * - `getTexture(id)` always returns immediately.
 * - On first request, the returned texture points to a reserved atlas slot and starts async loading.
 * - On successful load, the texture content is drawn into the slot and all sprites sharing that texture update.
 */
export class TextureAtlasCache {
  private readonly textureSize: number;
  private readonly paddedTextureSize: number;
  private readonly atlasPixelSize: number;
  private readonly atlasColumns: number;
  private readonly maxSlots: number;

  private readonly atlasSource: CanvasSource;
  private readonly atlasTexture: Texture;

  private readonly entries = new Map<string, AtlasTextureEntry>();
  private readonly pendingLoads = new Map<string, Promise<void>>();
  private readonly freeSlots: number[] = [];
  private lookupTable: Record<string, string> = {};
  private lookupLoadPromise?: Promise<void>;
  private readonly lookupUrl: string;
  private nextSlot = 0;

  constructor(options: TextureAtlasCacheOptions) {
    const { textureSize, atlasPixelSize, lookupUrl = DEFAULT_LOOKUP_URL } = options;

    if (textureSize <= 0) {
      throw new Error('TextureAtlasCache textureSize must be > 0');
    }

    this.textureSize = textureSize;
    this.paddedTextureSize = textureSize + TEXTURE_PADDING * 2;
    this.lookupUrl = lookupUrl;

    const requestedAtlasSize = atlasPixelSize ?? this.getMaxSupportedTextureSize();
    if (requestedAtlasSize <= 0) {
      throw new Error('TextureAtlasCache atlasPixelSize must be > 0');
    }

    const atlasColumns = Math.floor(requestedAtlasSize / this.paddedTextureSize);
    if (atlasColumns <= 0) {
      throw new Error(
        `TextureAtlasCache textureSize (${this.textureSize}) is too large for atlas size (${requestedAtlasSize}) when using ${TEXTURE_PADDING}px padding`
      );
    }

    this.atlasColumns = atlasColumns;
    this.atlasPixelSize = this.atlasColumns * this.paddedTextureSize;
    this.maxSlots = this.atlasColumns * this.atlasColumns;

    const canvas = document.createElement('canvas');
    canvas.width = this.atlasPixelSize;
    canvas.height = this.atlasPixelSize;

    this.atlasSource = new CanvasSource({
      resource: canvas,
      width: this.atlasPixelSize,
      height: this.atlasPixelSize,
      autoGenerateMipmaps: false
    });

    this.atlasTexture = new Texture({ source: this.atlasSource });
    this.clearAtlas();
  }

  public async warmup(): Promise<void> {
    await this.ensureLookupLoaded();
  }

  public getAtlasTexture(): Texture {
    return this.atlasTexture;
  }

  public getTexture(textureId: string): Texture {
    return this.getOrCreateEntry(textureId).texture;
  }

  public acquireTexture(textureId: string): Texture {
    const entry = this.getOrCreateEntry(textureId);
    entry.referenceCount += 1;
    return entry.texture;
  }

  public subscribeTexture(textureId: string): Texture {
    return this.acquireTexture(textureId);
  }

  public releaseTexture(textureId: string): void {
    const entry = this.entries.get(textureId);
    if (!entry) {
      return;
    }

    entry.referenceCount = Math.max(0, entry.referenceCount - 1);
  }

  public unsubscribeTexture(textureId: string): void {
    this.releaseTexture(textureId);
  }

  public hasTexture(textureId: string): boolean {
    return this.entries.has(textureId);
  }

  public hasFreeSlot(): boolean {
    return this.freeSlots.length > 0 || this.nextSlot < this.maxSlots;
  }

  public evictTexture(textureId: string): boolean {
    const entry = this.entries.get(textureId);
    if (!entry || entry.referenceCount > 0) {
      return false;
    }

    this.entries.delete(textureId);
    this.freeSlots.push(entry.slot);
    this.clearSlot(entry.frame);
    entry.texture.destroy(false);
    return true;
  }

  public evictOneUnusedTexture(): boolean {
    for (const [textureId, entry] of this.entries.entries()) {
      if (entry.referenceCount <= 0) {
        this.entries.delete(textureId);
        this.freeSlots.push(entry.slot);
        this.clearSlot(entry.frame);
        entry.texture.destroy(false);
        return true;
      }
    }

    return false;
  }

  public getReferenceCount(textureId: string): number {
    return this.entries.get(textureId)?.referenceCount ?? 0;
  }

  public getStatus(textureId: string): AtlasTextureStatus | undefined {
    return this.entries.get(textureId)?.status;
  }

  public whenReady(textureId: string): Promise<void> {
    this.getOrCreateEntry(textureId);
    return this.pendingLoads.get(textureId) ?? Promise.resolve();
  }

  public async preload(textureIds: string[]): Promise<void> {
    const uniqueIds = Array.from(new Set(textureIds));

    for (const textureId of uniqueIds) {
      this.getOrCreateEntry(textureId);
    }

    await Promise.all(uniqueIds.map((textureId) => this.pendingLoads.get(textureId)));
  }

  private getOrCreateEntry(textureId: string): AtlasTextureEntry {
    if (!textureId) {
      throw new Error('Texture id is required');
    }

    const existing = this.entries.get(textureId);
    if (existing) {
      return existing;
    }

    const entry = this.allocateEntry();
    this.entries.set(textureId, entry);
    this.schedulePopulate(textureId, entry);

    return entry;
  }

  private clearAtlas(): void {
    const context = this.atlasSource.context2D;
    context.clearRect(0, 0, this.atlasPixelSize, this.atlasPixelSize);
    this.atlasSource.update();
  }

  private allocateEntry(): AtlasTextureEntry {
    const slot = this.getNextSlot();
    if (slot === undefined) {
      throw new Error('Texture atlas is full; increase atlasPixelSize or use more than one atlas');
    }

    const x = (slot % this.atlasColumns) * this.paddedTextureSize + TEXTURE_PADDING;
    const y = Math.floor(slot / this.atlasColumns) * this.paddedTextureSize + TEXTURE_PADDING;
    const frame = new Rectangle(x, y, this.textureSize, this.textureSize);

    this.clearSlot(frame);

    return {
      slot,
      texture: new Texture({
        source: this.atlasSource,
        frame,
        orig: new Rectangle(0, 0, this.textureSize, this.textureSize),
        dynamic: true
      }),
      frame,
      status: 'pending',
      referenceCount: 0
    };
  }

  private clearSlot(frame: Rectangle): void {
    const context = this.atlasSource.context2D;
    context.clearRect(
      frame.x - TEXTURE_PADDING,
      frame.y - TEXTURE_PADDING,
      frame.width + TEXTURE_PADDING * 2,
      frame.height + TEXTURE_PADDING * 2
    );
    this.atlasSource.update();
  }

  private schedulePopulate(textureId: string, entry: AtlasTextureEntry): void {
    if (this.pendingLoads.has(textureId)) {
      return;
    }

    const loadPromise = this.populateEntry(textureId, entry)
      .catch((error: unknown) => {
        entry.status = 'error';
        console.error(`[TextureAtlasCache] Failed to load texture "${textureId}"`, error);
      })
      .finally(() => {
        this.pendingLoads.delete(textureId);
      });

    this.pendingLoads.set(textureId, loadPromise);
  }

  private async populateEntry(textureId: string, entry: AtlasTextureEntry): Promise<void> {
    await this.ensureLookupLoaded();

    const texturePath = this.lookupTable[textureId];
    if (!texturePath) {
      throw new Error(`No texture path found for id "${textureId}" in ${this.lookupUrl}`);
    }

    const sourceTexture = await Assets.load<Texture>(texturePath);
    const sourceResource = sourceTexture.source.resource;

    if (!(sourceResource instanceof HTMLImageElement) && !(sourceResource instanceof HTMLCanvasElement)) {
      throw new Error(`Texture id "${textureId}" did not resolve to a canvas/image resource`);
    }

    if (this.entries.get(textureId) !== entry) {
      return;
    }

    const context = this.atlasSource.context2D;
    const frameX = entry.frame.x;
    const frameY = entry.frame.y;
    const size = this.textureSize;
    const right = frameX + size;
    const bottom = frameY + size;

    context.clearRect(frameX - TEXTURE_PADDING, frameY - TEXTURE_PADDING, size + TEXTURE_PADDING * 2, size + TEXTURE_PADDING * 2);

    context.drawImage(sourceResource, frameX, frameY, size, size);

    // Top and bottom padding rows.
    context.drawImage(sourceResource, 0, 0, size, 1, frameX, frameY - TEXTURE_PADDING, size, 1);
    context.drawImage(sourceResource, 0, size - 1, size, 1, frameX, bottom, size, 1);

    // Left and right padding columns.
    context.drawImage(sourceResource, 0, 0, 1, size, frameX - TEXTURE_PADDING, frameY, 1, size);
    context.drawImage(sourceResource, size - 1, 0, 1, size, right, frameY, 1, size);

    // Corner padding pixels.
    context.drawImage(sourceResource, 0, 0, 1, 1, frameX - TEXTURE_PADDING, frameY - TEXTURE_PADDING, 1, 1);
    context.drawImage(sourceResource, size - 1, 0, 1, 1, right, frameY - TEXTURE_PADDING, 1, 1);
    context.drawImage(sourceResource, 0, size - 1, 1, 1, frameX - TEXTURE_PADDING, bottom, 1, 1);
    context.drawImage(sourceResource, size - 1, size - 1, 1, 1, right, bottom, 1, 1);

    this.atlasSource.update();
    if (this.entries.get(textureId) === entry) {
      entry.status = 'ready';
    }
  }

  private getNextSlot(): number | undefined {
    const recycledSlot = this.freeSlots.pop();
    if (recycledSlot !== undefined) {
      return recycledSlot;
    }

    if (this.nextSlot >= this.maxSlots) {
      return undefined;
    }

    const nextSlot = this.nextSlot;
    this.nextSlot += 1;
    return nextSlot;
  }

  private getMaxSupportedTextureSize(): number {
    const canvas = document.createElement('canvas');
    const rawContext =
      canvas.getContext('webgl2') ??
      canvas.getContext('webgl') ??
      canvas.getContext('experimental-webgl');

    if (!rawContext) {
      return DEFAULT_ATLAS_PIXEL_SIZE;
    }

    const context = rawContext as WebGLRenderingContext | WebGL2RenderingContext;
    const maxTextureSize = context.getParameter(context.MAX_TEXTURE_SIZE) as number;
    const loseContextExtension = context.getExtension('WEBGL_lose_context');
    loseContextExtension?.loseContext();

    return maxTextureSize > 0 ? maxTextureSize : DEFAULT_ATLAS_PIXEL_SIZE;
  }

  private async ensureLookupLoaded(): Promise<void> {
    if (this.lookupLoadPromise) {
      await this.lookupLoadPromise;
      return;
    }

    this.lookupLoadPromise = (async () => {
      const response = await fetch(this.lookupUrl);
      if (!response.ok) {
        throw new Error(`Failed to load lookup manifest from ${this.lookupUrl} (${response.status})`);
      }

      const manifest = (await response.json()) as Partial<TextureLookupManifest>;
      this.lookupTable = manifest.textures ?? {};
    })();

    await this.lookupLoadPromise;
  }
}
