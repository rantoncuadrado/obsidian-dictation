import { App, normalizePath, TFile, TFolder } from "obsidian";
import type { ManagedAudioRecord } from "./types";
import { removeAudioReferences } from "./utils";

async function ensureFolder(app: App, path: string): Promise<void> {
  const normalized = normalizePath(path.trim());
  if (!normalized || normalized === "/") return;
  const parts = normalized.split("/").filter(Boolean);
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    const existing = app.vault.getAbstractFileByPath(current);
    if (existing instanceof TFolder) continue;
    if (existing) throw new Error(`The recording folder path conflicts with a file: ${current}`);
    await app.vault.createFolder(current);
  }
}

async function uniqueDestination(app: App, folder: string, file: TFile): Promise<string> {
  const base = normalizePath(`${folder}/${file.basename}`);
  let candidate = `${base}.${file.extension}`;
  let suffix = 2;
  while (app.vault.getAbstractFileByPath(candidate)) {
    candidate = `${base} ${suffix}.${file.extension}`;
    suffix += 1;
  }
  return candidate;
}

export async function moveSuccessfulAudio(
  app: App,
  file: TFile,
  folder: string,
): Promise<TFile> {
  const normalized = normalizePath(folder.trim());
  if (!normalized || file.parent?.path === normalized) return file;
  await ensureFolder(app, normalized);
  const destination = await uniqueDestination(app, normalized, file);
  await app.fileManager.renameFile(file, destination);
  const moved = app.vault.getAbstractFileByPath(destination);
  if (!(moved instanceof TFile)) throw new Error("The moved recording could not be found.");
  return moved;
}

async function notesReferencingAudio(app: App, audio: TFile): Promise<TFile[]> {
  const references: TFile[] = [];
  const encodedPath = encodeURI(audio.path);
  for (const note of app.vault.getMarkdownFiles()) {
    const content = await app.vault.cachedRead(note);
    if (content.includes(audio.path) || content.includes(audio.name) || content.includes(encodedPath)) {
      references.push(note);
    }
  }
  return references;
}

async function removeReferencesFromNotes(
  app: App,
  audio: TFile,
  notes: TFile[],
): Promise<void> {
  for (const note of notes) {
    await app.vault.process(note, (content) => removeAudioReferences(content, audio));
  }
}

export async function removeStaleAudioReferences(
  app: App,
  audio: { path: string; name: string },
): Promise<void> {
  for (const note of app.vault.getMarkdownFiles()) {
    const current = await app.vault.cachedRead(note);
    if (removeAudioReferences(current, audio) === current) continue;
    await app.vault.process(note, (content) => removeAudioReferences(content, audio));
  }
}

export async function removeAudioReferenceFromNote(
  app: App,
  notePath: string,
  audio: { path: string; name: string },
): Promise<void> {
  const note = app.vault.getAbstractFileByPath(notePath);
  if (!(note instanceof TFile) || note.extension !== "md") return;
  await app.vault.process(note, (content) => removeAudioReferences(content, audio));
}

export async function safelyTrashAudio(
  app: App,
  audio: TFile,
  expectedTargetPath?: string,
): Promise<boolean> {
  const references = await notesReferencingAudio(app, audio);
  if (expectedTargetPath && references.some((note) => note.path !== expectedTargetPath)) {
    return false;
  }
  await removeReferencesFromNotes(app, audio, references);
  await app.fileManager.trashFile(audio);
  return true;
}

export function createManagedAudioRecord(
  file: TFile,
  targetPath: string,
  retentionDays: number,
): ManagedAudioRecord {
  const transcribedAt = Date.now();
  return {
    path: file.path,
    targetPath,
    transcribedAt,
    deleteAfter: transcribedAt + Math.max(1, retentionDays) * 86_400_000,
    fingerprint: { size: file.stat.size, mtime: file.stat.mtime },
  };
}

export async function cleanExpiredAudio(
  app: App,
  records: ManagedAudioRecord[],
  now = Date.now(),
): Promise<{ remaining: ManagedAudioRecord[]; changed: boolean }> {
  const remaining: ManagedAudioRecord[] = [];
  let changed = false;
  for (const record of records) {
    if (record.deleteAfter > now) {
      remaining.push(record);
      continue;
    }
    const abstractFile = app.vault.getAbstractFileByPath(record.path);
    if (!(abstractFile instanceof TFile)) {
      changed = true;
      continue;
    }
    if (
      abstractFile.stat.size !== record.fingerprint.size ||
      abstractFile.stat.mtime !== record.fingerprint.mtime
    ) {
      changed = true;
      continue;
    }
    try {
      const deleted = await safelyTrashAudio(app, abstractFile, record.targetPath);
      changed = true;
      if (!deleted) continue;
    } catch {
      remaining.push(record);
    }
  }
  return { remaining, changed };
}
