import {
  addIcon,
  App,
  MarkdownView,
  Notice,
  Platform,
  Plugin,
  removeIcon,
  setIcon,
  TFile,
  TAbstractFile,
} from "obsidian";
import {
  cleanExpiredAudio,
  createManagedAudioRecord,
  moveSuccessfulAudio,
  removeAudioReferenceFromNote,
  removeStaleAudioReferences,
  safelyTrashAudio,
} from "./audio-lifecycle";
import {
  AUDIO_EXTENSIONS,
  CLEANUP_INTERVAL_MS,
  COMMAND_ID,
  CORE_RECORDING_START_COMMAND,
  CORE_RECORDING_STOP_COMMAND,
  CUSTOM_LANGUAGE_VALUE,
  CUSTOM_MODEL_VALUE,
  DEFAULT_SETTINGS,
  DEFAULT_RECORDINGS_FOLDER,
  PROVIDERS,
} from "./constants";
import { createEditorAnchor, insertAtAnchor } from "./destination";
import { eventMatchesHotkey, isTextInputTarget, parseHotkey } from "./hotkey";
import {
  DICTATION_ICON_ID,
  DICTATION_ICON_SVG,
  DICTATION_STOP_ICON_ID,
  DICTATION_STOP_ICON_SVG,
} from "./icon";
import { createTranslator } from "./i18n";
import { calculateMobileButtonPosition } from "./mobile-position";
import { RecordingDecisionModal, TranscriptRecoveryModal } from "./modals";
import { providerEndpoint, requestTranscription } from "./providers";
import { DictationSettingTab } from "./settings-tab";
import type { DictationSettings, EditorAnchor, PluginState, ProviderId } from "./types";
import { formatDuration, safeErrorMessage } from "./utils";

const AUDIO_WAIT_MS = 8_000;

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function isAudioFile(file: TAbstractFile): file is TFile {
  return file instanceof TFile && AUDIO_EXTENSIONS.has(file.extension.toLowerCase());
}

export default class DictationPlugin extends Plugin {
  override settings: DictationSettings = structuredClone(DEFAULT_SETTINGS);
  readonly t = createTranslator();

  private state: PluginState = "idle";
  private anchor: EditorAnchor | null = null;
  private knownAudioPaths = new Set<string>();
  private createdAudio: TFile | null = null;
  private statusBar: HTMLElement | null = null;
  private ribbon: HTMLElement | null = null;
  private mobileButton: HTMLButtonElement | null = null;
  private recordingStartedAt = 0;
  private statusInterval: number | null = null;
  private transitionLocked = false;
  private pushToTalkActive = false;
  private pushToTalkReleasePending = false;
  private mobilePositionFrame: number | null = null;
  private mobilePositionTimers: number[] = [];

