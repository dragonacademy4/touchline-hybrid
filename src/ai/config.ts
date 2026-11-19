/** Public Firebase web config (public by design; protected by App Check, not secrecy). */
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyC17td5FhwJTSfoW8hmlLxs8DAq66c_GhQ',
  authDomain: 'touchline-hybrid.firebaseapp.com',
  projectId: 'touchline-hybrid',
  storageBucket: 'touchline-hybrid.firebasestorage.app',
  messagingSenderId: '266196978860',
  appId: '1:266196978860:web:730b475ad45c70f1476309',
};

/** reCAPTCHA Enterprise site key for App Check (public by design). Set at build time. */
export const RECAPTCHA_SITE_KEY: string = import.meta.env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY ?? '';

/**
 * Remote Config defaults. These ship in the app so everything works offline
 * and before the first fetch; Remote Config can change the cloud model or the
 * prompts without a redeploy.
 */
export const REMOTE_DEFAULTS = {
  // Measured 19 Nov 2026 on the free tier: 3.5 Flash-Lite answered in ~1-5 s; 3.8 Flash was
  // returning "high demand" or timing out. Remote Config can swap these without a deploy.
  cloud_model: 'gemini-3.5-flash-lite',
  cloud_model_fallback: 'gemini-3.8-flash',
  session_prompt: '',
  parent_prompt: '',
  progress_prompt: '',
} as const;

export type RemoteKey = keyof typeof REMOTE_DEFAULTS;

/** Public source repository, set at build time (shown in Settings). */
export const REPO_URL: string = import.meta.env.VITE_REPO_URL ?? '';
