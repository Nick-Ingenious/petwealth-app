/**
 * Emails sent as kits move through the lab: on the way, received, results
 * ready. One email can cover several kits that changed together.
 */
import type { NotificationTemplate, Panel } from "@petwealth/domain";
import { button, escapeHtml, layout, paragraph } from "./layout";
import { describeKits } from "./return-label-ready";

export type KitStatusEmailData = {
  firstName: string | null;
  kits: { code: string; petName: string | null; panel: Panel }[];
  /** Link to the (first) kit in the portal. */
  kitUrl: string;
  /** Return mailer tracking number, for the "on the way" email. */
  trackingNumber?: string | null;
};

const TURNAROUND = "Results usually appear in your Petwealth dashboard within 24 to 48 hours of the lab receiving your sample.";

/** One pet's name, or null when the kits belong to several pets or none is named. */
function onePet(kits: KitStatusEmailData["kits"]): string | null {
  const pets = [...new Set(kits.map((k) => k.petName ?? ""))];
  return pets.length === 1 && pets[0] ? pets[0] : null;
}

/** "Biscuit's sample", "Biscuit's samples", "Your samples", "Your pet's sample". */
function sampleNoun(kits: KitStatusEmailData["kits"]): string {
  const pet = onePet(kits);
  const distinctPets = new Set(kits.map((k) => k.petName ?? "")).size;
  const owner = pet ? `${pet}'s` : distinctPets > 1 ? "Your" : "Your pet's";
  return `${owner} sample${kits.length > 1 ? "s" : ""}`;
}

export function fedexTrackingUrl(trackingNumber: string): string {
  return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(trackingNumber)}`;
}

export function kitStatusEmail(template: NotificationTemplate, d: KitStatusEmailData): { subject: string; html: string; text: string } {
  const hi = d.firstName ? `Hi ${d.firstName},` : "Hi,";
  const what = describeKits(d.kits);
  const verb = d.kits.length > 1 ? "are" : "is";
  const pet = onePet(d.kits);
  const kitCta = { label: d.kits.length > 1 ? "Open your kits in the app" : "Open your kit in the app", href: d.kitUrl };

  let subject: string, eyebrow: string, preheader: string, lines: string[], cta: { label: string; href: string };
  let footnote: string | null = TURNAROUND;
  let tracking: string | null = null;

  switch (template) {
    case "kit_in_transit":
      subject = `${sampleNoun(d.kits)} ${verb} on the way to our lab`;
      eyebrow = "On the way";
      preheader = "FedEx has your mailer. We'll email you when the lab checks it in.";
      lines = [`${hi} FedEx picked up the mailer with ${what}. It's on its way to our lab.`, "We'll email you as soon as the lab checks it in."];
      tracking = d.trackingNumber ?? null;
      cta = tracking ? { label: "Track your mailer", href: fedexTrackingUrl(tracking) } : kitCta;
      break;
    case "kit_received":
      subject = `${sampleNoun(d.kits)} ${verb} at our lab`;
      eyebrow = "At the lab";
      preheader = "Our lab has checked it in and will start testing right away.";
      lines = [`${hi} our lab has received ${what} and will start testing right away.`, `We'll email you when ${pet ?? "your pet"}'s results are ready.`];
      cta = kitCta;
      break;
    case "results_ready":
      subject = `${pet ?? "Your pet"}'s results are ready`;
      eyebrow = "Results ready";
      preheader = `See ${pet ?? "your pet"}'s report in the Petwealth app.`;
      lines = [`${hi} the results from ${what} are ready.`, "Open the app to see the full report."];
      cta = { label: pet && d.kits.length === 1 ? `See ${pet}'s results` : "See the results", href: d.kitUrl };
      footnote = null;
      break;
  }

  const html = layout({
    preheader,
    eyebrow,
    headline: subject,
    body: `
      ${lines.map((l) => paragraph(escapeHtml(l))).join("")}
      ${tracking ? paragraph(`FedEx tracking number: <strong style="color:#1b2330">${escapeHtml(tracking)}</strong>`, "0 0 12px", "14px", "#52525b") : ""}
      ${button(cta.label, cta.href)}
      ${footnote ? paragraph(escapeHtml(footnote), "20px 0 0", "14px", "#71717a") : ""}`,
  });

  const text = [
    subject,
    "",
    ...lines.flatMap((l) => [l, ""]),
    ...(tracking ? [`FedEx tracking number: ${tracking}`, ""] : []),
    `${cta.label}: ${cta.href}`,
    ...(footnote ? ["", footnote] : []),
  ].join("\n");

  return { subject, html, text };
}
