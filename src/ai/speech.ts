/**
 * Voice notes, on-device only. Chrome's classic Web Speech API sends audio to
 * a server, which would carry children's names off the phone, so Touchline
 * only offers voice when Chrome can recognise speech locally
 * (`processLocally`). Otherwise the mic button is hidden and Settings says why.
 */
type Availability = 'available' | 'downloadable' | 'downloading' | 'unavailable' | 'unsupported';

interface SRStatic {
  new (): SRInstance;
  available?: (o: { langs: string[]; processLocally: boolean }) => Promise<string>;
  install?: (o: { langs: string[]; processLocally: boolean }) => Promise<boolean>;
  availableOnDevice?: (lang: string) => Promise<string>;
  installOnDevice?: (lang: string) => Promise<boolean>;
}

interface SRInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  processLocally?: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

const LANG = 'en-GB';

function ctor(): SRStatic | undefined {
  const g = globalThis as unknown as { SpeechRecognition?: SRStatic };
  return g.SpeechRecognition;
}

export async function speechAvailability(): Promise<Availability> {
  const SR = ctor();
  if (!SR) return 'unsupported';
  try {
    let a: string | undefined;
    if (SR.available) a = await SR.available({ langs: [LANG], processLocally: true });
    else if (SR.availableOnDevice) a = await SR.availableOnDevice(LANG);
    else return 'unsupported';
    return a === 'available' || a === 'downloadable' || a === 'downloading' ? a : 'unavailable';
  } catch {
    return 'unavailable';
  }
}

export async function installSpeech(): Promise<boolean> {
  const SR = ctor();
  try {
    if (SR?.install) return await SR.install({ langs: [LANG], processLocally: true });
    if (SR?.installOnDevice) return await SR.installOnDevice(LANG);
  } catch {
    /* fall through */
  }
  return false;
}

/** Starts on-device dictation. Returns a stop function. */
export function startDictation(onText: (finalText: string) => void, onEnd: (error?: string) => void): () => void {
  const SR = ctor();
  if (!SR) {
    onEnd('unsupported');
    return () => {};
  }
  if (!('processLocally' in (SR as unknown as { prototype: object }).prototype)) {
    // This Chrome would silently use a server. Refuse rather than send audio off the phone.
    onEnd('not-local');
    return () => {};
  }
  const r = new SR();
  r.lang = LANG;
  r.continuous = true;
  r.interimResults = false;
  r.processLocally = true;
  r.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) onText(e.results[i][0].transcript.trim());
  };
  r.onerror = (e) => onEnd(e.error);
  r.onend = () => onEnd();
  r.start();
  return () => r.stop();
}
