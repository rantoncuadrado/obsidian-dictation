import type { DictationSettings, ProviderDefinition } from "./types";

export const COMMAND_ID = "toggle-recording";
export const CORE_RECORDING_START_COMMAND = "audio-recorder:start";
export const CORE_RECORDING_STOP_COMMAND = "audio-recorder:stop";
export const CUSTOM_MODEL_VALUE = "__custom__";
export const CUSTOM_LANGUAGE_VALUE = "__custom__";
export const DEFAULT_RECORDINGS_FOLDER = "Dictation/Recordings";

export const AUDIO_EXTENSIONS = new Set([
  "aac",
  "flac",
  "m4a",
  "mp3",
  "mp4",
  "mpeg",
  "mpga",
  "ogg",
  "wav",
  "webm",
]);

export function isAudioExtension(extension: string): boolean {
  return AUDIO_EXTENSIONS.has(extension.toLowerCase());
}

export const PROVIDERS: Record<string, ProviderDefinition> = {
  openai: {
    id: "openai",
    name: "OpenAI",
    endpoint: "https://api.openai.com/v1/audio/transcriptions",
    defaultModel: "gpt-4o-mini-transcribe",
    models: [
      { value: "gpt-4o-mini-transcribe", label: "GPT-4o mini Transcribe — recommended" },
      { value: "gpt-4o-transcribe", label: "GPT-4o Transcribe — higher accuracy" },
      { value: "whisper-1", label: "Whisper 1 — legacy compatibility" },
    ],
  },
  groq: {
    id: "groq",
    name: "Groq",
    endpoint: "https://api.groq.com/openai/v1/audio/transcriptions",
    defaultModel: "whisper-large-v3-turbo",
    models: [
      { value: "whisper-large-v3-turbo", label: "Whisper Large v3 Turbo — recommended" },
      { value: "whisper-large-v3", label: "Whisper Large v3 — higher accuracy" },
    ],
  },
  deepgram: {
    id: "deepgram",
    name: "Deepgram",
    endpoint: "https://api.deepgram.com/v1/listen",
    defaultModel: "nova-3",
    models: [
      { value: "nova-3", label: "Nova 3 — recommended" },
      { value: "nova-2", label: "Nova 2 — broader language coverage" },
      { value: "nova-2-meeting", label: "Nova 2 Meeting" },
      { value: "nova-2-phonecall", label: "Nova 2 Phone Call" },
    ],
  },
  custom: {
    id: "custom",
    name: "Custom / OpenAI-compatible",
    endpoint: "",
    defaultModel: "",
    models: [],
  },
};

export const LANGUAGES = [
  ["auto", "Auto detect"],
  ["es", "Spanish (es)"],
  ["en", "English (en)"],
  ["ca", "Catalan (ca)"],
  ["fr", "French (fr)"],
  ["de", "German (de)"],
  ["it", "Italian (it)"],
  ["pt", "Portuguese (pt)"],
  ["nl", "Dutch (nl)"],
  ["pl", "Polish (pl)"],
  ["ro", "Romanian (ro)"],
  ["ru", "Russian (ru)"],
  ["uk", "Ukrainian (uk)"],
  ["tr", "Turkish (tr)"],
  ["ar", "Arabic (ar)"],
  ["zh", "Chinese (zh)"],
  ["ja", "Japanese (ja)"],
  ["ko", "Korean (ko)"],
  [CUSTOM_LANGUAGE_VALUE, "Other language code…"],
] as const;

export const DEFAULT_SETTINGS: DictationSettings = {
  settingsVersion: 2,
  provider: "openai",
  secretNames: { openai: "", groq: "", deepgram: "", custom: "" },
  models: {
    openai: "gpt-4o-mini-transcribe",
    groq: "whisper-large-v3-turbo",
    deepgram: "nova-3",
    custom: "",
  },
  customModels: { openai: "", groq: "", deepgram: "", custom: "" },
  language: "auto",
  customLanguage: "",
  customEndpoint: "",
  customAuthScheme: "bearer",
  customResponsePath: "text",
  afterRecordingAction: "ask",
  pushToTalkEnabled: false,
  pushToTalkHotkey: "",
  retentionPolicy: "scheduled",
  retentionDays: 21,
  recordingsFolder: DEFAULT_RECORDINGS_FOLDER,
  managedAudio: [],
};

export const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
export const ANCHOR_CONTEXT_LENGTH = 80;
