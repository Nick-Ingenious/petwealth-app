import { DROP_OFF_WITHIN_DAYS, PANEL_LABEL, type Panel } from "@petwealth/domain";
import type { EmailAttachment } from "@petwealth/integrations/email";
import { button, escapeHtml, FONT, layout, paragraph, stepList } from "./layout";

export type ReturnLabelReadyData = {
  firstName: string | null;
  kits: { code: string; petName: string | null; panel: Panel }[];
  rmaNumber: string;
  label: { format: "qr_png" | "pdf"; mimeType: string; contentBase64: string } | null;
  /** Link to the kit page in the portal (sign-in required). */
  kitUrl: string;
};

/** "Biscuit's Fecal and Oral tests", or "Biscuit's Fecal test and Mochi's Oral test". */
export function describeKits(kits: ReturnLabelReadyData["kits"]): string {
  const byPet = new Map<string, string[]>();
  for (const k of kits) {
    const pet = k.petName ?? "";
    byPet.set(pet, [...(byPet.get(pet) ?? []), PANEL_LABEL[k.panel]]);
  }
  const join = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
  return join([...byPet].map(([pet, panels]) => `${pet ? `${pet}'s` : "your pet's"} ${join(panels)} test${panels.length > 1 ? "s" : ""}`));
}

/** "Your FedEx code is ready": sent once the return QR code (or printable label) exists. */
export function returnLabelReadyEmail(d: ReturnLabelReadyData): { subject: string; html: string; text: string; attachments: EmailAttachment[] } {
  const pdf = d.label?.format === "pdf";
  const what = describeKits(d.kits);
  const hi = d.firstName ? `Hi ${d.firstName},` : "Hi,";
  const subject = pdf ? "Your FedEx return label is ready" : "Your FedEx code is ready";
  const intro = `${hi} this ${pdf ? "label" : "code"} sends ${what} back to our lab in one mailer.`;
  const dropOff = pdf
    ? `Drop it off at any FedEx location within ${DROP_OFF_WITHIN_DAYS} days of collecting.`
    : `Take it to a FedEx counter within ${DROP_OFF_WITHIN_DAYS} days of collecting and show this code. They print the label and stick it on, so you don't need a printer. Drop boxes can't print labels.`;
  const steps = [
    "Collect the sample as shown in your booklet.",
    "Seal the specimen bag inside the white bubble mailer.",
    pdf ? `Print the attached label and tape it to the mailer. ${dropOff}` : dropOff,
  ];
  const results = "Results appear in your Petwealth dashboard, usually within 24 to 48 hours of the lab receiving your kit.";

  const attachments: EmailAttachment[] = [];
  let codeBlock = "";
  if (d.label && !pdf) {
    attachments.push({ filename: `fedex-code-${d.rmaNumber}.png`, contentBase64: d.label.contentBase64, contentType: d.label.mimeType, contentId: "fedex-code" });
    codeBlock = `
      <tr><td align="center" style="padding:8px 0 4px">
        <table role="presentation" cellpadding="0" cellspacing="0" style="border:2px dashed #CAB3FF;border-radius:24px;background:#ffffff">
          <tr><td align="center" style="padding:20px">
            <img src="cid:fedex-code" width="220" height="220" alt="FedEx return code ${escapeHtml(d.rmaNumber)}" style="display:block;width:220px;height:220px;border:0">
            <p style="margin:8px 0 0;font-family:${FONT};font-size:13px;line-height:18px;color:#52525b">RMA Number: ${escapeHtml(d.rmaNumber)}</p>
          </td></tr>
        </table>
      </td></tr>`;
  } else if (d.label && pdf) {
    attachments.push({ filename: `fedex-label-${d.rmaNumber}.pdf`, contentBase64: d.label.contentBase64, contentType: d.label.mimeType });
  }

  const html = layout({
    preheader: pdf ? "Print the attached label and drop it at FedEx." : "Show it at any FedEx counter. No printer needed.",
    eyebrow: "Ready to ship",
    headline: subject,
    body: `
      ${paragraph(escapeHtml(intro))}
      ${codeBlock}
      ${paragraph('<strong style="color:#1b2330">How to send it back</strong>', "16px 0 8px")}
      ${stepList(steps.map(escapeHtml))}
      ${button("Open your kit in the app", d.kitUrl)}
      ${paragraph(escapeHtml(results), "20px 0 0", "14px", "#71717a")}`,
  });

  const text = [
    subject,
    "",
    intro,
    "",
    pdf ? "Your label is attached." : `Your code is attached (RMA Number: ${d.rmaNumber}).`,
    "",
    "How to send it back:",
    ...steps.map((s, i) => `${i + 1}. ${s}`),
    "",
    `Open your kit in the app: ${d.kitUrl}`,
    "",
    results,
  ].join("\n");

  return { subject, html, text, attachments };
}
