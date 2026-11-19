# Touchline

**Pitch-side session notes for grassroots youth football coaches.** Tap a few chips per child after training, and Touchline turns them into praise, a next step and a shareable player card for every player, then a weekly update for parents. It works with no signal, and children's names never leave the coach's phone.

Live: **https://touchline.impactlayer.workers.dev** · Licence: [Apache-2.0](LICENSE) · Built for the Firebase #BuildHybridAI 2026 hackathon (Web / Chrome).

## The problem

A grassroots coach finishes a session on a dark, cold field, often with no signal. They have thirty seconds of observations in their head about twelve children, and those observations almost never become feedback the children or their parents see. The notes involve children, so pasting them into a chatbot isn't an option either.

## How hybrid inference is used

Touchline uses **Firebase AI Logic hybrid inference** so each job runs where it makes sense:

| Job | Where it runs | Mode | Why |
|---|---|---|---|
| Structure session notes into strength, next step and praise per child (JSON) | **On the device** with Gemini Nano in Chrome; cloud fallback with names hidden | `prefer_on_device` online, `only_on_device` offline or when cloud is switched off | Works at the pitch with no signal; the raw notes stay local |
| Player cards | On the device | (drawn locally from the structured result) | Nothing to send |
| Weekly parent update for a group | **Cloud** (Gemini Flash-Lite) | `only_in_cloud` | Longer, polished writing across several sessions, done back in signal |
| 4-week progress report per child | **Cloud** | `only_in_cloud` | Reasoning across a month of records |

**Names never leave the device.** Before *any* model call (on-device included, because `prefer_on_device` can fall back to the cloud), every squad name and nickname is replaced with a stable token such as `P03`, plus any extra words the coach lists, emails and phone numbers. A leak check then refuses to send anything that still contains a name. Results come back with tokens and are restored on the device. Every AI result shows where it ran ("On this device" or "In the cloud · names hidden"), and a **What the model saw** panel shows the exact text that was sent.

Where to look in the code:

