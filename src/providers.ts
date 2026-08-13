import { requestUrl } from "obsidian";
import { PROVIDERS } from "./constants";
import type { ProviderId, TranscriptionRequestInput } from "./types";
import {
  audioMimeType,
  concatBytes,
  getValueAtPath,
  normalizeTranscript,
} from "./utils";

export function buildMultipart(
  input: Pick<
    TranscriptionRequestInput,
    "audio" | "extension" | "fileName" | "language" | "model"
  >,
  suppliedBoundary?: string,
): { body: ArrayBuffer; contentType: string } {
  const encoder = new TextEncoder();
  const boundary =
    suppliedBoundary ??
    `----Dictation${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  const safeName = input.fileName.replace(/["\r\n]/gu, "_");
  const chunks: Uint8Array[] = [];
  const add = (value: string) => chunks.push(encoder.encode(value));
  add(
    `--${boundary}\r\n` +
      'Content-Disposition: form-data; name="model"\r\n\r\n' +
      `${input.model}\r\n`,
  );
  if (input.language && input.language !== "auto") {
    add(
      `--${boundary}\r\n` +
        'Content-Disposition: form-data; name="language"\r\n\r\n' +
        `${input.language}\r\n`,
    );
  }
  add(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="file"; filename="${safeName}"\r\n` +
      `Content-Type: ${audioMimeType(input.extension)}\r\n\r\n`,
  );
  chunks.push(new Uint8Array(input.audio));
  add(`\r\n--${boundary}--\r\n`);
  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    body: concatBytes(chunks).buffer as ArrayBuffer,
  };
}

export function buildDeepgramUrl(endpoint: string, model: string, language: string): string {
  const url = new URL(endpoint);
  url.searchParams.set("model", model);
  url.searchParams.set("smart_format", "true");
  url.searchParams.set("punctuate", "true");
  if (!language || language === "auto") url.searchParams.set("detect_language", "true");
  else url.searchParams.set("language", language);
  return url.toString();
}

export function extractTranscript(
  provider: ProviderId,
  responseJson: unknown,
  customResponsePath = "text",
): string {
  const value =
    provider === "deepgram"
      ? getValueAtPath(responseJson, "results.channels.0.alternatives.0.transcript")
      : provider === "custom"
        ? getValueAtPath(responseJson, customResponsePath)
        : getValueAtPath(responseJson, "text");
  return normalizeTranscript(value);
}

export async function requestTranscription(
  input: TranscriptionRequestInput,
): Promise<string> {
  const headers: Record<string, string> = {};
  let url = input.endpoint;
  let body: ArrayBuffer;
  if (input.provider === "deepgram") {
    url = buildDeepgramUrl(input.endpoint, input.model, input.language);
    headers.Authorization = `Token ${input.secret}`;
    headers["Content-Type"] = audioMimeType(input.extension);
    body = input.audio;
  } else {
    const multipart = buildMultipart(input);
    headers["Content-Type"] = multipart.contentType;
    if (input.provider !== "custom" || input.customAuthScheme !== "none") {
      const scheme =
        input.provider === "custom" && input.customAuthScheme === "token"
          ? "Token"
          : "Bearer";
      headers.Authorization = `${scheme} ${input.secret}`;
    }
    body = multipart.body;
  }
  const response = await requestUrl({
    url,
    method: "POST",
    headers,
    body,
    throw: false,
  });
  if (response.status < 200 || response.status >= 300) {
    const json = response.json as { error?: { message?: string } } | undefined;
    const detail = json?.error?.message || response.text?.slice(0, 500) || `HTTP ${response.status}`;
    throw new Error(`The transcription service rejected the request: ${detail}`);
  }
  const transcript = extractTranscript(
    input.provider,
    response.json,
    input.customResponsePath,
  );
  if (!transcript) throw new Error("The transcription response contained no text.");
  return transcript;
}

export function providerEndpoint(provider: ProviderId, customEndpoint: string): string {
  return provider === "custom" ? customEndpoint.trim() : PROVIDERS[provider]!.endpoint;
}
