/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_DEMO_MODE?: string;
  /** Cesium Ion access token. Optional — undefined means use cesium's public
   *  default token (works for development; user tiles may be throttled). */
  readonly VITE_CESIUM_ION_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
