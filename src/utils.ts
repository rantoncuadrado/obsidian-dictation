export function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function normalizeTranscript(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/gu, " ").trim() : "";
}

export function safeErrorMessage(error: unknown): string {
  const raw = error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : "Unknown error";
  return raw
    .replace(/\bBearer\s+[^\s,;]+/giu, "Bearer [redacted]")
    .replace(/\bToken\s+[^\s,;]+/giu, "Token [redacted]")
    .replace(/\b(?:sk|gsk)_[A-Za-z0-9_-]{8,}\b/gu, "[redacted]")
    .slice(0, 1000);
}

export function audioMimeType(extension: string): string {
  const types: Record<string, string> = {
    aac: "audio/aac",
    flac: "audio/flac",
    m4a: "audio/mp4",
    mp3: "audio/mpeg",
    mp4: "audio/mp4",
    mpeg: "audio/mpeg",
    mpga: "audio/mpeg",
    ogg: "audio/ogg",
    wav: "audio/wav",
    webm: "audio/webm",
  };
  return types[extension.toLowerCase()] ?? "application/octet-stream";
}

export function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

export function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

export function removeAudioReferences(
  content: string,
  audioFile: { path: string; name: string },
): string {
  const targets = [audioFile.path, audioFile.name]
    .map(escapeRegularExpression)
    .join("|");
  const encodedTargets = [encodeURI(audioFile.path), encodeURI(audioFile.name)]
    .map(escapeRegularExpression)
    .join("|");
  const wikiEmbed = new RegExp(
    `!\\[\\[(?:${targets})(?:\\|[^\\]]*)?\\]\\]`,
    "gu",
  );
  const markdownEmbed = new RegExp(
    `!\\[[^\\]]*\\]\\((?:${targets}|${encodedTargets})(?:\\s+"[^"]*")?\\)`,
    "gu",
  );
  return content
    .replace(wikiEmbed, "")
    .replace(markdownEmbed, "")
    .replace(/[ \t]+\n/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n");
}

export function getValueAtPath(value: unknown, path: string): unknown {
  return path
    .split(".")
    .filter(Boolean)
    .reduce<unknown>((current, key) => {
      if (!current || typeof current !== "object") return undefined;
      return (current as Record<string, unknown>)[key];
    }, value);
}
