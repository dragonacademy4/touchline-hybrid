import type { NanoStatus } from './engine';

interface LanguageModelLike {
  availability(options?: object): Promise<string>;
}

const OPTIONS = {
  expectedInputs: [{ type: 'text', languages: ['en'] }],
  expectedOutputs: [{ type: 'text', languages: ['en'] }],
};

/** Asks Chrome whether Gemini Nano (the Prompt API) can run on this device. */
export async function nanoStatus(scope: { LanguageModel?: LanguageModelLike } = globalThis as never): Promise<NanoStatus> {
  const lm = scope.LanguageModel;
  if (!lm || typeof lm.availability !== 'function') return 'unsupported';
  try {
    const a = await lm.availability(OPTIONS);
    if (a === 'available' || a === 'downloadable' || a === 'downloading' || a === 'unavailable') return a;
    if (a === 'readily') return 'available'; // older Chrome builds
    if (a === 'after-download') return 'downloadable';
    return 'unavailable';
  } catch {
    return 'unavailable';
  }
}

export const NANO_LABEL: Record<NanoStatus, string> = {
  available: 'Gemini Nano ready on this device',
  downloadable: 'Gemini Nano can be downloaded to this device',
  downloading: 'Gemini Nano is downloading',
  unavailable: "Gemini Nano can't run on this device",
  unsupported: "This browser doesn't have Chrome's built-in AI",
};
