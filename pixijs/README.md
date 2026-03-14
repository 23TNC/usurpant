# despoiler-pixijs

PixiJS v8 + TypeScript + Vite scaffold for hierarchical graph rendering.

## Scripts

- `npm install`
- `npm run dev` for Vite development server
- `npm run build` for production build output in `dist/` (suitable to serve behind nginx)
- `npm run preview` to preview production bundle locally

## Current skeleton features

- Packed/unpacked u64 vertex-id helpers (`s0.s1.s2.s3.s4.s5.s6.s7`)
- Partial scoped-id parsing (missing scopes default to zero):
  - `1` => `1.0.0.0.0.0.0.0`
  - `1.1.1` => `1.1.1.0.0.0.0.0`
- Scope depth helper (`1.1.1` has scope depth `2`)
- Separate graph data models for vertices and edges
- Hierarchical graph store (parent/child vertices)
- Pixi viewport with:
  - Left click drag panning
  - Mouse wheel zoom
  - Basic culling outside viewport
  - Depth/radius-based rendering limits
- Vertex rendering through `ParticleContainer` sprites to reduce draw calls
- Edge rendering in a dedicated graphics layer
- Test harness that seeds the requested universe/world/continent/region/zone graph

## Integration plan with SpacetimeDB bindings

Replace `src/spacetimedb/graph-type-adapter.ts` mock seed logic with generated TypeScript bindings and call `GraphStore.upsertVertex()`/`GraphStore.upsertEdge()` from your real subscription handlers.
