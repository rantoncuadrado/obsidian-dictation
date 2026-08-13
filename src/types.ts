export type ProviderId = "openai" | "groq" | "deepgram" | "custom";

export type PluginState =
  | "idle"
  | "starting"
  | "recording"
  | "stopping"
  | "awaiting-audio"
  | "awaiting-decision"
  | "transcribing"
  | "inserting"
  | "completed"
  | "failed-audio-kept";

export type AfterRecordingAction = "ask" | "transcribe" | "keep";
export type RetentionPolicy = "keep" | "immediate" | "scheduled";
export type CustomAuthScheme = "bearer" | "token" | "none";

export interface EditorAnchor {
  path: string;
  offset: number;
  before: string;
  after: string;
}

export interface AudioFingerprint {
  size: number;
  mtime: number;
}

export interface ManagedAudioRecord {
  path: string;
  targetPath: string;
  transcribedAt: number;
  deleteAfter: number;
  fingerprint: AudioFingerprint;
}

export interface DictationSettings {
  settingsVersion: number;
  provider: ProviderId;
  secretNames: Record<ProviderId, string>;
  models: Record<ProviderId, string>;
  customModels: Record<ProviderId, string>;
  language: string;
  customLanguage: string;
  customEndpoint: string;
  customAuthScheme: CustomAuthScheme;
  customResponsePath: string;
  afterRecordingAction: AfterRecordingAction;
  pushToTalkEnabled: boolean;
  pushToTalkHotkey: string;
  retentionPolicy: RetentionPolicy;
  retentionDays: number;
  recordingsFolder: string;
  managedAudio: ManagedAudioRecord[];
}

export interface ProviderDefinition {
  id: ProviderId;
  name: string;
  endpoint: string;
  models: Array<{ value: string; label: string }>;
  defaultModel: string;
}

export interface TranscriptionRequestInput {
  provider: ProviderId;
  endpoint: string;
  model: string;
  language: string;
  secret: string;
  customAuthScheme: CustomAuthScheme;
  customResponsePath: string;
  fileName: string;
  extension: string;
  audio: ArrayBuffer;
}
