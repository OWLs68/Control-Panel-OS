/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  readonly VITE_DATA_SOURCE?: string
  readonly VITE_GATEWAY_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
