import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// Preserve the existing vault format: nonce (12 bytes), AES-256-GCM ciphertext, then authentication tag (16 bytes).
// Login and integration stores use separate key files; the envelope is independent of any browser engine.
export function decryptStoredText(data: Buffer, key: string): string {
  if (data.length < 29) throw new Error("Encrypted store is too short.");
  const decipher = createDecipheriv("aes-256-gcm", createHash("sha256").update(key).digest(), data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(data.length - 16));
  return Buffer.concat([decipher.update(data.subarray(12, data.length - 16)), decipher.final()]).toString("utf8");
}

export function encryptStoredText(text: string, key: string): Buffer {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", createHash("sha256").update(key).digest(), nonce);
  const body = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  return Buffer.concat([nonce, body, cipher.getAuthTag()]);
}
