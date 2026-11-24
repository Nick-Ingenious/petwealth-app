import type { Panel } from "@petwealth/domain";

/**
 * Illustrated collection steps, copied from the printed booklet (IFU v3) as the
 * old app showed them. The booklet in the kit is the source of truth; these
 * mirror it panel by panel. Illustrations live in /public/ifu.
 */
export type InstructionRow = {
  /** File name in /public/ifu, without extension. */
  image: string;
  alt: string;
  /** Booklet sub-heading shown above this row (e.g. "Option A: Swab Nostrils"). */
  subhead?: string;
  text: React.ReactNode;
};

const gloves: InstructionRow = {
  image: "prep-gloves",
  alt: "Pulling on a pair of gloves",
  subhead: "Preparation",
  text: "Put on both gloves before handling the collection materials.",
};

const writeDate = (prefix: string): InstructionRow => ({
  image: `${prefix}-write-date`,
  alt: "Writing the date on the tube label",
  text: (
    <>
      Write <strong>today&apos;s date</strong> on the blank line of the tube label.
    </>
  ),
});

const openSwabPouch = (prefix: string): InstructionRow => ({
  image: `${prefix}-open-swab-pouch`,
  alt: "Peeling open the swab pouch",
  subhead: "Collecting the sample",
  text: (
    <>
      Open the swab pouch from the end opposite the tip. Hold the handle and <strong>never touch the tip</strong>.
    </>
  ),
});

const breakSwab = (prefix: string): InstructionRow => ({
  image: `${prefix}-insert-break-swab`,
  alt: "Breaking the swab shaft at the perforated breakpoint",
  subhead: "Securing the sample",
  text: (
    <>
      Place the swab tip into the tube, then break the swab shaft at the <strong>perforated breakpoint</strong>. Make sure the tip stays
      inside, and cap securely.
    </>
  ),
});

const sealSpecimenBag: InstructionRow = {
  image: "seal-specimen-bag",
  alt: "Sealing the collection tube inside the specimen bag",
  text: (
    <>
      Make sure the cap is securely fastened. Place the tube into the provided <strong>specimen bag</strong> and seal the bag completely.
    </>
  ),
};

export const COLLECT: Record<Panel, { title: string; intro?: string; rows: InstructionRow[] }> = {
  fecal: {
    title: "Fecal Health Test",
    intro: "Use a fresh sample, collected within a few hours.",
    rows: [
      gloves,
      writeDate("fec"),
      {
        image: "fec-open-tube",
        alt: "Twisting the scoop cap off the collection tube",
        text: (
          <>
            Twist off the cap with the <strong>scoop attached</strong>. Keep the tube upright to avoid spills.
          </>
        ),
      },
      {
        image: "fec-scoop-sample",
        alt: "Scooping a small stool sample",
        subhead: "Collecting the sample",
        text: (
          <>
            <strong>Use the built-in scoop to collect about half a scoop of solid or semi-solid stool</strong>{" "}
            <span className="text-zinc-500">(about the size of a pea).</span>
          </>
        ),
      },
      {
        image: "fec-liquid-stool-swab",
        alt: "Using the sterile swab for liquid stool",
        subhead: "Tips for collecting liquid stool",
        text: <strong>If your pet&apos;s stool is liquid, use the provided sterile swab instead of the scoop.</strong>,
      },
      {
        image: "fec-avoid-overfill",
        alt: "Collection tube that is not overfilled",
        text: (
          <>
            <strong className="uppercase text-pink-700">Avoid</strong> overfilling the tube, and keep out soil, grass, litter and urine.
          </>
        ),
      },
      {
        image: "fec-secure-scoop-cap",
        alt: "Twisting the scoop cap back into the collection tube",
        subhead: "Securing the sample",
        text: (
          <>
            Right after collecting, put the <strong>scoop cap</strong> back into the tube and gently twist until it is securely tightened.
          </>
        ),
      },
      sealSpecimenBag,
    ],
  },
  respiratory: {
    title: "Respiratory Health Test",
    intro:
      "Nasal swab collection is recommended when feasible, as it may provide a more representative sample. Collect any nasal discharge on the swab.",
    rows: [
      gloves,
      writeDate("res"),
      { image: "res-open-tube", alt: "Twisting the cap off the collection tube", text: "Twist off the cap. Keep the tube upright to avoid spills." },
      openSwabPouch("res"),
      {
        image: "res-swab-nostril",
        alt: "Swabbing inside a nostril",
        subhead: "Option A: Swab Nostrils",
        text: "Gently insert the swab tip into one nostril for 5 seconds. Stop if you feel any resistance. Rub the inside of the nostril, making contact with the walls.",
      },
      {
        image: "res-open-mouth",
        alt: "Lifting the lip to open the mouth",
        subhead: "Option B: Swab the Cheeks",
        text: "Gently lift your pet's lip and open their mouth. Carefully place the swab inside your pet's cheek.",
      },
      {
        image: "res-rub-cheek",
        alt: "Rubbing the swab along the inside cheek",
        text: (
          <>
            Firmly rub the swab along the inside cheek for about <strong>15 seconds</strong>, rotating it to collect as much sample as possible.
          </>
        ),
      },
      breakSwab("res"),
      sealSpecimenBag,
    ],
  },
  oral: {
    title: "Oral Health Test",
    intro: "Collect before your pet eats or drinks, if possible.",
    rows: [
      gloves,
      writeDate("ora"),
      { image: "ora-open-tube", alt: "Twisting the cap off the collection tube", text: "Twist off the cap. Keep the tube upright to avoid spills." },
      openSwabPouch("ora"),
      {
        image: "ora-lift-lip",
        alt: "Lifting the lip to show the gum line",
        text: (
          <>
            Lift your pet&apos;s lip to expose the <strong>outer gum line</strong> (where the teeth and gums meet).
          </>
        ),
      },
      {
        image: "ora-swab-gumline",
        alt: "Swabbing along the outer gum line",
        text: (
          <>
            Place the swab on the outer gum line, <strong>not the tongue or inner cheeks</strong>. <strong>Swab for 10 seconds</strong>,
            moving back and forth while rotating the swab in small circles.
          </>
        ),
      },
      breakSwab("ora"),
      sealSpecimenBag,
    ],
  },
};

/** Packing the mailer (booklet p.17). Same artwork for every panel. */
export const PACK: InstructionRow[] = [
  {
    image: "pack-1-tube-clear-bag",
    alt: "Collection tube sealed inside the clear specimen bag",
    text: "Secure the cap tightly, then seal the clear specimen bag.",
  },
  {
    image: "pack-2-clear-bag-white-mailer",
    alt: "Specimen bag going into the white bubble mailer",
    text: (
      <>
        Place the sealed specimen bag inside, then seal the <strong>white bubble mailer</strong>.
      </>
    ),
  },
];
