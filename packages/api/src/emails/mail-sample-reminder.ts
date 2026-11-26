import { DROP_OFF_WITHIN_DAYS, PANEL_LABEL } from "@petwealth/domain";
import type { EmailAttachment } from "@petwealth/integrations/email";
import { button, escapeHtml, layout, paragraph, stepList } from "./layout";
import { describeKits, fedexCodeBlock, type ReturnLabelReadyData } from "./return-label-ready";

export type MailSampleReminderData = ReturnLabelReadyData & {
  /** 1 for the first nudge, 2 for the last one. */
  reminder: 1 | 2;
};

/**
 * "Biscuit's Fecal and Oral tests" when every pet is named. We often don't
 * have the pet's name yet, so if any is missing we leave names out entirely:
 * "your Fecal and Oral tests", "your Fecal tests".
 */
export function describeReminderKits(kits: MailSampleReminderData["kits"]): string {
  if (kits.length && kits.every((k) => k.petName?.trim())) return describeKits(kits);
  const panels = [...new Set(kits.map((k) => PANEL_LABEL[k.panel]))];
  const list = panels.length < 2 ? panels.join("") : `${panels.slice(0, -1).join(", ")} and ${panels.at(-1)}`;
  return `your ${list} test${kits.length > 1 ? "s" : ""}`;
}

/**
 * "Ready to mail your sample?": a gentle nudge when a mailer has its FedEx
 * code but FedEx hasn't picked it up yet. The code (or label) is attached
 * again so the customer has everything in one place.
 */
export function mailSampleReminderEmail(d: MailSampleReminderData): { subject: string; html: string; text: string; attachments: EmailAttachment[] } {
  const pdf = d.label?.format === "pdf";
  const what = describeReminderKits(d.kits);
  const hi = d.firstName ? `Hi ${d.firstName},` : "Hi,";
  const subject = d.reminder === 1 ? "Ready to mail your sample?" : `Your FedEx ${pdf ? "label" : "code"} is still waiting`;
  const intro =
    d.reminder === 1
      ? `${hi} our lab is ready for ${what}. Whenever you're ready to collect the sample, here's all it takes.`
      : `${hi} FedEx hasn't scanned the mailer with ${what} yet. Your ${pdf ? "label" : "code"} is right here whenever you're ready.`;
  const steps = [
    "Collect the sample as shown in your booklet.",
    "Seal the specimen bag inside the white bubble mailer.",
    pdf
      ? `Print the attached label, tape it to the mailer and drop it at any FedEx location within ${DROP_OFF_WITHIN_DAYS} days of collecting.`
      : `Show this code at a FedEx counter within ${DROP_OFF_WITHIN_DAYS} days of collecting. They print the label for you, so no printer needed.`,
  ];
  const alreadySent = "Already dropped it off? Thank you. FedEx can take a day to scan it in, so you can ignore this email.";
  const results = "Results appear in your Petwealth dashboard, usually within 24 to 48 hours of the lab receiving your kit.";

  const attachments: EmailAttachment[] = [];
  let codeBlock = "";
  if (d.label && !pdf) {
    attachments.push({ filename: `fedex-code-${d.rmaNumber}.png`, contentBase64: d.label.contentBase64, contentType: d.label.mimeType, contentId: "fedex-code" });
    codeBlock = fedexCodeBlock(d.rmaNumber);
  } else if (d.label && pdf) {
    attachments.push({ filename: `fedex-label-${d.rmaNumber}.pdf`, contentBase64: d.label.contentBase64, contentType: d.label.mimeType });
  }

  const html = layout({
    preheader: pdf ? "Your FedEx label is attached." : "Your FedEx code is inside. No printer needed.",
    eyebrow: d.reminder === 1 ? "Friendly reminder" : "Still here when you're ready",
    headline: subject,
    body: `
      ${paragraph(escapeHtml(intro))}
      ${paragraph('<strong style="color:#1b2330">How to send it back</strong>', "16px 0 8px")}
      ${stepList(steps.map(escapeHtml))}
      ${codeBlock}
      ${button("Open your kit in the app", d.kitUrl)}
      ${paragraph(escapeHtml(alreadySent), "20px 0 8px", "14px", "#71717a")}
      ${paragraph(escapeHtml(results), "0", "14px", "#71717a")}`,
  });

  const text = [
    subject,
    "",
    intro,
    "",
    "How to send it back:",
    ...steps.map((s, i) => `${i + 1}. ${s}`),
    "",
    pdf ? "Your label is attached." : `Your code is attached (RMA Number: ${d.rmaNumber}).`,
    "",
    `Open your kit in the app: ${d.kitUrl}`,
    "",
    alreadySent,
    results,
  ].join("\n");

  return { subject, html, text, attachments };
}
