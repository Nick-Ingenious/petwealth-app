/**
 * Words and small rules for the results screen, carried over from the old
 * app's report (petwell-frontend TestReportPage + PetwealthMobileApp
 * utils/report.ts) so customers see the same report after the switch.
 */
import type { Panel, Species } from "@petwealth/domain";

export const PAWP_URL = "https://app.pawp.com/partner/petwealth/otp/";
export const STORE_URL = "https://petwealth.com";
export const SUPPORT_EMAIL = "support@petwealth.com";
export const RETEST_MONTHS = 6;

export const PANEL_TITLE: Record<Panel, string> = { fecal: "Fecal", oral: "Oral", respiratory: "Respiratory" };

export const SPECIMEN: Record<Panel, string> = {
  fecal: "Fresh stool",
  oral: "Subgingival plaque",
  respiratory: "Deep pharyngeal and nasal swab",
};

/** "Suki" stays, "Mr. Whiskers III" becomes "Mr. Whiske…". */
export const truncName = (name: string, max = 10) => (name.length > max ? `${name.slice(0, max)}…` : name);

export function heroTitle(clean: boolean, petName: string | null) {
  const pet = petName ? truncName(petName) : "Your pet";
  return clean ? `${pet}'s results came back clear.` : `${pet}'s results need a closer look.`;
}

/** First sentence on its own, then the rest (the old report breaks the line there). */
export function heroBody(clean: boolean, detected: number, petName: string | null): [string, string] {
  const pet = petName ?? "your pet";
  if (clean) {
    return [
      "No pathogens were detected at the time of testing.",
      `A clean result is reassuring, but it can't completely rule out illness. If ${pet} develops severe or persistent symptoms, contact your veterinarian or a tele-vet service like Pawp; otherwise, keep up the great care and retest in ${RETEST_MONTHS} months.`,
    ];
  }
  return [
    `We detected ${detected} pathogen${detected === 1 ? "" : "s"} in ${pet}'s sample.`,
    `A detection on its own doesn't diagnose illness, so it's best interpreted alongside how ${pet} is feeling. If ${pet} is showing any symptoms, consider reaching out to your veterinarian or a tele-vet service like Pawp, and review the full breakdown below.`,
  ];
}

export const heroButton = (clean: boolean) => (clean ? "Discuss prevention with a vet" : "Talk to a vet now");

export const CLINICAL_SIGNS =
  "All test results should be evaluated in light of your pet's clinical signs. If your pet is currently ill and this test is positive, contact your veterinarian. If your pet has no symptoms, share these results with your vet at your next visit.";

export const CT_EXPLAINER =
  "CT values reflect how much genetic material was detected. Lower values indicate higher biological presence. Scale: 15 (high load) → 40 (not detected).";

export const STORY_BODY =
  "Petwealth health reports are clinically translated by Petwealth. This test should not replace professional veterinary diagnosis.";

export const DISCLAIMER =
  "These results are for informational purposes only and do not replace medical advice from a licensed veterinarian.";

export function whyWeRan(species: Species, panel: Panel, total: number, petName: string | null): string {
  const pet = petName ? truncName(petName) : "your pet";
  const dog = species === "dog";
  switch (panel) {
    case "respiratory":
      return dog
        ? `Respiratory infections spread rapidly between dogs, especially in kennels, dog parks, and grooming facilities. Many of the most contagious pathogens - including Bordetella and Canine Distemper - can be present and spreading before any symptoms appear. This PCR panel tests for ${total} of the most clinically significant respiratory pathogens at the DNA level, giving you a clear picture of ${pet}'s respiratory health so you can act before symptoms worsen.`
        : `Upper respiratory infections spread rapidly between cats, especially in multi-cat households, shelters, and boarding facilities. Many of the most contagious pathogens - including feline herpesvirus and calicivirus - can be present and spreading before any symptoms appear, and cats that recover often remain lifelong carriers. This PCR panel tests for ${total} of the most clinically significant respiratory pathogens at the DNA level, giving you a clear picture of ${pet}'s respiratory health so you can act before symptoms worsen.`;
    case "fecal":
      return dog
        ? `Intestinal pathogens are a leading cause of digestive illness in dogs and can be present for weeks before causing obvious symptoms. Some - like Giardia and Salmonella - can also be transmitted to humans in the household. This PCR panel tests for ${total} of the most common and clinically significant GI pathogens at the DNA level, giving you a clear picture of ${pet}'s gut health and identifying any imbalances before they become harder to treat.`
        : `Intestinal pathogens are a leading cause of digestive illness in cats and can be present for weeks before causing obvious symptoms. Some - like Giardia, Salmonella, and Toxoplasma - can also be transmitted to humans in the household. This PCR panel tests for ${total} of the most common and clinically significant GI pathogens at the DNA level, giving you a clear picture of ${pet}'s gut health and identifying any imbalances before they become harder to treat.`;
    case "oral":
      return dog
        ? `Periodontal disease is the most common health condition in dogs - affecting over 80% of dogs over age 3. Most pet owners never know it's developing because symptoms don't appear until the disease is advanced. This test detects the ${total} bacterial species most closely linked to gum disease at the DNA level, before symptoms appear. Early detection means simpler treatment, lower cost, and a better outcome for ${pet}.`
        : `Periodontal disease is the most common health condition in cats - affecting the majority of cats by age 3. Most pet owners never know it's developing because symptoms don't appear until the disease is advanced. This test detects the ${total} bacterial species most closely linked to gum disease at the DNA level, before symptoms appear. Early detection means simpler treatment, lower cost, and a better outcome for ${pet}.`;
  }
}

