# Web: landing pages, PDPs, homepage, cart

## Where things live

- **petwealth.com** (Shopify theme): homepage, PDPs, cart. Figma mockups in the Landing Pages file `8kiHNpJost6yGXlFBX32K9` (e.g. page "111626 Black Friday · Product Pages").
- **landing.petwealth.com**: a separate Astro static site (repo `Marketing_Landing_Pages`), deployed by Cloudflare Pages on push to `main`. Families:
  - **Pawp pages** `/pawp/{dog,cat}-{fecal,respiratory,oral}/`: partner pages for Pawp members.
  - **Root Cause pages** `/root-cause/{dog,cat}-{fecal,respiratory,oral}/`: symptom-led ("Get to the root of your pet's symptoms"), dark template, for ad traffic, full price, footer email signup.
  - Both share one stylesheet and image folder, so a CSS or image change affects both families. Component copy edits do not flow between them.
- Pushing to `main` updates the live site. Show a draft (local preview or artifact) and get a go-ahead first.

## Site look (petwealth.com)

**Fonts on the live site:** Creolia headlines (fallback Fraunces, Georgia) with **Google Sans Flex** for body in the custom sections; the theme's default text and buttons fall back to Plus Jakarta Sans. Match whatever the section you're editing already uses. Email stays on Plus Jakarta Sans.

**Headline signature:** a Creolia headline with the last phrase in italic, often tinted (lilac on dark, teal on light): "Peace of mind, *in their words.*", "Pick the symptom. *We'll match the panel.*"

**Eyebrows:** small uppercase tracked labels with a short 24x1 rule before them (a drawn line, then "THE TESTS"; the line is a shape, not a typed dash), left or centered.

**Layout:** desktop frames 1440 wide (64px side margins), mobile 375 to 390. Announcement bar 40px (35 mobile), header 80px (52 mobile). Section top padding about 96 desktop / 56 mobile. Heroes are an inset rounded card 8px from the page edges.

**Background rhythm:** warm stone page (seen as `#F8F2EA`, `#FAF6F1` and `#FAF7F2`; match the file), dark photo hero, stone and white content sections, a dark gradient insights section (slate/teal fading toward lilac), and the white content panel ending with a rounded bottom over a full-bleed dark CTA photo and the slate footer. Burnt orange is the Complete Kit / upsell color during sales (homepage banner, cart Complete Kit cards); dark teal is the "add a 2nd kit" card color.

**Components**
- **Nav:** logo left; "Our Diagnostic Tests" dropdown, For Partners, About us; right side Login, a lilac pill "Test my pet", cart icon. Slate announcement bar with lilac caps message.
- **Buttons:** fully rounded pills. Primary lilac with slate text (Add to cart, Check out, hero CTA); dark slate with white text (forms, product-card "Shop now"); white pills on orange or teal cards. Price can sit inside the button ("Shop now for $X ~~$397~~ →").
- **Trust lines** under buy buttons: "Free shipping · Free prepaid return mailer · Results in 24 to 48 hours".
- **Product cards:** white, rounded, small lilac tag top left, 3 green checks, full-width slate "Shop now"; horizontal scroll with a progress line and arrows.
- **Reviews:** photo, stars, date, title, "Read more", "Verified Buyer", product link. Partner pages use a white card with stars and a category tag pill (RESCUE, CAT BREEDER).
- **App phones:** three phones, middle one larger, on dark sections.
- **Comparison table:** tinted left panel with eyebrow and Creolia headline; filled checks vs outlined empty circles.
- **Vet cards** (stone card, photo, credential logo, name, caps title, "Read full bio →"), round line-art teal badge seals ("Built on clinical-grade standards"), partner logo row, FAQ with photo or title left and a hairline-divided plus-icon list right.
- **Footer:** slate; logo, email pill with lilac arrow button, Products / Company / Support columns, and a giant italic lilac Creolia "prevention is priceless." marquee.

**Homepage order (live):** dark photo hero with Creolia offer and italic lilac line → 4-icon trust row → "Lab-grade tests. Made for home." product carousel with All / Dogs / Cats tabs → steps "Simple from swab & scoop to results" (4 photo steps, big Creolia numerals) → reviews carousel → dark insights section with phones + glass/lilac bento cards → "Pick the symptom" carousel → vets, badges, partner logos → FAQ → CTA photo ("The earlier you test, the more you can *prevent*.") → footer.

