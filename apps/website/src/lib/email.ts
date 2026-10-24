import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { env } from "node:process";

interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  if (env.NODE_ENV !== "production") {
    const logPath = process.env.EMAIL_LOG_FILE?.trim() || ".data/emails.jsonl";
    await mkdir(dirname(logPath), { recursive: true });
    await appendFile(
      logPath,
      `${JSON.stringify({ sentAt: new Date().toISOString(), ...message })}\n`,
    );
    console.info(`Development email written to ${logPath}`);
    return;
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!apiKey || !from) throw new Error("Resend email is not configured.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
    }),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    const code = typeof result?.name === "string" ? result.name : response.status;
    throw new Error(`Resend email delivery failed (${code}).`);
  }
}

export async function sendPasscode(email: string, code: string): Promise<void> {
  const safeCode = escapeHtml(code);
  await sendEmail({
    to: email,
    subject: "Your Writasaurus sign-in code",
    text: `Your Writasaurus sign-in code is ${code}. It expires in 10 minutes. If you did not request it, you can ignore this email.`,
    html: `<p>Your Writasaurus sign-in code is <strong>${safeCode}</strong>.</p><p>It expires in 10 minutes. If you did not request it, you can ignore this email.</p>`,
  });
}
