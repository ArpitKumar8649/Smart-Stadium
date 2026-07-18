/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  /** Cesium Ion access token. Optional — undefined means use cesium's public
   *  default token (works for development; user tiles may be throttled). */
  readonly VITE_CESIUM_ION_TOKEN?: string;
  /** Firebase Auth environment variables */
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