**PDP below the buy box (live):** accordions (Meet the kit, What we test for, How it works, What's inside, Why the kit) → vertical step timeline → dark "Lab results you can actually act on" with 3 phones → reviews with histogram and photo strip → comparison table → vet advisors → badge row → partner logos → FAQ → "Explore other health checks" cards → CTA photo → footer. Desktop: gallery column 740 (600x600 image on a white card), 72px gap, buy box 500, Add to cart 56px tall.

## Photography

The website and landing pages aim a little more editorial than ads: polished but natural, soft light, clean compositions, studio product renders and June 2026 shoot imagery first. Save the candid UGC look for ads; real customer photos fit inside review sections.

## PDP design

There are two parts: the **buy box** and the **image carousel**. The Nov 2026 buy-box redesign is credited with lifting orders that include 2+ tests from about 14% to about 60%, so protect its structure.

**Source of truth**
- Buy box: Landing Pages file `8kiHNpJost6yGXlFBX32K9`, page `95:306`, section "Exploration O · Source of truth". **O5** (`201:306`) is the favorite; O5 alt (`319:306`) adds line-art cats. Don't edit a favorite in place; make an alt copy beside it. Cart + checkout page `424:306`: "Anya's final exploration" `467:306`, the V2 the CFO preferred inside `533:311`, refinements in `539:306`.
- Other pages in that file: BF homepage banner (`332:306`; desktop 1200x230, mobile 358x385), BF email popup (`349:321`), Partner landing page (`0:1`, desktop 1440 / mobile 375 with handoff notes), and EXAMPLES (`277:2`, full-page captures of the live homepage, PDPs and competitor pages, the best record of the real site).
- File conventions: date-prefixed page names (`111626` = Nov 16 2026); a "Source of truth" or "final exploration" row on top, then explorations, ARCHIVE, RESEARCH; a caps label plus one-line rationale above every frame; red ANNOTATION boxes on proposals and a "Handoff notes" frame (placement, states, mobile stacking); desktop, mobile and states side by side.
- Carousel: "PDPS v1 – PDP Slides" file `LWDRo5f1ATOBCbWkfM1Fdb` (the Chewy set on page `52:1994`, plus a "PDP - Final" page; main image V2 node `307:2`). Exports in Drive `Sales/Chewy/Onboarding Docs/PDP Images - Chewy (Nov 2026)`.
- Older concept artifacts are superseded by Figma.

### Buy box (top to bottom)

1. Title + rating.
2. One-line subline: "Get to the root of your cat's digestive issues with at-home testing."
3. Three fact pills on one line: "Screens for 27+ targets · Results in 24 to 48 hrs · Action plan included".
4. Offer box during a sale ("Save 20% on orders $150+" / "Applied automatically at checkout · Ends Mon 11/30"). Sale wording can mix "only sale of the year" and "Black Friday" (see `copy-and-claims.md`).
5. **Quantity tiles** (1 / 2 / 3 tests):
   - Fine print: "Start with one cat fecal test" / "Stock up for each cat in your household or for routine testing" / "Best for multi-cat homes". The 2+ option speaks to multi-pet homes and routine testing equally.
   - "Most Popular" tag on the 2-test tile only: dark teal fill, white text, centered on the tile's top border, half overlapping it. No other tile tags.
   - Savings in a lilac pill ("Save $56", "Save $83"). No separate per-tile "20% off".
   - Prices about 18px, savings about 15px. Titles and prices aligned across tiles.
   - Optional alt: one straight-on, symmetrical, sitting line-art cat (tail curling up the side), repeated 1 / 2 / 3 times in the kit color (fecal `#176347`, respiratory `#783197`, oral `#19368B`).
6. **Complete Kit card:** a dark teal "BEST VALUE" tag, lilac "Save $X" and "Bundle + 20% off" pills ("Bundle + 20% off" is a very strong line), kit name, a big kit render with details and bullets to its right (Fecal 27 / Oral 4 / Respiratory 6), price against the $397 value with the savings, "Learn more" link.
7. Add to cart.
8. Below the button: a "Reach for this if you're seeing…" symptoms box, and "See all 27 targets ↓".

**Promo seal** (`.pw-promo-seal`, live during sales): lilac `#CAB3FF` with a highlight, rotated about 10 degrees, Creolia "20% / off" center, Google Sans Flex arc text. Reuse it as the sale circle in emails and ads.

**Rejected in the buy box:** a "your price per test" meter or per-test pricing, "Which sounds like you?" or "How many cats?" selectors, calendar-style frequency displays, an "Add a second test before 11/30" nudge, mixed or overlapping box cats, a slanted three-quarter cat.

### Image carousel

Figma `LWDRo5f1ATOBCbWkfM1Fdb`: "Chewy PDP Slides" (`52:1994`, Nov 2026) is the master set: 8 kit sections (cat and dog x fecal, respiratory, oral, Complete), 9 slides each, all **1080x1080**. "PDP - Final" (`244:798`) holds the site set (adds a Reviews slide). "PDP enhancements · Main image (Cat Fecal)" (`294:2`) holds the new site main image `307:2` and the 10-slide site lineup. The older "PDP Slides" page is superseded.

**Kit color system (slide backgrounds, diagonal gradient light top-left to dark bottom-right)**

| Kit | Gradient |
|---|---|
| Cat Fecal | `#2B4833` → `#1E3325` (forest green; headline accents mint/green) |
| Dog Fecal | `#2B6163` → `#15393E` (teal) |
| Cat Respiratory | `#623973` → `#31193E` (purple) |
| Dog Respiratory | `#554386` → `#271E49` (violet) |
| Cat Oral | `#313B79` → `#191E42` (navy) |
| Dog Oral | `#364D93` → `#1A2553` (brighter navy) |
| Complete (both) | `#19252C` → `#0F4756` (brand dark surface) |

Shared across kits: lilac numbers, pills and check circles (lilac circle, dark tick); stone `#F8F2EA` for the How it works and Results slides; accent numbers in headlines are lilac on every kit except cat fecal (green).

**Slides (in order)**
1. **Main image.**
   - *Chewy / marketplaces:* product only. Sleeve left, open tray right, gap centered, soft grey cast shadow falling left, no text or badge. Complete Kit main = the open black magnetic box with the 3 kits, phone and 2 tubes in front.
   - *Site (`307:2`):* no logo, no eyebrow; full kit with breathing room on a tan `#F2E8DA` to white gradient; centered headline ("Get answers about your cat's digestive health.", last words in the kit color; confirm whether Creolia or bold sans in the file); sub "Screen for parasites, bacteria & more, from home."; big lilac check circles with text beneath and no white card behind them; dark teal circle badge "Screens for 27 targets in 1 sample"; footnote "*From when your sample reaches our lab."
2. **Answers.** Kit-color gradient. Creolia headline top left in cream/white: "Answers from the litter box." (cat fecal), "Answers from a quick sample." (dog fecal), "Answers from a quick swab." (respiratory, oral), "Answers from home." (Complete). Huge lilac count, solid lilac pill "TARGETS IN ONE SAMPLE" ("IN ONE KIT" on Complete), 3 lilac-circle checks, tiny footnote. Render: sleeve cropped off the right edge with a tube and open cap or scoop floating.
3. **Noticed something off?** Full-bleed pet photo with a soft red/pink glow over the affected area (belly, throat/nose, mouth), bottom fading into the kit color. White Creolia headline "Noticed something off?", larger tinted subline "Get to the root of your cat's symptoms." Symptom chips are translucent dark pills with a light outline and white text.
4. **What it screens for.** Two-line Creolia headline with the count in the accent color ("Tests for the 27 most common concerns in your cat's gut", "Tests for the 4 bacteria behind gum disease in your cat"). Kit box centered in a thin glass orbit circle with a prop (scoop, tissues, toothbrushes). Dark translucent corner chips with colored number circles (coral, amber, mint, lilac), item lists beneath, connector lines with ring dots. Respiratory: 2 chips (Viruses, Bacteria). Oral: 4 pathogen-name chips with one-line roles. Complete: Fecal / Respiratory / Oral chips with lists ending "+N more" over a stacked-kits render; the dog version notes distemper is on both panels.
5. **How it works.** Stone background, left-aligned "Lab-grade testing, right from home", sub "Just a few simple steps:", 2x2 white cards (flat illustration, bold step title, 2 lines). Steps: Activate, Collect ("from the litter box" / "on your next walk"; Complete "One quick scoop and two quick swabs."), Mail it off, Get results. No lab step. Swab illustration matches the species.
6. **Results.** Stone background, centered "Clear answers in 24-48 hours", sub "Easy-to-read results, plus a standard lab report you can share with your vet." Three fully opaque phones, middle largest (Nala for cat, Suki for dog; Complete shows three different tests). No laptop.
7. **Comparison.** Split headline "More answers. / Less waiting." (oral: "Real answers. / Not a guess."). Left half slate `#19252C` → teal `#0F4655` gradient with logo, kit name and render; right half white with "the others" eyebrow, a competitor sub-label ("Typical at-home tests", "At-home tests or the vet", "Separate tests or the vet", "Very few at-home options") and a generic white box. Lilac "VS" circle at top center; lilac check circles vs red outlined X circles; each row on one line.
8. **What's included.** Warm stone (about `#F4EEE4`) flat lay: kit, open "Start Here" tray, phone, lilac bubble mailer, lilac gloves, tube, swab packet and the purple activation insert card (it's a real kit component, so it can appear; just don't write "Scan the QR to activate" as a callout). Three white bubble callouts with a dark dot ("Results in 24 to 48 hours* in the app", "Free 2-day return shipping & mailer", "Gloves, scoop & tube" / "swabs & tube" / "swab & tube" / "3 tests in one box"). Complete version: the fecal flat lay plus the respiratory and oral kits and tubes.
9. **Vets.** Photo left, slate-to-teal right; "DEVELOPED WITH" + lilac "VETS" pill, Creolia claim, stars, two advisor rows.
10. **Reviews (site only).** Slate-to-teal background, three offset white review cards with circular photos and lilac rings, a stone "5.0 out of 5" card.

**Carousel rules:** no prices on any slide; real packshots only (sleeve + tray, gap centered); kits may crop off the frame edge on dark slides; footnotes always tie 24 to 48 hours to the sample reaching the lab. Keep footnote wording consistent within a set.

### PDP copy

- Lead with "targets" and the categories (bacteria, viruses, worms, protozoa) in headlines; "pathogens" is fine in comparison rows and detail copy. Slide headlines use "Tests for…", fact pills use "Screens for…".
- No "treat" and no "catch trouble early". Prefer "Test routinely, even when symptoms aren't obvious" and "cats often mask symptoms".
- Complete Kit totals: cat 37, dog 42 (unique targets; distemper is on both dog panels).

## Landing page patterns

- **Offer / CTA block:** an inline pill button ("Test today" / "Shop now") with the price beside it (current price in slate, struck original in grey, baseline-aligned, pill hugs its label), then a save line underneath with a tag icon (e.g. "Pawp members save 10% with code PAWP10"; keep the code phrase from breaking across lines). A price-on-top variant was tried and reverted.
- **"Health insights you can act on":** three app phone screenshots per page (overview "Everything we tested", pet profile status, pathogen detail "What we found"), sourced from the Product-App Figma file. The phone images have black baked into the device frame, so cut them out to true transparency before placing on colored sections.
- **Dark sections** with pet portraits: defringe cutouts so no light halo shows (see `product-imagery.md`). Anchor background-positioned portraits with fixed pixel offsets from the right edge so framing holds at every desktop width.
- Ad landing pages carry incoming UTM / click IDs through to petwealth.com links; don't hardcode UTMs.
- Standalone preview files may include a replica footer; strip it when importing into Shopify as a section, because the theme renders the real header and footer.

## Cart and checkout mockups

- **Cart drawer (375 wide):** Creolia "Your cart" header with close X; dark teal progress bar ("Spend $11 more to unlock 20% off", lilac fill) that flips to "You unlocked 20% off" plus a green "You're saving $X" line; a tucked "Add a kit for your second cat" checkbox row ("+$83" and a lilac "20% off both" chip); burnt-orange Complete Kit card with a "Best value" tag on its top edge; slate total footer with the lilac Check out pill.
- Merchandising order: dog carts show the Complete Kit first, then a second kit; cat carts show a second kit first, then the Complete Kit.
- Checkout header: logo plus a sale pill exported as one image.
- Upsell cards borrow the PDP quantity-tile pattern: savings pill centered on the card's top edge (white fill, 1.5px stroke in the card color).
- Show real prices and clear math: the actual Complete Kit price with the value struck, the percentage, and the savings. Don't show only a delta ("+$100").
- Avoid clunky arithmetic strings ("$278 → $222.40 total") and replacement framing ("Replaces your fecal kit, just $100 more").
- Savings-first headlines: "Upgrade to all 3 tests and save $X".
- Explorations go at the bottom of the Figma page, never on top of the feedback board.

## Web build checks

- Test at 375 / 768 / 1280 / 1600+ widths. No horizontal scroll, no orphaned single words in headlines where avoidable.
- Fonts loaded (Creolia plus the section's body font); check computed fonts, not just screenshots.
- Images compressed, content-hashed names where the site caches aggressively (rename to bust cache rather than overwriting in place).