  override async onload(): Promise<void> {
    await this.loadSettings();
    addIcon(DICTATION_ICON_ID, DICTATION_ICON_SVG);
    addIcon(DICTATION_STOP_ICON_ID, DICTATION_STOP_ICON_SVG);
    this.register(() => {
      removeIcon(DICTATION_ICON_ID);
      removeIcon(DICTATION_STOP_ICON_ID);
    });
    this.addCommand({
      id: COMMAND_ID,
      name: this.t("command"),
      callback: () => void this.toggleDictation(),
    });
    this.ribbon = this.addRibbonIcon(DICTATION_ICON_ID, this.t("command"), () => {
      void this.toggleDictation();
    });
    this.statusBar = this.addStatusBarItem();
    this.statusBar.addClass("dictation-status");
    this.statusBar.setAttribute("role", "button");
    this.statusBar.setAttribute("tabindex", "0");
    this.statusBar.addEventListener("click", () => void this.toggleDictation());
    this.registerDomEvent(this.statusBar, "keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") void this.toggleDictation();
    });
    if (Platform.isMobile) {
      this.mobileButton = document.body.createEl("button", {
        cls: "dictation-mobile-record-button",
        attr: { type: "button" },
      });
      this.registerDomEvent(this.mobileButton, "click", () => void this.toggleDictation());
      this.registerDomEvent(window, "resize", () => this.scheduleSettledMobilePosition());
      this.registerDomEvent(document, "focusin", () => this.scheduleSettledMobilePosition(), true);
      this.registerDomEvent(document, "focusout", () => this.scheduleSettledMobilePosition(), true);
      this.registerDomEvent(document, "selectionchange", () => this.scheduleMobileButtonPosition());
      const viewport = window.visualViewport;
      if (viewport) {
        const reposition = () => this.scheduleMobileButtonPosition();
        viewport.addEventListener("resize", reposition);
        viewport.addEventListener("scroll", reposition);
        this.register(() => {
          viewport.removeEventListener("resize", reposition);
          viewport.removeEventListener("scroll", reposition);
        });
      }
      this.register(() => {
        if (this.mobilePositionFrame !== null) {
          window.cancelAnimationFrame(this.mobilePositionFrame);
          this.mobilePositionFrame = null;
        }
        for (const timer of this.mobilePositionTimers) window.clearTimeout(timer);
        this.mobilePositionTimers = [];
        this.mobileButton?.remove();
        this.mobileButton = null;
      });
    }
    this.registerEvent(this.app.vault.on("create", (file) => this.onFileCreated(file)));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.updateStatus()));
    this.registerEvent(this.app.workspace.on("file-open", () => this.updateStatus()));
    this.registerDomEvent(document, "keydown", (event) => this.onPushToTalkDown(event), true);
    this.registerDomEvent(document, "keyup", (event) => this.onPushToTalkUp(event), true);
    this.registerDomEvent(window, "blur", () => this.releasePushToTalk());
    this.addSettingTab(new DictationSettingTab(this.app, this));
    this.updateStatus();
    this.app.workspace.onLayoutReady(() => void this.runCleanup());
    this.registerInterval(window.setInterval(() => void this.runCleanup(), CLEANUP_INTERVAL_MS));
  }

  override onunload(): void {
    this.stopStatusTimer();
    if (["starting", "recording"].includes(this.state)) {
      this.executeCoreCommand(CORE_RECORDING_STOP_COMMAND);
    }
  }

  async loadSettings(): Promise<void> {
    const loaded = (await this.loadData()) as Partial<DictationSettings> | null;
    let needsSave = false;
    this.settings = {
      ...structuredClone(DEFAULT_SETTINGS),
      ...(loaded ?? {}),
      secretNames: { ...DEFAULT_SETTINGS.secretNames, ...(loaded?.secretNames ?? {}) },
      models: { ...DEFAULT_SETTINGS.models, ...(loaded?.models ?? {}) },
      customModels: { ...DEFAULT_SETTINGS.customModels, ...(loaded?.customModels ?? {}) },
      managedAudio: Array.isArray(loaded?.managedAudio) ? loaded.managedAudio : [],
    };
    if (
      !loaded?.settingsVersion &&
      loaded?.retentionPolicy === "keep" &&
      loaded?.retentionDays === 7 &&
      !loaded?.recordingsFolder
    ) {
      this.settings.retentionPolicy = DEFAULT_SETTINGS.retentionPolicy;
      this.settings.retentionDays = DEFAULT_SETTINGS.retentionDays;
      this.settings.recordingsFolder = DEFAULT_SETTINGS.recordingsFolder;
      needsSave = true;
    }
    if (this.settings.settingsVersion !== DEFAULT_SETTINGS.settingsVersion) needsSave = true;
    this.settings.settingsVersion = DEFAULT_SETTINGS.settingsVersion;
    if (!this.settings.recordingsFolder.trim()) {
      this.settings.recordingsFolder = DEFAULT_RECORDINGS_FOLDER;
      needsSave = true;
    }
    if (needsSave) await this.saveSettings();
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private executeCoreCommand(id: string): boolean {
    const app = this.app as App & {
      commands: { executeCommandById(commandId: string): boolean };
    };
    return app.commands.executeCommandById(id);
  }

  private setState(state: PluginState): void {
    this.state = state;
    this.updateStatus();
  }

  private updateStatus(): void {
    let label = this.t("statusName");
    if (this.state === "recording") {
      label = `${this.t("recording")} ${formatDuration(Date.now() - this.recordingStartedAt)}`;
    } else if (this.state === "awaiting-decision") {
      label = this.t("waiting");
    } else if (this.state === "transcribing") {
      label = this.t("transcribing", { name: "" }).trim();
    } else if (this.state !== "idle" && this.state !== "completed") {
      label = this.t("configurationRequired");
    }
    if (this.statusBar) {
      this.statusBar.empty();
      const icon = this.statusBar.createSpan({ cls: "dictation-status-icon" });
      setIcon(icon, this.state === "recording" ? DICTATION_STOP_ICON_ID : DICTATION_ICON_ID);
      this.statusBar.createSpan({ text: label });
      this.statusBar.toggleClass("is-recording", this.state === "recording");
      this.statusBar.setAttribute("aria-label", this.state === "recording" ? this.t("stopRecording") : this.t("command"));
    }
    this.ribbon?.toggleClass("is-recording", this.state === "recording");
    this.updateMobileButton();
  }

  private updateMobileButton(): void {
    if (!this.mobileButton) return;
    const isRecording = this.state === "recording";
    const canStart = ["idle", "completed", "failed-audio-kept"].includes(this.state);
    const hasActiveNote = Boolean(this.app.workspace.getActiveViewOfType(MarkdownView)?.file);
    this.mobileButton.empty();
    setIcon(this.mobileButton, isRecording ? DICTATION_STOP_ICON_ID : DICTATION_ICON_ID);
    this.mobileButton.toggleClass("is-recording", isRecording);
    this.mobileButton.toggleClass("is-hidden", !hasActiveNote && !isRecording);
    this.mobileButton.disabled = !isRecording && !canStart;
    const accessibleLabel = isRecording ? this.t("stopRecording") : this.t("command");
    this.mobileButton.setAttribute("aria-label", accessibleLabel);
    this.mobileButton.setAttribute("title", accessibleLabel);
    this.scheduleMobileButtonPosition();
  }

  private scheduleMobileButtonPosition(): void {
    if (!this.mobileButton || this.mobilePositionFrame !== null) return;
    this.mobilePositionFrame = window.requestAnimationFrame(() => {
      this.mobilePositionFrame = null;
      this.updateMobileButtonPosition();
    });
  }

  private scheduleSettledMobilePosition(): void {
    this.scheduleMobileButtonPosition();
    for (const timer of this.mobilePositionTimers) window.clearTimeout(timer);
    this.mobilePositionTimers = [];
    for (const delay of [80, 180, 350, 600]) {
      const timer = window.setTimeout(() => {
        this.mobilePositionTimers = this.mobilePositionTimers.filter(
          (candidate) => candidate !== timer,
        );
        this.scheduleMobileButtonPosition();
      }, delay);
      this.mobilePositionTimers.push(timer);
    }
  }

  private visibleMobileToolbarTop(): number | undefined {
    let nearestTop: number | undefined;
    for (const toolbar of Array.from(
      document.querySelectorAll<HTMLElement>(".mobile-toolbar"),
    )) {
      const style = window.getComputedStyle(toolbar);
      const rect = toolbar.getBoundingClientRect();
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        rect.width < 100 ||
        rect.height < 20 ||
        rect.top <= 0 ||
        rect.top >= window.innerHeight
      ) continue;
      nearestTop = nearestTop === undefined ? rect.top : Math.min(nearestTop, rect.top);
    }
    return nearestTop;
  }

  private updateMobileButtonPosition(): void {
    const button = this.mobileButton;
    const viewport = window.visualViewport;
    if (!button || !viewport) return;
    const position = calculateMobileButtonPosition(
      window.innerWidth,
      viewport,
      54,
      76,
      16,
      12,
      this.visibleMobileToolbarTop(),
    );
    button.addClass("is-viewport-positioned");
    button.setCssProps({
      right: `${Math.round(position.right)}px`,
      top: `${Math.round(position.top)}px`,
    });
  }

  private startStatusTimer(): void {
    this.stopStatusTimer();
    this.statusInterval = window.setInterval(() => this.updateStatus(), 1_000);
  }

  private stopStatusTimer(): void {
    if (this.statusInterval !== null) window.clearInterval(this.statusInterval);
    this.statusInterval = null;
  }

  private captureDestination(): EditorAnchor | null {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.file) return null;
    const content = view.editor.getValue();
    const offset = view.editor.posToOffset(view.editor.getCursor());
    return createEditorAnchor(view.file.path, content, offset);
  }

  private resetRecordingContext(): void {
    this.anchor = null;
    this.createdAudio = null;
    this.knownAudioPaths.clear();
    this.pushToTalkActive = false;
    this.pushToTalkReleasePending = false;
  }

  private async toggleDictation(): Promise<void> {
    if (this.transitionLocked) return;
    if (this.state === "idle" || this.state === "completed" || this.state === "failed-audio-kept") {
      await this.startRecording();
    } else if (this.state === "recording") {
      await this.stopRecording();
    }
  }

  private async startRecording(fromPushToTalk = false): Promise<boolean> {
    if (this.transitionLocked || !["idle", "completed", "failed-audio-kept"].includes(this.state)) return false;
    this.transitionLocked = true;
    try {
      const anchor = this.captureDestination();
      if (!anchor) {
        new Notice(this.t("configurationRequired"));
        return false;
      }
      this.resetRecordingContext();
      this.anchor = anchor;
      this.knownAudioPaths = new Set(
        this.app.vault.getFiles().filter(isAudioFile).map((file) => file.path),
      );
      this.setState("starting");
      const executed = this.executeCoreCommand(CORE_RECORDING_START_COMMAND);
      if (!executed) {
        this.setState("idle");
        new Notice(this.t("recorderUnavailable"), 6_000);
        return false;
      }
      this.recordingStartedAt = Date.now();
      this.pushToTalkActive = fromPushToTalk;
      this.setState("recording");
      this.startStatusTimer();
      new Notice(this.t("recordingStarted"), 2_000);
      if (this.pushToTalkReleasePending) {
        window.setTimeout(() => void this.stopRecording(), 0);
      }
      return true;
    } finally {
      this.transitionLocked = false;
    }
  }

  private async stopRecording(): Promise<void> {
    if (this.transitionLocked || this.state !== "recording") return;
    this.transitionLocked = true;
    this.setState("stopping");
    this.stopStatusTimer();
    try {
      this.executeCoreCommand(CORE_RECORDING_STOP_COMMAND);
      this.setState("awaiting-audio");
      new Notice(this.t("recordingStopped"), 2_000);
      const audio = await this.waitForAudio();
      if (!audio) {
        this.fail(this.t("audioNotFound"));
        return;
      }
      await this.handleRecordedAudio(audio);
    } finally {
      this.transitionLocked = false;
      this.pushToTalkActive = false;
      this.pushToTalkReleasePending = false;
    }
  }

  private onFileCreated(file: TAbstractFile): void {
    if (!isAudioFile(file)) return;
    if (["starting", "recording", "stopping", "awaiting-audio"].includes(this.state)) {
      this.createdAudio = file;
    }
  }

  private newestUnknownAudio(): TFile | null {
    return this.app.vault
      .getFiles()
      .filter(isAudioFile)
      .filter((file) => !this.knownAudioPaths.has(file.path))
      .sort((left, right) => right.stat.ctime - left.stat.ctime)[0] ?? null;
  }

  private async waitForAudio(): Promise<TFile | null> {
    const started = Date.now();
    while (Date.now() - started < AUDIO_WAIT_MS) {
      const candidate = this.createdAudio ?? this.newestUnknownAudio();
      if (candidate && candidate.stat.size > 0) return candidate;
      await delay(100);
    }
    return this.createdAudio ?? this.newestUnknownAudio();
  }

  private async handleRecordedAudio(audio: TFile): Promise<void> {
    const action = this.settings.afterRecordingAction;
    if (action === "keep") {
      this.complete(this.t("recordingKept"));
      return;
    }
    if (action === "transcribe") {
      await this.transcribe(audio);
      return;
    }
    this.setState("awaiting-decision");
    const decision = await new Promise<"transcribe" | "keep" | "discard">((resolve) => {
      new RecordingDecisionModal(this.app, this.t, resolve).open();
    });
    if (decision === "transcribe") await this.transcribe(audio);
    else if (decision === "discard") await this.discard(audio);
    else this.complete(this.t("recordingKept"));
  }

  private selectedModel(provider: ProviderId): string {
    const selected = this.settings.models[provider];
    const known = PROVIDERS[provider]!.models.some((model) => model.value === selected);
    return (
      selected === CUSTOM_MODEL_VALUE || !known
        ? this.settings.customModels[provider] || selected
        : selected
    ).trim();
  }

  private selectedLanguage(): string {
    return (this.settings.language === CUSTOM_LANGUAGE_VALUE
      ? this.settings.customLanguage
      : this.settings.language
    ).trim();
  }

  private secretFor(provider: ProviderId): string {
    if (provider === "custom" && this.settings.customAuthScheme === "none") return "";
    const secretName = this.settings.secretNames[provider];
    if (!secretName) throw new Error(this.t("configureSecret"));
    const secret = this.app.secretStorage.getSecret(secretName);
    if (!secret) throw new Error(this.t("missingSecret", { name: secretName }));
    return secret;
  }

  private async transcribe(audio: TFile): Promise<void> {
    if (!this.anchor) {
      this.fail("The original note destination is unavailable.");
      return;
    }
    try {
      const provider = this.settings.provider;
      const endpoint = providerEndpoint(provider, this.settings.customEndpoint);
      const model = this.selectedModel(provider);
      if (!endpoint) throw new Error(this.t("configureEndpoint"));
      if (!model) throw new Error(this.t("configureModel"));
      const secret = this.secretFor(provider);
      this.setState("transcribing");
      new Notice(this.t("transcribing", { name: audio.name }), 4_000);
      const transcript = await requestTranscription({
        provider,
        endpoint,
        model,
        language: this.selectedLanguage(),
        secret,
        customAuthScheme: this.settings.customAuthScheme,
        customResponsePath: this.settings.customResponsePath,
        fileName: audio.name,
        extension: audio.extension,
        audio: await this.app.vault.readBinary(audio),
      });
      this.setState("inserting");
      const inserted = await this.insertTranscript(transcript);
      if (!inserted) {
        new TranscriptRecoveryModal(this.app, this.t, transcript).open();
        this.fail(this.t("recovered"));
        return;
      }
      const originalAudio = { path: audio.path, name: audio.name };
      const managedFile = await moveSuccessfulAudio(
        this.app,
        audio,
        this.settings.recordingsFolder || DEFAULT_RECORDINGS_FOLDER,
      );
      await removeAudioReferenceFromNote(this.app, this.anchor.path, originalAudio);
      await removeAudioReferenceFromNote(this.app, this.anchor.path, managedFile);
      await this.applyRetention(managedFile, this.anchor.path);
      this.complete(this.t("transcriptionComplete"));
    } catch (error) {
      this.fail(safeErrorMessage(error));
    }
  }

  private async insertTranscript(transcript: string): Promise<boolean> {
    const anchor = this.anchor;
    if (!anchor) return false;
    const target = this.app.vault.getAbstractFileByPath(anchor.path);
    if (!(target instanceof TFile)) return false;
    let inserted = false;
    await this.app.vault.process(target, (content) => {
      const updated = insertAtAnchor(content, anchor, transcript);
      if (updated === null) return content;
      inserted = true;
      return updated;
    });
    return inserted;
  }

  private async applyRetention(audio: TFile, targetPath: string): Promise<void> {
    if (this.settings.retentionPolicy === "keep") return;
    if (this.settings.retentionPolicy === "immediate") {
      await safelyTrashAudio(this.app, audio, targetPath);
      return;
    }
    this.settings.managedAudio.push(
      createManagedAudioRecord(audio, targetPath, this.settings.retentionDays),
    );
    await this.saveSettings();
  }

  private async discard(audio: TFile): Promise<void> {
    try {
      await delay(250);
      const current = this.app.vault.getAbstractFileByPath(audio.path);
      if (current instanceof TFile) await safelyTrashAudio(this.app, current);
      await delay(250);
      await removeStaleAudioReferences(this.app, audio);
      await delay(500);
      await removeStaleAudioReferences(this.app, audio);
      this.complete(this.t("recordingDiscarded"));
    } catch (error) {
      this.fail(safeErrorMessage(error));
    }
  }

  private complete(message: string): void {
    this.setState("completed");
    new Notice(message, 3_000);
    this.resetRecordingContext();
    window.setTimeout(() => {
      if (this.state === "completed") this.setState("idle");
    }, 1_000);
  }

  private fail(detail: string): void {
    this.setState("failed-audio-kept");
    new Notice(this.t("error", { detail }), 8_000);
    this.resetRecordingContext();
  }

  private onPushToTalkDown(event: KeyboardEvent): void {
    if (
      !Platform.isDesktopApp ||
      !this.settings.pushToTalkEnabled ||
      !this.settings.pushToTalkHotkey ||
      event.repeat ||
      isTextInputTarget(event.target) ||
      !eventMatchesHotkey(event, this.settings.pushToTalkHotkey, Platform.isMacOS)
    ) return;
    event.preventDefault();
    event.stopPropagation();
    this.pushToTalkReleasePending = false;
    void this.startRecording(true);
  }

  private onPushToTalkUp(event: KeyboardEvent): void {
    if (!this.pushToTalkActive && this.state !== "starting") return;
    const mainKey = parseHotkey(this.settings.pushToTalkHotkey).at(-1);
    const released = event.key === " " ? "Space" : event.key.length === 1 ? event.key.toUpperCase() : event.key;
    if (released !== mainKey) return;
    event.preventDefault();
    this.releasePushToTalk();
  }

  private releasePushToTalk(): void {
    if (!this.pushToTalkActive && this.state !== "starting") return;
    if (this.state === "starting") {
      this.pushToTalkReleasePending = true;
      return;
    }
    if (this.state === "recording") void this.stopRecording();
  }

  private async runCleanup(): Promise<void> {
    if (this.settings.managedAudio.length === 0) return;
    const result = await cleanExpiredAudio(this.app, this.settings.managedAudio);
    if (result.changed) {
      this.settings.managedAudio = result.remaining;
      await this.saveSettings();
    }
  }
}
