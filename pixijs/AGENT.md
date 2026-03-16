# despoiler-pixijs Agent Guide

Scope: entire `pixijs/` tree.

## Stack

- PixiJS frontend/application area
- TypeScript helpers for generated SpacetimeDB client bindings

## Current project status

This package is currently a lightweight scaffold and does **not** yet implement gameplay/UI features in PixiJS.

What **is** implemented is a small SpacetimeDB client convenience layer under `src/spacetime/`:

- `GetSpacetime(config)` creates/caches a flat `SpacetimeClient` keyed by `databaseName`.
- `SpacetimeConnection` wraps connect/start/stop lifecycle and listener wiring.
- `SpacetimeTable` wraps table subscriptions and table row event listeners.
- `SpacetimeEvent` is an internal event utility used by `SpacetimeTable`.

## Spacetime API shape expectations

For a client returned by `const st = GetSpacetime(config)`:

- `st.connection` returns the `SpacetimeConnection` object.
- Flat lifecycle aliases are exposed:
  - `st.onConnect(...)` == `st.connection.onConnect(...)`
  - `st.onStop(...)` == `st.connection.onStop(...)`
  - `st.start()` == `st.connection.start()`
  - `st.stop()` == `st.connection.stop()`
- Table wrappers are attached after connection (`st.<tableName>`), with:
  - `subscribe(conditionOrConditions, columns?)`
  - `subscribeAll(columns?)`
  - `onInsert(listener)`, `onUpdate(listener)`, `onDelete(listener)`
  - `detach(listener)`
  - `unsubscribe(handle)`, `unsubscribeAll()`

## Documentation maintenance notes

- Keep README examples aligned with current behavior in `src/spacetime/`.
- Lifecycle naming should remain `onConnect` / `onStop`; keep docs aligned with code if APIs change.
- Keep SQL examples concise and consistent with `subscribe` / `subscribeAll` semantics.

## References

- PixiJS reference documentation: https://pixijs.download/release/docs/index.html
- SpacetimeDB Rust docs: https://docs.rs/spacetimedb/latest/spacetimedb/
