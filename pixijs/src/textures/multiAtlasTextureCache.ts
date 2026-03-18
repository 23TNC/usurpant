import { Texture } from 'pixi.js';

import { TextureAtlasCache, TextureAtlasCacheOptions, AtlasTextureStatus } from './atlasTextureCache';

/**
 * Parent atlas cache that spreads textures across multiple atlas textures when needed.
 *
 * It prefers reusing lower-index atlases by evicting zero-reference textures before
 * allocating in higher-index atlases to keep draw-call count lower.
 */
export class MultiAtlasTextureCache {
  private readonly atlasOptions: TextureAtlasCacheOptions;
  private readonly atlases: TextureAtlasCache[] = [];

  constructor(options: TextureAtlasCacheOptions) {
    this.atlasOptions = options;
    this.atlases.push(new TextureAtlasCache(options));
  }

  public async warmup(): Promise<void> {
    await Promise.all(this.atlases.map((atlas) => atlas.warmup()));
  }

  public getAtlasTextures(): Texture[] {
    return this.atlases.map((atlas) => atlas.getAtlasTexture());
  }

  public getTexture(textureId: string): Texture {
    const existingAtlas = this.findAtlasWithTexture(textureId);
    if (existingAtlas) {
      return existingAtlas.getTexture(textureId);
    }

    const targetAtlas = this.findOrCreateAtlasForNewTexture();
    return targetAtlas.getTexture(textureId);
  }

  public subscribeTexture(textureId: string): Texture {
    return this.acquireTexture(textureId);
  }

  public unsubscribeTexture(textureId: string): void {
    this.releaseTexture(textureId);
  }

  public acquireTexture(textureId: string): Texture {
    const existingAtlas = this.findAtlasWithTexture(textureId);
    if (existingAtlas) {
      return existingAtlas.acquireTexture(textureId);
    }

    const targetAtlas = this.findOrCreateAtlasForNewTexture();
    return targetAtlas.acquireTexture(textureId);
  }

  public releaseTexture(textureId: string): void {
    this.findAtlasWithTexture(textureId)?.releaseTexture(textureId);
  }

  public getStatus(textureId: string): AtlasTextureStatus | undefined {
    return this.findAtlasWithTexture(textureId)?.getStatus(textureId);
  }

  public async whenReady(textureId: string): Promise<void> {
    const atlas = this.findAtlasWithTexture(textureId);
    if (atlas) {
      await atlas.whenReady(textureId);
      return;
    }

    this.getTexture(textureId);
    await this.findAtlasWithTexture(textureId)?.whenReady(textureId);
  }

  public async preload(textureIds: string[]): Promise<void> {
    const uniqueIds = Array.from(new Set(textureIds));

    for (const textureId of uniqueIds) {
      this.getTexture(textureId);
    }

    await Promise.all(uniqueIds.map((textureId) => this.whenReady(textureId)));
  }

  private findAtlasWithTexture(textureId: string): TextureAtlasCache | undefined {
    return this.atlases.find((atlas) => atlas.hasTexture(textureId));
  }

  private findOrCreateAtlasForNewTexture(): TextureAtlasCache {
    // Prefer lowest-index atlases first (free slot), then reclaim from that same atlas.
    for (const atlas of this.atlases) {
      if (atlas.hasFreeSlot()) {
        return atlas;
      }

      if (atlas.evictOneUnusedTexture()) {
        return atlas;
      }
    }

    // Finally, grow atlas count only when no reclaim/capacity exists.
    const atlas = new TextureAtlasCache(this.atlasOptions);
    this.atlases.push(atlas);
    return atlas;
  }
}