export const EMERGENCY_SIGNS: Record<Panel, string[]> = {
  oral: [
    "Persistent bad breath despite brushing",
    "Swollen, bleeding, or inflamed gums",
    "Difficulty eating or pain while chewing",
    "Excessive drooling or pawing at mouth",
  ],
  respiratory: [
    "Difficulty breathing or rapid breathing",
    "Persistent or worsening cough",
    "Nasal discharge or fever",
    "Lethargy or reduced appetite",
  ],
  fecal: [
    "Persistent or bloody diarrhea",
    "Vomiting more than once in 24 hours",
    "Extreme lethargy or collapse",
    "Pale or white gums (sign of shock)",
  ],
};

/** Care tab "Signs to Watch for" (mild band; we don't score results yet). */
export const SIGNS_TO_WATCH: Record<Panel, { title: string; body: string }[]> = {
  respiratory: [
    { title: "Persistent cough lasting more than 5 days", body: "A cough that doesn't improve may need treatment." },
    { title: "Difficulty breathing or wheezing", body: "Labored breathing warrants a vet visit." },
    { title: "Nasal discharge that turns thick or colored", body: "May indicate secondary bacterial infection." },
  ],
  fecal: [
    { title: "Persistent diarrhea", body: "Soft or liquid stool lasting more than 48 hours needs attention." },
    { title: "Vomiting or loss of appetite", body: "May indicate worsening GI distress." },
    { title: "Blood or mucus in stool", body: "Any blood in stool warrants a vet visit." },
  ],
  oral: [
    { title: "Bad breath that persists", body: 'Occasional "dog breath" is normal, but persistent foul odor warrants a check.' },
    { title: "Red or swollen gums", body: "Healthy gums should be pink and firm." },
    { title: "Changes in eating habits", body: "Reluctance to chew or dropping food may indicate discomfort." },
  ],
};

export const CAN_PRESCRIBE: Record<Panel, string> = {
  respiratory: "Antibiotics and cough support.",
  fecal: "Dewormers and GI support.",
  oral: "Dental rinses and antimicrobials.",
};

/** First sentence: up to the first . ! or ? followed by a space or the end. */
export function firstSentence(text: string | null): string | null {
  if (!text) return null;
  const m = /^.*?[.!?](?=\s|$)/s.exec(text.trim());
  return m ? m[0] : text.trim();
}

/** "1y 5m", "7m", "3y". */
export function formatAge(dob: string | null, now = new Date()): string | null {
  if (!dob) return null;
  const [y, m, d] = dob.split("-").map(Number) as [number, number, number];
  let months = (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m);
  if (now.getDate() < d) months--;
  if (months < 0) return null;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (!years) return rest ? `${rest}m` : "<1m";
  return rest ? `${years}y ${rest}m` : `${years}y`;
}

export const formatWeight = (lbs: number | null) => (lbs == null ? null : `${Number.isInteger(lbs) ? lbs : lbs.toFixed(1)}lbs`);
export const formatSex = (sex: string | null) => (sex === "male" ? "M" : sex === "female" ? "F" : null);

/** Months left until the 6-month retest, and the month it falls in. */
export function nextTest(base: Date, now = new Date()) {
  let elapsed = (now.getFullYear() - base.getFullYear()) * 12 + (now.getMonth() - base.getMonth());
  if (now.getDate() < base.getDate()) elapsed--;
  const months = Math.max(0, RETEST_MONTHS - Math.max(0, elapsed));
  const due = new Date(base);
  due.setMonth(due.getMonth() + RETEST_MONTHS);
  return { months, label: due.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "America/New_York" }) };
}
