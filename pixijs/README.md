# despoiler-pixijs

PixiJS + TypeScript + Vite workspace.

## Status

The PixiJS app is still early scaffold status, but now includes reusable infrastructure for card rendering/interaction and texture atlases.

The main implemented functionality today includes:

- A TypeScript convenience layer around generated SpacetimeDB bindings in `src/spacetime/`.
- Card UI infrastructure in `src/cards/` for rendering card stacks and handling pointer interactions.
- Texture atlas cache utilities in `src/textures/`.

## Scripts

- `npm install`
- `npm run dev` for Vite development server
- `npm run build` for production build output in `dist/`
- `npm run preview` to preview production bundle locally

## Spacetime convenience layer

### `GetSpacetime(config)`

`GetSpacetime(config)` returns a cached flat `SpacetimeClient` keyed by `config.databaseName`.

```ts
const st = GetSpacetime({
  uri: 'ws://localhost:3000',
  databaseName: 'my_db',
});
```

Client shape:

- `st.connection` → underlying `SpacetimeConnection`
- Flat connection aliases:
  - `st.onConnect(listener)`
  - `st.onStop(listener)`
  - `st.start()`
  - `st.stop()`
- Reducers from generated bindings are merged onto `st` after connect.
- Table wrappers are attached on connect as `st.<tableName>`.

### Connection lifecycle (`SpacetimeConnection`)

`SpacetimeConnection` handles:

- `start()` and `stop()`
- connect listeners via `onConnect(listener)`
- stop listeners via `onStop(listener)`

`onConnect` listeners are also called immediately if already connected.

### Table API (`SpacetimeTable`)

Each `SpacetimeTable` handles subscriptions plus row listeners.

#### Subscriptions

- `subscribe(conditions, columns = '*')`
  - `conditions` can be:
    - string: `'id = 5'`
    - string array: `['id = 5', 'color = 2']` (joined with `AND`)
- `subscribeAll(columns = '*')`

Examples:

```ts
st.whatever.subscribe('id = 5');
st.whatever.subscribe(['id = 5', 'color = 2']);
st.whatever.subscribe('id = 5', 'color');
st.whatever.subscribeAll('id');
```

This maps to SQL generation like:

- `subscribe('id = 5')` → `SELECT * FROM whatever WHERE id = 5`
- `subscribe('id = 5', 'color')` → `SELECT color FROM whatever WHERE id = 5`
- `subscribeAll('id')` → `SELECT id FROM whatever`

#### Row event listeners

- `onInsert(listener)`
- `onUpdate(listener)`
- `onDelete(listener)`
- `detach(listener)` to remove any of the above

#### Unsubscription

- `unsubscribe(handle)`
- `unsubscribeAll()`

### Internal event utility (`event.ts`)

`SpacetimeEvent` standardizes listener management with:

- `attach`
- `detach`
- `clear`
- `trigger`

This class is currently intended for internal use by `SpacetimeTable`.



## Card infrastructure (`src/cards`)

The card layer is intentionally infrastructure-first and is not yet wired into `src/main.ts`.

### `CardView`

`CardView` is a reusable Pixi `Container` that draws:

- rectangular background texture
- square card-art texture
- bitmap card title
- optional stack indicator (small circular texture + bitmap count)

Helpful methods:

- `setBackgroundTexture(texture)`
- `setArtTexture(texture)`
- `setStackBadgeTexture(texture)`
- `setTitle(title)`
- `setStackCount(count)`
- `isStackBadgeHit(localX, localY)` for stack-badge click targeting

### `CardManager`

`CardManager` owns card-stack data, card view lifecycle, atlas subscriptions, and pointer interactions.

It expects a root Pixi container and any atlas-like object implementing:

```ts
interface CardTextureAtlas {
  subscribeTexture(textureId: string): Texture;
  unsubscribeTexture(textureId: string): void;
}
```

Stack records are managed via `CardStackData`:

```ts
interface CardStackData {
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
```

Core manager methods:

- `upsertStack(data)`
- `removeStack(stackId)`
- `getStack(stackId)`
- `getAllStacks()`
- `destroy()`

### Stack interaction behavior

Current pointer behavior:

- Left-click card body on a stack (`count > 1`): split one card into a new draggable stack, decrementing original stack by one.
- Left-click stack badge/count circle: drag entire stack.
- Release pointer: drop at current world position (slot snapping/panels are future work).

### Minimal usage sketch

```ts
import { Container } from 'pixi.js';
import { CardManager } from './cards';
import { MultiAtlasTextureCache } from './textures';

const cardsRoot = new Container();
stage.addChild(cardsRoot);

const atlas = new MultiAtlasTextureCache({ textureSize: 256 });
const cardManager = new CardManager(cardsRoot, atlas);

cardManager.upsertStack({
  stackId: 'hand-001',
  cardTypeId: 'fireball',
  title: 'Fireball',
  backgroundTextureId: 'card-bg-default',
  artTextureId: 'card-art-fireball',
  stackBadgeTextureId: 'card-stack-badge',
  count: 3,
  x: 200,
  y: 500
});
```

## Texture atlas cache infrastructure

A generalized texture-atlas cache is available at `src/textures/atlasTextureCache.ts`.

### What it does

- Maintains one canvas-backed atlas texture (fixed-size square atlas).
- Reserves fixed square slots per texture id (all tiles are the same dimensions).
- `getTexture(textureId)` returns immediately:
  - cache hit: returns existing atlas subtexture
  - cache miss: allocates a new atlas slot and returns a subtexture for that slot right away, then asynchronously loads and draws the source image into that slot
- Loads texture ids via `public/textures/lookup.json` (default URL `/textures/lookup.json`).

### Manifest format

`public/textures/lookup.json` should look like:

```json
{
  "textures": {
    "grass": "/textures/grass.png",
    "player_idle": "/textures/player_idle.png"
  }
}
```

### API

- `new TextureAtlasCache({ textureSize, atlasPixelSize?, lookupUrl? })`
- `warmup()` to preload the lookup manifest.
- `getTexture(textureId)` to synchronously get/create an atlas subtexture.
- `getStatus(textureId)` to inspect `pending | ready | error`.
- `whenReady(textureId)` to await a specific id completion.
- `preload(textureIds)` to queue and await multiple ids.
- `getAtlasTexture()` to access the full atlas texture if needed for debug tooling.

This is intentionally infrastructure-only right now; gameplay rendering code has not been wired to use this cache yet.

## Current caveats noticed in code

While updating this README, I noticed the following behavior caveats in current implementation:

1. `GetSpacetime` caches only by `databaseName`, so two configs using the same DB name but different URIs will currently share one cached client.
2. `GetSpacetime` registers an additional `connection.onStop(...)` handler each time `onConnect` fires, which can accumulate across reconnects.
3. Lifecycle naming is `onConnect` / `onStop`; keep all examples and references consistent with that API.

These may be intentional, but if not they are good candidates for follow-up cleanup.

## References

- PixiJS docs: https://pixijs.download/release/docs/index.html
- SpacetimeDB docs: https://docs.rs/spacetimedb/latest/spacetimedb/
