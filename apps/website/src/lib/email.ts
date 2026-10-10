interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  const apiKey = Deno.env.get("RESEND_API_KEY")?.trim();
  const from = Deno.env.get("RESEND_FROM_EMAIL")?.trim();
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

export async function sendPasscode(email: string, code: string, role: "customer" | "admin") {
  const destination = role === "admin" ? "the Writasaurus administration console" : "your account";
  const safeCode = escapeHtml(code);
  await sendEmail({
    to: email,
    subject: `Your Writasaurus sign-in code`,
    text:
      `Your code for ${destination} is ${code}. It expires in 10 minutes. If you did not request it, you can ignore this email.`,
    html: `<p>Your code for ${
      escapeHtml(destination)
    } is <strong>${safeCode}</strong>.</p><p>It expires in 10 minutes. If you did not request it, you can ignore this email.</p>`,
  });
}

export async function sendPurchaseEmail(
  email: string,
  licenseKey: string,
  amountTotal: number,
  currency: string,
): Promise<void> {
  const origin = Deno.env.get("PUBLIC_SITE_URL")?.replace(/\/+$/, "");
  if (!origin || !/^https:\/\//.test(origin)) {
    throw new Error("PUBLIC_SITE_URL must be configured as an HTTPS URL.");
  }
  const safeKey = escapeHtml(licenseKey);
  const price = `${(amountTotal / 100).toFixed(2)} ${currency.toUpperCase()}`;
  const accountUrl = `${origin}/account`;
  const termsUrl = `${origin}/agreement`;
  await sendEmail({
    to: email,
    subject: "Your Writasaurus purchase",
    text:
      `Thank you for purchasing Writasaurus for ${price}.\n\nYour license key is: ${licenseKey}\n\nEnter it the first time you open the desktop app. You can see your receipt and request this key again at ${accountUrl}.\n\nYou may request a full refund within 7 days of purchase. See the terms: ${termsUrl}`,
    html: `<p>Thank you for purchasing Writasaurus for <strong>${
      escapeHtml(price)
    }</strong>.</p><p>Your license key is <code>${safeKey}</code>. Enter it the first time you open the desktop app.</p><p><a href="${
      escapeHtml(accountUrl)
    }">Sign in to view your receipt, re-email your key, and access downloads.</a></p><p>You may request a full refund within 7 days of purchase. <a href="${
      escapeHtml(termsUrl)
    }">Review the terms and conditions</a>.</p>`,
  });
}
