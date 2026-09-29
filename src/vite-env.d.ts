/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Axios timeout for ranking/history requests (ms). Default 8000. */
  readonly VITE_API_TIMEOUT_MS?: string;
  /** Base URL of the ranking/history API. Default '' (same origin, mocked by MSW). */
  readonly VITE_API_BASE_URL?: string;
  /** Set to "false" to disable MSW (only if a real API is available). */
  readonly VITE_ENABLE_MOCKS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
