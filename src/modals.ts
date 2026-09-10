import { App, FuzzySuggestModal, Modal, Notice, Platform, TFile } from "obsidian";
import { hotkeyFromKeyboardEvent } from "./hotkey";

export class AudioFileSuggestModal extends FuzzySuggestModal<TFile> {
  constructor(
    app: App,
    private readonly files: TFile[],
    t: (key: string) => string,
    private readonly onChoose: (file: TFile) => void,
  ) {
    super(app);
    this.setPlaceholder(t("pickRecording"));
  }

  getItems(): TFile[] {
    return this.files;
  }

  getItemText(file: TFile): string {
    return file.path;
  }

  onChooseItem(file: TFile): void {
    this.onChoose(file);
  }
}

export class RecordingDecisionModal extends Modal {
  private resolved = false;

  constructor(
    app: App,
    private readonly t: (key: string) => string,
    private readonly resolveDecision: (decision: "transcribe" | "keep" | "discard") => void,
  ) {
    super(app);
  }

  private resolve(value: "transcribe" | "keep" | "discard"): void {
    if (this.resolved) return;
    this.resolved = true;
    this.resolveDecision(value);
    this.close();
  }

  override onOpen(): void {
    this.contentEl.createEl("h2", { text: this.t("decisionTitle") });
    this.contentEl.createEl("p", { text: this.t("decisionDescription") });
    const actions = this.contentEl.createDiv({ cls: "dictation-actions" });
    const keep = actions.createEl("button", { text: this.t("keep") });
    keep.addEventListener("click", () => this.resolve("keep"));
    const discard = actions.createEl("button", { text: this.t("discard"), cls: "mod-warning" });
    discard.addEventListener("click", () => this.resolve("discard"));
    const transcribe = actions.createEl("button", { text: this.t("transcribe"), cls: "mod-cta" });
    transcribe.addEventListener("click", () => this.resolve("transcribe"));
  }

  override onClose(): void {
    this.contentEl.empty();
    if (!this.resolved) {
      this.resolved = true;
      this.resolveDecision("keep");
    }
  }
}

export class TranscriptRecoveryModal extends Modal {
  constructor(
    app: App,
    private readonly t: (key: string) => string,
    private readonly transcript: string,
    private readonly descriptionKey = "recovered",
  ) {
    super(app);
  }

  override onOpen(): void {
    this.contentEl.addClass("dictation-recovery");
    this.contentEl.createEl("h2", { text: this.t("recoveryTitle") });
    this.contentEl.createEl("p", { text: this.t(this.descriptionKey) });
    const textarea = this.contentEl.createEl("textarea", {
      attr: { readonly: "", "aria-label": this.t("recoveryTitle") },
    });
    textarea.value = this.transcript;
    const actions = this.contentEl.createDiv({ cls: "dictation-actions" });
    const copy = actions.createEl("button", { text: this.t("copy"), cls: "mod-cta" });
    copy.addEventListener("click", () => {
      void (async () => {
        try {
          if (!navigator.clipboard) throw new Error("Clipboard unavailable");
          await navigator.clipboard.writeText(this.transcript);
          new Notice(this.t("copied"), 3000);
        } catch {
          textarea.focus();
          textarea.select();
        }
      })();
    });
    const close = actions.createEl("button", { text: this.t("close") });
    close.addEventListener("click", () => this.close());
    window.setTimeout(() => {
      textarea.focus();
      textarea.select();
    }, 0);
  }

  override onClose(): void {
    this.contentEl.empty();
  }
}

export class HotkeyCaptureModal extends Modal {
  constructor(
    app: App,
    private readonly t: (key: string) => string,
    private readonly onCaptured: (value: string | null) => void,
  ) {
    super(app);
  }

  override onOpen(): void {
    this.contentEl.createEl("h2", { text: this.t("hotkeyTitle") });
    this.contentEl.createEl("p", { text: this.t("hotkeyInstructions") });
    const display = this.contentEl.createDiv({ cls: "dictation-hotkey-capture", text: "…" });
    const listener = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        this.onCaptured(null);
        this.close();
        return;
      }
      const value = hotkeyFromKeyboardEvent(event, Platform.isMacOS);
      if (!value) {
        display.setText(this.t("invalidHotkey"));
        return;
      }
      display.setText(value);
      this.onCaptured(value);
      this.close();
    };
    window.addEventListener("keydown", listener, true);
    this.registerCleanup = () => window.removeEventListener("keydown", listener, true);
  }

  private registerCleanup: (() => void) | null = null;

  override onClose(): void {
    this.registerCleanup?.();
    this.registerCleanup = null;
    this.contentEl.empty();
  }
}
