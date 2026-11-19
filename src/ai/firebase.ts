/**
 * Firebase wiring: App Check, AI Logic (hybrid inference), anonymous Auth,
 * Firestore and Remote Config. Loaded lazily so the app shell paints first and
 * works with no network at all.
 */
import type { FirebaseApp } from 'firebase/app';
import type { AI } from 'firebase/ai';
import type { RemoteConfig } from 'firebase/remote-config';
import { FIREBASE_CONFIG, RECAPTCHA_SITE_KEY, REMOTE_DEFAULTS, type RemoteKey } from './config';
import { isModelMissing, isTimeout, isTransient, withRetry } from './retry';
import { DEFAULT_PROMPTS, type ModelRunner, type Prompts, type RunRequest, type RunResult } from './engine';

declare global {
  // Set by tests and local development to use an App Check debug token.
  // eslint-disable-next-line no-var
  var FIREBASE_APPCHECK_DEBUG_TOKEN: string | boolean | undefined;
}

let appPromise: Promise<FirebaseApp> | null = null;

/** Initialises Firebase and App Check once. */
export function getFirebaseApp(): Promise<FirebaseApp> {
  appPromise ??= (async () => {
    const { initializeApp } = await import('firebase/app');
    const app = initializeApp(FIREBASE_CONFIG);
    const debugToken = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN;
    if (debugToken && !self.FIREBASE_APPCHECK_DEBUG_TOKEN) self.FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
    if (RECAPTCHA_SITE_KEY || self.FIREBASE_APPCHECK_DEBUG_TOKEN) {
      // App Check is registered with reCAPTCHA Enterprise. A debug token (tests, local dev) replaces it.
      const { initializeAppCheck, ReCaptchaEnterpriseProvider } = await import('firebase/app-check');
      initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider(RECAPTCHA_SITE_KEY || 'debug-only'),
        isTokenAutoRefreshEnabled: true,
      });
    }
    return app;
  })();
  appPromise.catch(() => (appPromise = null));
  return appPromise;
}

let aiPromise: Promise<AI> | null = null;
async function getAIInstance(): Promise<AI> {
  aiPromise ??= (async () => {
    const [{ getAI, GoogleAIBackend }, app] = await Promise.all([import('firebase/ai'), getFirebaseApp()]);
    return getAI(app, { backend: new GoogleAIBackend() });
  })();
  aiPromise.catch(() => (aiPromise = null));
  return aiPromise;
}

// ---------- Remote Config ----------

let rcPromise: Promise<RemoteConfig | null> | null = null;
function getRC(): Promise<RemoteConfig | null> {
  rcPromise ??= (async () => {
    try {
      const [{ getRemoteConfig, fetchAndActivate }, app] = await Promise.all([import('firebase/remote-config'), getFirebaseApp()]);
      const rc = getRemoteConfig(app);
      rc.settings.minimumFetchIntervalMillis = 60 * 60 * 1000;
      rc.settings.fetchTimeoutMillis = 8000;
      rc.defaultConfig = { ...REMOTE_DEFAULTS };
      if (navigator.onLine) await fetchAndActivate(rc).catch(() => false);
      return rc;
    } catch {
      return null;
    }
  })();
  return rcPromise;
}

export async function remoteValue(key: RemoteKey): Promise<string> {
  const rc = await getRC();
  if (!rc) return REMOTE_DEFAULTS[key];
  const { getValue } = await import('firebase/remote-config');
  return getValue(rc, key).asString() || REMOTE_DEFAULTS[key];
}

export async function remotePrompts(): Promise<Prompts> {
  const [s, p, g] = await Promise.all([remoteValue('session_prompt'), remoteValue('parent_prompt'), remoteValue('progress_prompt')]);
  return {
    session: s || DEFAULT_PROMPTS.session,
    parentUpdate: p || DEFAULT_PROMPTS.parentUpdate,
    progress: g || DEFAULT_PROMPTS.progress,
  };
}

// ---------- Hybrid inference ----------

/** A cloud call that takes longer than this is abandoned (and the fallback model tried). */
const CLOUD_TIMEOUT_MS = 25_000;

const LANG = [{ type: 'text', languages: ['en'] }] as const;

async function makeModel(req: RunRequest, cloudModel: string) {
  const { getGenerativeModel } = await import('firebase/ai');
  const ai = await getAIInstance();
  return getGenerativeModel(ai, {
    mode: req.mode,
    onDeviceParams: {
      createOptions: { expectedInputs: [...LANG], expectedOutputs: [...LANG] } as never,
      promptOptions: { responseConstraint: req.schema },
    },
    inCloudParams: {
      model: cloudModel,
      generationConfig: { responseMimeType: 'application/json', responseJsonSchema: req.schema as Record<string, unknown>, temperature: 0.4 },
    },
  }, { timeout: CLOUD_TIMEOUT_MS });
}

/**
 * The real model runner, using Firebase AI Logic hybrid inference. The prompt
 * it receives is already masked and leak-checked by engine.ts.
 */
export const firebaseRunner: ModelRunner = async (req) => {
  const primary = await remoteValue('cloud_model');
  const fallback = await remoteValue('cloud_model_fallback');
  const attempt = async (cloudModel: string): Promise<RunResult> => {
    const model = await makeModel(req, cloudModel);
    const result = await model.generateContent(req.prompt);
    const source = result.response.inferenceSource === 'on_device' ? 'on_device' : 'in_cloud';
    return { text: result.response.text(), source, model: source === 'on_device' ? 'Gemini Nano' : cloudModel };
  };
  const models = req.mode === 'only_on_device' || !fallback || fallback === primary ? [primary] : [primary, fallback];
  let last: unknown;
  for (const m of models) {
    try {
      // Busy or flaky: back off and retry. Still failing, or the model is gone: try the next model.
      return await withRetry(() => attempt(m), { retries: 1, baseMs: 800, maxMs: 4000, isRetryable: (e) => isTransient(e) && !isTimeout(e) });
    } catch (e) {
      last = e;
      if (!isTransient(e) && !isModelMissing(e)) throw e;
    }
  }
  throw last;
};

/** Starts the Gemini Nano download. Must be called from a click. */
export async function downloadNano(onProgress: (p: number) => void): Promise<void> {
  const model = await makeModel({ prompt: '', schema: {}, mode: 'only_on_device', purpose: 'session' }, REMOTE_DEFAULTS.cloud_model);
  await model.initializeDeviceModel(onProgress);
}

// ---------- Auth + Firestore ----------

export async function getUid(): Promise<string> {
  const [{ getAuth, signInAnonymously }, app] = await Promise.all([import('firebase/auth'), getFirebaseApp()]);
  const auth = getAuth(app);
  await auth.authStateReady();
  if (auth.currentUser) return auth.currentUser.uid;
  const cred = await signInAnonymously(auth);
  return cred.user.uid;
}

let dbPromise: Promise<import('firebase/firestore').Firestore> | null = null;
export function getDb() {
  dbPromise ??= (async () => {
    const [{ initializeFirestore, persistentLocalCache }, app] = await Promise.all([import('firebase/firestore'), getFirebaseApp()]);
    // Firestore's own offline cache queues writes made without signal and sends them later.
    return initializeFirestore(app, { localCache: persistentLocalCache() });
  })();
  dbPromise.catch(() => (dbPromise = null));
  return dbPromise;
}
