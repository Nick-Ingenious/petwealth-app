import type { Panel } from "@petwealth/domain";

/**
 * Short on-screen reminders. The printed booklet in the kit is the source of
 * truth for collection technique; these mirror its structure, not replace it.
 */
export const COLLECT: Record<Panel, { title: string; intro: string; steps: string[] }> = {
  fecal: {
    title: "Fecal Health Test",
    intro: "Use a fresh sample, collected within a few hours.",
    steps: [
      "Put on the gloves before handling the collection materials.",
      "Write today's date on the blank line of the tube label.",
      "Collect the sample with the scoop as shown in your booklet.",
      "Close the cap tightly and keep the tube upright.",
      "Place the tube in the specimen bag and seal it completely.",
    ],
  },
  respiratory: {
    title: "Respiratory Health Test",
    intro: "Nasal swab collection is recommended when feasible; a cheek swab also works.",
    steps: [
      "Put on the gloves before handling the collection materials.",
      "Write today's date on the blank line of the tube label.",
      "Open the swab pouch from the end opposite the tip. Never touch the tip.",
      "Swab one nostril gently for about 5 seconds (stop if you feel resistance), or rub firmly inside the cheek for about 15 seconds.",
      "Put the swab tip in the tube, break the shaft at the breakpoint, and cap securely.",
      "Place the tube in the specimen bag and seal it completely.",
    ],
  },
  oral: {
    title: "Oral Health Test",
    intro: "Collect before your pet eats or drinks, if possible.",
    steps: [
      "Put on the gloves before handling the collection materials.",
      "Write today's date on the blank line of the tube label.",
      "Gently lift your pet's lip and swab along the gum line as shown in your booklet.",
      "Put the swab tip in the tube, break the shaft at the breakpoint, and cap securely.",
      "Place the tube in the specimen bag and seal it completely.",
    ],
  },
};
