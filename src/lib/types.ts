/** Where a piece of text came from. Drives the badge shown next to it. */
export type Source = 'on_device' | 'in_cloud' | 'chips' | 'demo' | 'coach';

export interface Player {
  id: string;
  /** Stable masking token, e.g. "P03". Never reused, even after delete. */
  token: string;
  name: string;
  aliases: string[];
  group: string;
  createdAt: number;
  archived?: boolean;
  /** Name and notes erased; kept only so the token is never reused. */
  erased?: boolean;
}

export interface PlayerNote {
  playerId: string;
  chips: string[];
  text: string;
}

export interface PlayerObservation {
  playerId: string;
  strength: string;
  nextStep: string;
  praise: string;
  /** Edited by the coach after generation. */
  edited?: boolean;
}

export interface SessionFlag {
  playerId: string | null;
  note: string;
  kind: 'welfare' | 'quiet' | 'pattern';
}

export interface StructuredSession {
  observations: PlayerObservation[];
  summary: string;
  flags: SessionFlag[];
  source: Source;
  /** What the model was sent (names already hidden). Shown in "What the model saw". */
  sentText: string;
  model: string;
  createdAt: number;
}

export interface Session {
  id: string;
  date: string; // YYYY-MM-DD, Europe/London
  group: string;
  focus: string;
  /** Players present. */
  attendees: string[];
  notes: PlayerNote[];
  generalNotes: string;
  structured?: StructuredSession;
  createdAt: number;
  updatedAt: number;
  demo?: boolean;
  syncedAt?: number;
}

export type ReportKind = 'parent_update' | 'progress';

export interface CloudReport {
  id: string;
  kind: ReportKind;
  /** Group for parent updates, player id for progress reports. */
  subject: string;
  /** Week start (Monday) for parent updates; end date for progress. */
  period: string;
  title: string;
  body: string;
  /** Per-player lines (parent update) or bullet points (progress). */
  items: Array<{ playerId: string | null; text: string }>;
  source: Source;
  sentText: string;
  receivedText: string;
  model: string;
  createdAt: number;
}

export interface Settings {
  coachName: string;
  extraHiddenWords: string[];
  cloudAllowed: boolean;
  syncEnabled: boolean;
  onboarded: boolean;
  nextToken: number;
  theme: 'system' | 'light' | 'dark';
}

export const DEFAULT_SETTINGS: Settings = {
  coachName: '',
  extraHiddenWords: [],
  cloudAllowed: true,
  syncEnabled: false,
  onboarded: false,
  nextToken: 1,
  theme: 'system',
};
