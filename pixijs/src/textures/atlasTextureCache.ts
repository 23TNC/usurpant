import { Assets, CanvasSource, Rectangle, Texture } from 'pixi.js';

export interface TextureAtlasCacheOptions {
  tileSize: number;
  atlasPixelSize?: number;
  lookupUrl?: string;
}

export interface TextureLookupManifest {
  textures: Record<string, string>;
}

export type AtlasTextureStatus = 'pending' | 'ready' | 'error';

interface AtlasTextureEntry {
  texture: Texture;
  frame: Rectangle;
  status: AtlasTextureStatus;
}

const DEFAULT_ATLAS_PIXEL_SIZE = 2048;
const DEFAULT_LOOKUP_URL = '/textures/lookup.json';

/**
 * Generic fixed-tile texture atlas cache.
 *
 * - `getTexture(id)` always returns immediately.
 * - On first request, the returned texture points to a reserved atlas slot and starts async loading.
 * - On successful load, the texture content is drawn into the slot and all sprites sharing that texture update.
 */
export class TextureAtlasCache {
  private readonly tileSize: number;
  private readonly atlasPixelSize: number;
  private readonly atlasColumns: number;
  private readonly maxSlots: number;

  private readonly atlasSource: CanvasSource;
  private readonly atlasTexture: Texture;

  private readonly entries = new Map<string, AtlasTextureEntry>();
  private readonly pendingLoads = new Map<string, Promise<void>>();
  private lookupTable: Record<string, string> = {};
  private lookupLoadPromise?: Promise<void>;
  private readonly lookupUrl: string;
  private nextSlot = 0;

  constructor(options: TextureAtlasCacheOptions) {
    const { tileSize, atlasPixelSize = DEFAULT_ATLAS_PIXEL_SIZE, lookupUrl = DEFAULT_LOOKUP_URL } = options;

    if (tileSize <= 0) {
      throw new Error('TextureAtlasCache tileSize must be > 0');
    }

    if (atlasPixelSize <= 0 || atlasPixelSize % tileSize !== 0) {
      throw new Error('TextureAtlasCache atlasPixelSize must be > 0 and divisible by tileSize');
    }

    this.tileSize = tileSize;
    this.atlasPixelSize = atlasPixelSize;
    this.lookupUrl = lookupUrl;

    this.atlasColumns = atlasPixelSize / tileSize;
    this.maxSlots = this.atlasColumns * this.atlasColumns;

    const canvas = document.createElement('canvas');
    canvas.width = atlasPixelSize;
    canvas.height = atlasPixelSize;

    this.atlasSource = new CanvasSource({
      resource: canvas,
      width: atlasPixelSize,
      height: atlasPixelSize,
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
    if (this.nextSlot >= this.maxSlots) {
      throw new Error('Texture atlas is full; increase atlasPixelSize or use more than one atlas');
    }

    const slot = this.nextSlot;
    this.nextSlot += 1;

    const x = (slot % this.atlasColumns) * this.tileSize;
    const y = Math.floor(slot / this.atlasColumns) * this.tileSize;
    const frame = new Rectangle(x, y, this.tileSize, this.tileSize);

    this.clearSlot(frame);

    return {
      texture: new Texture({
        source: this.atlasSource,
        frame,
        orig: new Rectangle(0, 0, this.tileSize, this.tileSize),
        dynamic: true
      }),
      frame,
      status: 'pending'
    };
  }

  private clearSlot(frame: Rectangle): void {
    const context = this.atlasSource.context2D;
    context.clearRect(frame.x, frame.y, frame.width, frame.height);
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

    const context = this.atlasSource.context2D;
    context.clearRect(entry.frame.x, entry.frame.y, entry.frame.width, entry.frame.height);
    context.drawImage(sourceResource, entry.frame.x, entry.frame.y, this.tileSize, this.tileSize);

    this.atlasSource.update();
    entry.status = 'ready';
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
