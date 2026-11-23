# Copy and claims

Copy that sits on a design has to be accurate, consistent and on-voice. When a fact here disagrees with the live site, check the Shopify product metafield `custom.what_we_test_for` or the Petwealth Product Guide (Google Doc `1J7qQFGtMTZHfUYJkICxewqrOIgawllJ5WgqnKd8ZITQ`) and flag the mismatch rather than guessing.

## Naming

- Products: both forms are correct and we use a mix. The site's product names are **"Dog Fecal Health Kit"**, "Cat Respiratory Health Kit" and so on; the shorter **"Dog Fecal Test"** / "Cat Respiratory Test" works well in headlines, ads, buttons and conversational copy. Species comes first. Within a single piece, introduce the product once by its full name and keep any other mentions consistent.
- Bundle: **"Complete Health Kit"** ("Dog Complete Health Kit", "Cat Complete Health Kit").
- Describe tests by product name (fecal, oral, respiratory), never "gut, breathing, teeth" or "gut health". Describing an actual result ("none of the 4 gum disease bacteria were found") is fine.
- File names: "Dog" / "Cat", not "Canine" / "Feline".
- Shipping: "prepaid return label" (never "prepaid label"). Kits ship back free via FedEx; drop off at 10,000+ FedEx locations including Walgreens.

## Panel facts (as of Nov 2026)

| Kit | Targets | Sample | Lead examples for short copy |
|---|---|---|---|
| Cat Fecal | 27 | One litter box scoop | Giardia, Tritrichomonas, Coccidia, Cryptosporidium, Panleukopenia, feline coronavirus |
| Dog Fecal | 28 | One stool sample | Parvo, Distemper, Giardia, Coccidia, roundworm, hookworm |
| Cat Respiratory | 6 (3 viruses, 3 bacteria) | 5-second cheek or nasal swab | feline herpesvirus (spell it out), calicivirus, Chlamydia felis |
| Dog Respiratory | 11 (8 viruses, 3 bacteria) | 5-second cheek or nasal swab | Bordetella, canine influenza, distemper, parainfluenza |
| Oral (dog and cat) | 4 periodontal bacteria | Gumline swab | "the bacteria that cause gum disease" |
| Cat Complete Health Kit | 37 (27 + 6 + 4) | All three samples | |
| Dog Complete Health Kit | 42 unique targets (panels add to 43, but distemper is on both fecal and respiratory) | All three samples | |

- Cat oral is 4 (confirmed). Flag any older material that says 5.
- Use 42 for the dog Complete Kit everywhere. Some site copy still says 43 ("Up to 43 pathogens" badge, "See all 43 targets"); treat that as out of date and flag it.
- Counts verified on petwealth.com, Nov 22 2026.
- Respiratory kits include two swabs (nasal and/or oral; an eye-discharge swab can go in the same tube).
- In short copy name three, then "+ N more" ("Giardia, Tritrichomonas, Coccidia + 24 more pathogens").
- Oral: never use the count as a stat (4 sounds small). Frame it as specificity: the bacteria living under the gumline, below where brushing reaches.
- For kittens, lead respiratory copy with feline herpesvirus and calicivirus.

**Lab and method**
- All panels use PCR, the same method veterinary reference labs use. Approved accuracy line: "All of our panels use PCR, the same method used by veterinary reference labs, which makes our tests 99.99% accurate."
- In-house lab (Petwealth Diagnostics, Addison, Texas). "We have validated our assays internally using more than 5,000 samples."
- Never claim lab accreditation (unconfirmed).
- Room-temperature storage, shelf life up to 3 years.

**Turnaround**
- "Results in 24 to 48 hours" always carries the fine print "*Once your sample reaches our lab." (or "*From the time our lab receives your sample.").
- Results are delivered electronically in the app. Don't claim they arrive by email.

## Prices and savings

Always confirm current prices on petwealth.com (`/products/<handle>.json`) before a build; offers change.

**Regular pricing (confirmed on the site, Nov 2026)**
- Fecal $139. Oral $129. Respiratory $129 (same for dog and cat).
- Complete Health Kit $299 against a $397 value: "save $98".
- Use regular pricing for evergreen work. Use sale pricing only for work that runs during the sale, and say which one a design uses.

**Black Friday 2026 (20% off orders $150+, Nov 16 to 30)**
- Complete Health Kit $239: **"save $158"**, e.g. "Get all 3 tests and save $158."
- Buy-2 savings: Fecal "Save $56 when you buy 2"; Oral and Respiratory "Save $52 when you buy 2". Single tests alone don't reach $150.
- After the sale, swap to the evergreen (no-sale) versions.

**Wording**
- Savings are phrased "save $X" (never "$X less" or "than buying them separately").
- On single-kit tiles show the regular price plus the save line, no strikethrough.
- Make sale math explicit and consistent everywhere (one number per offer across PDP, cart, email, ads; "Save $55" on one surface and "$56" on another is a bug).
- **Never put Breeder or Rescue program prices in ads.** Say "Special pricing available" / "Exclusive pricing through our Rescue Program."
- Bundle claims stay factual ("$397 value, save $98"). "Most comprehensive" (e.g. "the most comprehensive cat fecal test") is approved for use.

## Claims guardrails

- No condition names on images where it reads as a diagnosis (e.g. no "kennel cough" on an ad image).
- Don't single out breeds in health claims ("more common in purebred cats from multi-cat homes", not "Maine Coons get it").
- No pathogen names in casual consumer social copy when they won't be recognized; say "gum disease", "the one that shows up first".
- The vet is a partner: "share the report with your vet". Don't add "not a standalone diagnosis" disclaimers, and don't suggest skipping the vet.
- Avoid apology or fear framing unless the concept explicitly calls for it.
- **Sale wording:** mix freely across channels: "our only sale of the year", "Black Friday", "the biggest sale of the year", "20% off orders $150+". The one exception: in native UGC-style videos, drop "our" so the headline doesn't read as coming from the brand ("THE ONLY SALE OF THE YEAR").

## Reviews and testimonials

- Quote verbatim (Okendo is the source), including original spelling and punctuation.
- Match species and product. No cat review on a dog ad. If no matching review exists, run without one and flag it.
- Keep a quote one size; don't mix big and small emphasis inside it.
- Label B2B reviews by who they are ("Cat breeder customer review").
- Never invent a reviewer or a quote. If a name can't be verified, swap in a real review.

## Partner wording

- Kennel Connection: "Kennel Connection clients" (never partners or members).
- Pawp copy may say "ready to share with your Pawp vet". CTAs in Pawp contexts: "Test at Home". Show "Pawp member pricing" rather than a specific discount unless signed.
- Use partners' own feature names, not labels we made up.
