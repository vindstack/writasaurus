function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

const generatedKeys = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
if (!("privateKey" in generatedKeys)) throw new Error("Ed25519 key generation failed.");
const signingKeys = generatedKeys;
const privateKey = new Uint8Array(await crypto.subtle.exportKey("pkcs8", signingKeys.privateKey));
const publicKey = new Uint8Array(await crypto.subtle.exportKey("raw", signingKeys.publicKey));
const encryptionKey = crypto.getRandomValues(new Uint8Array(32));
const sessionSecret = crypto.getRandomValues(new Uint8Array(48));

console.log("Store private values only in the website's secret manager.");
console.log(`LICENSE_SIGNING_PRIVATE_KEY=${encodeBase64Url(privateKey)}`);
console.log(`PUBLIC_LICENSE_SIGNING_PUBLIC_KEY=${encodeBase64Url(publicKey)}`);
console.log(`LICENSE_ENCRYPTION_KEY=${encodeBase64Url(encryptionKey)}`);
console.log(`SESSION_SECRET=${encodeBase64Url(sessionSecret)}`);