- Hybrid model creation (`mode`, `onDeviceParams.promptOptions.responseConstraint`, `inCloudParams.generationConfig.responseJsonSchema`): [`src/ai/firebase.ts#L95`](src/ai/firebase.ts#L95)
- The runner that calls `generateContent` and reads `response.inferenceSource`, with retry, timeout and a fallback model: [`src/ai/firebase.ts#L115`](src/ai/firebase.ts#L115)
- Gemini Nano download on a user gesture (`initializeDeviceModel`): [`src/ai/firebase.ts#L141`](src/ai/firebase.ts#L141)
- Where each job runs (`planSessionRun`): [`src/ai/engine.ts#L81`](src/ai/engine.ts#L81)
- Mask → prompt → leak check: [`src/ai/engine.ts#L130`](src/ai/engine.ts#L130)
- Session structuring, parent update and progress report: [`src/ai/engine.ts#L170`](src/ai/engine.ts#L170), [`#L237`](src/ai/engine.ts#L237), [`#L288`](src/ai/engine.ts#L288)
- The masker (whole words, accents, nicknames, duplicates, possessives, invisible characters…): [`src/lib/mask.ts#L256`](src/lib/mask.ts#L256)
- One JSON Schema shared by Gemini Nano and the cloud model, plus tolerant parsers: [`src/lib/schema.ts`](src/lib/schema.ts)
- Gemini Nano availability check: [`src/ai/availability.ts`](src/ai/availability.ts)

### Other Firebase products

- **App Check** with reCAPTCHA Enterprise protects the AI Logic endpoint ([`src/ai/firebase.ts#L30`](src/ai/firebase.ts#L30)).
- **Remote Config** holds the cloud model names and optional prompt overrides, so a retired model can be swapped without a deploy ([`src/ai/config.ts`](src/ai/config.ts)).
- **Anonymous Auth + Firestore** keep an *anonymised* backup of structured sessions: tokens only, no names, under `coaches/{uid}/sessions/{id}`, with Firestore's offline cache queueing writes made without signal ([`src/sync/anonymise.ts`](src/sync/anonymise.ts), rules in [`firestore.rules`](firestore.rules)).

Everything else is offline-first: IndexedDB for data, a service worker for the app shell, and plain notes from chips when no model is reachable at all.

## Features

- Squad with first names and nicknames; each child gets a permanent token that is never reused.
- Quick capture: one-tap chips for "did well", "work on" and welfare, plus free text. Voice notes appear only where Chrome can recognise speech **on the device**; Touchline never uses cloud speech.
- On-device structuring with structured output: strength, next step and a child-friendly praise line per player, a coach summary, and welfare flags.
- Flags worked out from history: "Ollie hasn't had a mention in 3 sessions", "Weak foot noted 3 sessions running".
- Player cards drawn on the device; share, download or copy.
- Cloud weekly parent update and 4-week progress report, with "What the cloud saw".
- Works offline, installable (PWA), light and dark themes, 48 px tap targets, WCAG 2.2 AA checked with axe.
- Export everything as JSON; delete everything (including the anonymised backups).

## Run it locally

Requires Node 22 and Chrome.

```bash
npm install
npm run dev          # http://localhost:5173
```

The app runs fully without any keys: squad, capture, cards, flags and offline notes all work. AI calls need App Check:

- **On the device:** in Chrome with Gemini Nano available (see Chrome's [built-in AI requirements](https://developer.chrome.com/docs/ai/get-started)), session structuring runs locally.
- **In the cloud:** the Firebase project only answers App Check-verified clients. For local development, register an App Check debug token for the web app in the Firebase console (App Check → Apps → ⋮ → Manage debug tokens) and start the dev server with it:

  ```bash
  VITE_APPCHECK_DEBUG_TOKEN=<your-debug-token> npm run dev
  ```

  To use your own Firebase project instead, replace `FIREBASE_CONFIG` in `src/ai/config.ts`, enable Firebase AI Logic (Gemini Developer API), anonymous Auth, Firestore (publish `firestore.rules`) and App Check with reCAPTCHA Enterprise, and build with `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY=<site key>`.

**Judges:** the hosted app at https://touchline.impactlayer.workers.dev needs no setup. Tap **Try the demo squad** (12 fictional players and 3 past sessions), then **Start today's session**. Without Gemini Nano you'll see the cloud path with names hidden; in Chrome with Gemini Nano you'll see "On this device".

## Tests

```bash
npm test                 # unit tests (vitest + fast-check), incl. 220+ adversarial masking tests
npm run test:coverage    # coverage, thresholds enforced (90% lines on core modules)
npm run build && npm run e2e   # Playwright at 375 px and 1280 px, axe accessibility checks
npm run e2e:live         # unmocked run against the real Firebase backend (needs TOUCHLINE_APPCHECK_DEBUG_TOKEN)
```

The end-to-end suite fakes only the network edge (the AI Logic REST endpoint) and, for the on-device test, Chrome's Prompt API, so the real Firebase SDK's hybrid routing is exercised. It asserts that no squad name appears in any request body.

## Privacy design

- Names, nicknames and notes live in IndexedDB on the device.
- The token map never leaves the device; the cloud model and Firestore see only tokens.
- Firestore rules allow a coach to read and write only their own anonymised records, with a fixed set of fields and size limits.
- No analytics, no ads, no tracking cookies, no accounts beyond an anonymous Firebase sign-in.
- Full plain-English policy in the app (Settings → How Touchline handles data).

Known limits, stated honestly: names that are also everyday words (Will, Mark, Max…) are hidden when capitalised but left alone in lowercase ("he will need to"), because a lowercase everyday word doesn't identify a child. Surnames are only hidden if added as a nickname (Touchline asks for first names). Every case is pinned by a test in `tests/unit/mask*.test.ts`.

## Built with

TypeScript, Preact, Vite, Firebase AI Logic (Gemini Nano in Chrome, Gemini 3.5 Flash-Lite in the cloud), Firebase App Check (reCAPTCHA Enterprise), Firebase Auth, Cloud Firestore, Firebase Remote Config, IndexedDB (`idb`), Workbox (`vite-plugin-pwa`), Cloudflare Workers static assets, Vitest, fast-check, Playwright, axe-core.

## AI disclosure and provenance

Built during the hackathon submission period (from 19 November 2026) with **Claude Code** (Anthropic) as the AI coding assistant. No pre-existing code: everything in this repository was written for this entry. Open-source dependencies are listed in `package.json`.

## Who made it

ImpactLayer, a trading name of Dragon Academy Ltd (16871720), 71-75 Shelton Street, Covent Garden, London WC2H 9JQ. Contact: support@impactlayer.co.uk. The idea comes from running a grassroots youth football academy in South Wales.

## Licence

Apache License 2.0. See [LICENSE](LICENSE).
