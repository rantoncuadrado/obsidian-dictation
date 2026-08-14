import {
  App,
  Platform,
  Plugin,
  PluginSettingTab,
  SecretComponent,
  Setting,
} from "obsidian";
import {
  CUSTOM_LANGUAGE_VALUE,
  CUSTOM_MODEL_VALUE,
  DEFAULT_RECORDINGS_FOLDER,
  LANGUAGES,
  PROVIDERS,
} from "./constants";
import { HotkeyCaptureModal } from "./modals";
import type { DictationSettings, ProviderId } from "./types";

interface SettingsHost {
  settings: DictationSettings;
  saveSettings(): Promise<void>;
  t(key: string, variables?: Record<string, unknown>): string;
}

const CUSTOM_ENDPOINT_PLACEHOLDER = "https://example.com/v1/audio/transcriptions";

export class DictationSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly host: Plugin & SettingsHost) {
    super(app, host);
  }

  private heading(text: string): void {
    new Setting(this.containerEl).setName(text).setHeading();
  }

  private keyedSetting(container: HTMLElement, key: string): Setting {
    const setting = new Setting(container);
    setting.settingEl.dataset.dictationSetting = key;
    return setting;
  }

  private scrollParent(element: HTMLElement): HTMLElement {
    let current = element.parentElement;
    while (current) {
      const style = window.getComputedStyle(current);
      if (
        /(auto|scroll|overlay)/u.test(style.overflowY) &&
        current.scrollHeight > current.clientHeight
      ) {
        return current;
      }
      current = current.parentElement;
    }
    return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
  }

  private async saveAndRefresh(anchorKey: string): Promise<void> {
    const selector = `[data-dictation-setting="${anchorKey}"]`;
    const oldAnchor = this.containerEl.querySelector<HTMLElement>(selector);
    const oldTop = oldAnchor?.getBoundingClientRect().top ?? 0;
    await this.host.saveSettings();
    this.display();
    const restore = () => {
      const newAnchor = this.containerEl.querySelector<HTMLElement>(selector);
      if (!newAnchor) return;
      const delta = newAnchor.getBoundingClientRect().top - oldTop;
      if (Math.abs(delta) < 1) return;
      const parent = this.scrollParent(newAnchor);
      parent.scrollTop += delta;
    };
    restore();
    window.requestAnimationFrame(() => {
      restore();
      window.requestAnimationFrame(restore);
    });
  }

  override display(): void {
    const { containerEl } = this;
    const { settings } = this.host;
    const t = this.host.t.bind(this.host);
    containerEl.empty();
    new Setting(containerEl).setName(t("settingsTitle")).setHeading();

    this.heading(t("providerHeading"));
    this.keyedSetting(containerEl, "provider")
      .setName(t("provider"))
      .setDesc(t("providerDescription"))
      .addDropdown((dropdown) => {
        for (const provider of Object.values(PROVIDERS)) {
          dropdown.addOption(provider.id, provider.name);
        }
        dropdown.setValue(settings.provider).onChange(async (value) => {
          settings.provider = value as ProviderId;
          await this.saveAndRefresh("provider");
        });
      });

    const definition = PROVIDERS[settings.provider]!;
    if (settings.provider === "custom") {
      new Setting(containerEl)
        .setName(t("customEndpoint"))
        .setDesc(t("customEndpointDescription"))
        .addText((text) =>
          text
            .setPlaceholder(CUSTOM_ENDPOINT_PLACEHOLDER)
            .setValue(settings.customEndpoint)
            .onChange(async (value) => {
              settings.customEndpoint = value.trim();
              await this.host.saveSettings();
            }),
        );
    } else {
      new Setting(containerEl)
        .setName(t("endpoint"))
        .setDesc(t("endpointManaged", { endpoint: definition.endpoint }));
    }

    const selectedModel = settings.models[settings.provider];
    const knownModel = definition.models.some((model) => model.value === selectedModel);
    this.keyedSetting(containerEl, "model")
      .setName(t("model"))
      .setDesc(t("modelDescription"))
      .addDropdown((dropdown) => {
        for (const model of definition.models) dropdown.addOption(model.value, model.label);
        dropdown.addOption(CUSTOM_MODEL_VALUE, t("customModel"));
        dropdown.setValue(knownModel ? selectedModel : CUSTOM_MODEL_VALUE).onChange(async (value) => {
          settings.models[settings.provider] = value;
          await this.saveAndRefresh("model");
        });
      });
    if (!knownModel) {
      new Setting(containerEl)
        .setName(t("customModel"))
        .addText((text) =>
          text.setValue(
            settings.customModels[settings.provider] ||
              (selectedModel === CUSTOM_MODEL_VALUE ? "" : selectedModel),
          ).onChange(async (value) => {
            settings.customModels[settings.provider] = value.trim();
            await this.host.saveSettings();
          }),
        );
    }

    if (settings.provider === "custom") {
      this.keyedSetting(containerEl, "custom-auth")
        .setName(t("customAuth"))
        .addDropdown((dropdown) =>
          dropdown
            .addOption("bearer", "Bearer")
            .addOption("token", "Token")
            .addOption("none", "None")
            .setValue(settings.customAuthScheme)
            .onChange(async (value) => {
              settings.customAuthScheme = value as DictationSettings["customAuthScheme"];
              await this.saveAndRefresh("custom-auth");
            }),
        );
      new Setting(containerEl)
        .setName(t("responsePath"))
        .setDesc(t("responsePathDescription"))
        .addText((text) =>
          text.setValue(settings.customResponsePath).onChange(async (value) => {
            settings.customResponsePath = value.trim() || "text";
            await this.host.saveSettings();
          }),
        );
    }

    if (settings.provider !== "custom" || settings.customAuthScheme !== "none") {
      new Setting(containerEl)
        .setName(t("apiKey"))
        .setDesc(t("apiKeyDescription"))
        .addComponent((element) =>
          new SecretComponent(this.app, element)
            .setValue(settings.secretNames[settings.provider])
            .onChange(async (value) => {
              settings.secretNames[settings.provider] = value;
              await this.host.saveSettings();
            }),
        );
    }

    this.heading(t("languageHeading"));
    let customLanguageSetting: Setting | null = null;
    this.keyedSetting(containerEl, "language")
      .setName(t("language"))
      .setDesc(t("languageDescription"))
      .addDropdown((dropdown) => {
        for (const [value, label] of LANGUAGES) dropdown.addOption(value, label);
        dropdown.setValue(settings.language).onChange(async (value) => {
          settings.language = value;
          await this.host.saveSettings();
          customLanguageSetting?.settingEl.classList.toggle(
            "dictation-setting-hidden",
            value !== CUSTOM_LANGUAGE_VALUE,
          );
        });
      });
    customLanguageSetting = new Setting(containerEl)
      .setName(t("customLanguage"))
      .setDesc(t("customLanguageDescription"))
      .addText((text) =>
        text.setValue(settings.customLanguage).onChange(async (value) => {
          settings.customLanguage = value.trim();
          await this.host.saveSettings();
        }),
      );
    customLanguageSetting.settingEl.classList.toggle(
      "dictation-setting-hidden",
      settings.language !== CUSTOM_LANGUAGE_VALUE,
    );

    this.heading(t("interactionHeading"));
    this.keyedSetting(containerEl, "after-recording")
      .setName(t("afterRecording"))
      .setDesc(t("afterRecordingDescription"))
      .addDropdown((dropdown) =>
        dropdown
          .addOption("ask", t("ask"))
          .addOption("transcribe", t("autoTranscribe"))
          .addOption("keep", t("keepAutomatically"))
          .setValue(settings.afterRecordingAction)
          .onChange(async (value) => {
            settings.afterRecordingAction = value as DictationSettings["afterRecordingAction"];
            await this.saveAndRefresh("after-recording");
          }),
      );
    if (settings.afterRecordingAction === "transcribe") {
      containerEl.createDiv({ cls: "dictation-warning", text: t("automaticWarning") });
    }
    this.keyedSetting(containerEl, "push-to-talk")
      .setName(t("pushToTalk"))
      .setDesc(t("pushToTalkDescription"))
      .setDisabled(!Platform.isDesktopApp)
      .addToggle((toggle) =>
        toggle.setValue(settings.pushToTalkEnabled).onChange(async (value) => {
          settings.pushToTalkEnabled = value;
          await this.saveAndRefresh("push-to-talk");
        }),
      );
    if (settings.pushToTalkEnabled && Platform.isDesktopApp) {
      this.keyedSetting(containerEl, "push-hotkey")
        .setName(t("pushHotkey"))
        .setDesc(t("pushHotkeyDescription"))
        .addButton((button) =>
          button.setButtonText(settings.pushToTalkHotkey || t("captureHotkey")).onClick(() => {
            new HotkeyCaptureModal(this.app, t, (value) => {
              if (value) {
                settings.pushToTalkHotkey = value;
                void this.saveAndRefresh("push-hotkey");
              }
            }).open();
          }),
        )
        .addButton((button) =>
          button.setButtonText(t("clear")).onClick(async () => {
            settings.pushToTalkHotkey = "";
            await this.saveAndRefresh("push-hotkey");
          }),
        );
    }

    this.heading(t("retentionHeading"));
    new Setting(containerEl)
      .setName(t("recordingsFolder"))
      .setDesc(t("recordingsFolderDescription"))
      .addText((text) =>
        text.setValue(settings.recordingsFolder).onChange(async (value) => {
          settings.recordingsFolder =
            value.trim().replace(/^\/+|\/+$/gu, "") || DEFAULT_RECORDINGS_FOLDER;
          await this.host.saveSettings();
        }),
      );
    this.keyedSetting(containerEl, "retention")
      .setName(t("retention"))
      .setDesc(t("retentionDescription"))
      .addDropdown((dropdown) =>
        dropdown
          .addOption("keep", t("keepForever"))
          .addOption("immediate", t("deleteImmediate"))
          .addOption("scheduled", t("deleteScheduled"))
          .setValue(settings.retentionPolicy)
          .onChange(async (value) => {
            settings.retentionPolicy = value as DictationSettings["retentionPolicy"];
            await this.saveAndRefresh("retention");
          }),
      );
    if (settings.retentionPolicy === "scheduled") {
      new Setting(containerEl)
        .setName(t("retentionDays"))
        .addText((text) =>
          text.setValue(String(settings.retentionDays)).onChange(async (value) => {
            const parsed = Number.parseInt(value, 10);
            if (Number.isFinite(parsed) && parsed >= 1) settings.retentionDays = parsed;
            await this.host.saveSettings();
          }),
        );
    }

    this.heading(t("privacyHeading"));
    containerEl.createEl("p", { text: t("privacy") });
    this.heading(t("statusHeading"));
    containerEl.createEl("p", { text: t("statusDescription") });
  }
}
