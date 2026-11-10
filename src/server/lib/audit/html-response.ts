import type { Response as BrowserResponse } from "@cloudflare/workers-types";

export const MAX_HTML_BYTES = 1024 * 1024;

export async function readTextUpTo(
  response: Response | BrowserResponse,
  maxBytes: number,
) {
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parts: string[] = [];
  let bytesRead = 0;

  try {
    while (bytesRead < maxBytes) {
      const result = await reader.read();
      if (result.done) break;
      const value: unknown = result.value;
      if (!(value instanceof Uint8Array))
        throw new Error("Expected response bytes");

      const remaining = maxBytes - bytesRead;
      const chunk =
        value.byteLength > remaining ? value.subarray(0, remaining) : value;
      bytesRead += chunk.byteLength;
      parts.push(decoder.decode(chunk, { stream: true }));

      if (bytesRead >= maxBytes) {
        await reader.cancel();
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }

  parts.push(decoder.decode());
  return parts.join("");
}

/**
 * Whether a body read through `readTextUpTo` stopped at the byte cap. Its
 * length counts UTF-16 units, so a non-ASCII body can sit far under the cap in
 * characters while hitting it in bytes; UTF-8 needs at most 3 bytes per unit,
 * so only a body of at least a third of the cap in units can have reached it.
 * A cut through a multi-byte character decodes to U+FFFD, which re-encodes to
 * at least the bytes it replaced.
 */
export function reachedByteCap(text: string, maxBytes: number) {
  return (
    text.length * 3 >= maxBytes &&
    new TextEncoder().encode(text).length >= maxBytes
  );
}

/** The first `maxBytes` of `text` as UTF-8, as readTextUpTo keeps from a body. */
export function truncateToBytes(text: string, maxBytes: number) {
  const bytes = new TextEncoder().encode(text);
  return bytes.length <= maxBytes
    ? text
    : new TextDecoder().decode(bytes.subarray(0, maxBytes));
}

/** Read a response body up to maxBytes; null when the body exceeds it. */
export async function readBodyCapped(
  response: Response,
  maxBytes: number,
): Promise<string | null> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(joined);
}
