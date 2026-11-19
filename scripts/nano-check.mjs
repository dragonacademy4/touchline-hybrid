import { chromium } from '@playwright/test';
const headless = process.argv[2] !== 'headed';
const ctx = await chromium.launchPersistentContext('/tmp/touchline-nano-profile', { channel: 'chrome', headless,
  args: ['--enable-features=OptimizationGuideOnDeviceModel:BypassPerfRequirement/true,PromptAPIForGeminiNano,PromptAPIForGeminiNanoMultimodalInput', '--optimization-guide-on-device-model-execution-override-for-testing'] });
const p = await ctx.newPage();
await p.goto('https://example.com');
const r = await p.evaluate(async () => {
  const out = { hasLM: typeof LanguageModel !== 'undefined', hasSR: typeof webkitSpeechRecognition !== 'undefined' };
  try { out.avail = await LanguageModel.availability({expectedInputs:[{type:'text',languages:['en']}],expectedOutputs:[{type:'text',languages:['en']}]}); } catch (e) { out.err = String(e); }
  return out;
});
console.log(JSON.stringify(r));
await ctx.close();
