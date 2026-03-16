# despoiler-pixijs

PixiJS + TypeScript + Vite workspace.

## Status

The PixiJS app itself is still a scaffold and currently does not implement game/client UI behavior.

The main implemented functionality today is a TypeScript convenience layer around generated SpacetimeDB bindings in `src/spacetime/`.

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

## Current caveats noticed in code

While updating this README, I noticed the following behavior caveats in current implementation:

1. `GetSpacetime` caches only by `databaseName`, so two configs using the same DB name but different URIs will currently share one cached client.
2. `GetSpacetime` registers an additional `connection.onStop(...)` handler each time `onConnect` fires, which can accumulate across reconnects.
3. Lifecycle naming is `onConnect` / `onStop`; keep all examples and references consistent with that API.

These may be intentional, but if not they are good candidates for follow-up cleanup.

## References

- PixiJS docs: https://pixijs.download/release/docs/index.html
- SpacetimeDB docs: https://docs.rs/spacetimedb/latest/spacetimedb/
