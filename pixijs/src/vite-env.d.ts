/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SPACETIMEDB_URI?: string;
  readonly VITE_SPACETIMEDB_DATABASE?: string;
  readonly VITE_USE_TEST_VERTEX_PATHS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
