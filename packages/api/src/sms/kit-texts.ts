/**
 * Customer text messages. Short (one SMS segment where we can), plain, in
 * Petwealth's calm voice, always ending with how to opt out. Same moments as
 * the emails: sample on its way, at the lab, results ready, and the
 * mail-your-sample reminder.
 */
export const SMS_TEMPLATES = ["kit_in_transit", "kit_received", "results_ready", "mail_sample_reminder"] as const;
export type SmsTemplate = (typeof SMS_TEMPLATES)[number];

export type KitTextData = {
  /** The kits this text is about (one mailer, or kits that changed together). */
  kits: { petName: string | null }[];
  /** Link to the kit in the app. */
  url: string;
  /** Reminder only: the mailer has a printed label rather than a QR code. */
  printedLabel?: boolean;
};

export const STOP_FOOTER = "Reply STOP to opt out.";

const join = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

/**
 * "Biscuit's", "Biscuit's and Mochi's", or null when we don't have every
 * pet's name yet (we often don't until the test is done) or there are many.
 */
function petsPossessive(kits: KitTextData["kits"]): string | null {
  const names = kits.map((k) => k.petName?.trim() ?? "");
  if (!names.length || names.some((n) => !n)) return null;
  const unique = [...new Set(names)];
  return unique.length > 2 ? null : join(unique.map((n) => `${n}'s`));
}

export function kitText(template: SmsTemplate, d: KitTextData): string {
  const several = d.kits.length > 1;
  const pets = petsPossessive(d.kits);
  const samples = `${pets ?? "Your"} sample${several ? "s" : ""}`;
  let body: string;
  switch (template) {
    case "kit_in_transit":
      body = `${samples} ${several ? "are" : "is"} on the way to our lab. We'll text you when ${several ? "they arrive" : "it arrives"}. ${d.url}`;
      break;
    case "kit_received":
      body = `${samples} reached our lab. Results usually take 24 to 48 hours. ${d.url}`;
      break;
    case "results_ready":
      body = `${pets ?? "Your"} results are ready. See them in the app: ${d.url}`;
      break;
    case "mail_sample_reminder":
      body = `Ready to mail ${pets ? `${pets} sample${several ? "s" : ""}` : `your sample${several ? "s" : ""}`}? Your FedEx ${d.printedLabel ? "label" : "code"} is in the app: ${d.url}`;
      break;
  }
  return `Petwealth: ${body} ${STOP_FOOTER}`;
}
