# Email and SMS

Figma home: Email-Marketing file `380PyxOtAFLoh1zDl2NrSB` (campaign pages like "Campaigns – Black Friday 2026", flow pages for abandonment and welcome). Sending platform: Klaviyo.

## Process

1. Design in Figma first, with inspiration frames alongside. For email inspiration use Really Good Emails (Atria only has ads).
2. Build desktop (600px) and mobile (375 or 390px, matching the file) versions.
3. **Visual check before review:** render the build at 320, 375 and 600 to 640px, screenshot the matching Figma frames at the same widths, compare section by section (spacing, alignment, image widths, left vs centered text), fix every mismatch, then send.
4. **Never create, edit live, schedule or send anything in Klaviyo without the owner's OK.** Prefer editing existing templates and flows over creating new ones. Propose copy options and wait for a pick before changing anything live.

## Photography

Aim a little more editorial than ads: polished but natural, soft light, clean compositions, June 2026 shoot and studio product imagery first. UGC-style candid shots belong in ads; in email, use real customer photos inside review and testimonial modules.

## Anatomy (desktop frames 600 wide; mobile 375 or 390, match the file)

**Flows** (browse, cart, checkout, testimonial, founder): a 520 content column inset 40 on stone `#F8F2EA`, built from rounded cards with stone gaps:
1. Top block: lilac ticker (31px, "SAVE 20% ON ORDERS $150+ · FREE SHIPPING" during sales) + logo.
2. Rounded hero card (520 wide; square 520x520 in single-kit flows, otherwise up to about 875 tall). Flow heroes use the kit-colored PDP slide style (e.g. Cat Fecal deep green) with the lilac seal during sales.
3. Lilac caps eyebrow ("YOUR KIT IS WAITING") and a "You were looking at" product card.
4. Offer banner during sales (520x112, rust-orange gradient with a pet cutout).
5. One content module: FAQ "Your questions, answered", "What it screens for", How it works, "Why the kit", or a testimonial.
6. Complete Health Kit upsell card.
7. Trust row between dashed rules, the turnaround footnote, then a rounded dark footer card.
One frame per product (6 kits + 2 Complete Kits) so the hero always matches the viewed item.

**Campaigns:** full-bleed panels ("Panel N · …"): logo bar or ticker → hero → wave divider → offer copy → products or options → trust row → small print → wave divider (thin lilac line over a stone-to-slate wave) → full-width slate footer → disclaimer strip. Evergreen campaigns add a dark ticker ("FREE SHIPPING ON EVERY ORDER"), an eyebrow pill, a full-bleed photo and alternating stone / white / slate panels. One story per email.

## Type and color in practice

- Creolia headlines are kept in Figma as outlined vectors ("Heading · Creolia outline") with a hidden live-text twin; export them as images for HTML. Hero headlines about 50 to 60px, section heads about 34 to 40px.
- **Highlight words:** one or two key words in a headline in purple `#7D61C7` ("only sale", "still waiting"); light orange in warm emails.
- **Eyebrows:** Plus Jakarta Sans Bold caps, wide tracking, about 12 to 13px; purple `#7D61C7` on stone, rust `#B8480A` in warm emails, lilac on teal or slate.
- Body about 16px on 24. Footer about 12 to 13px.
- **Buttons:** pills, hero 50 to 57 tall, card buttons 42 to 50. Lilac `#CAB3FF` with slate text (sales and flows), slate with white text (evergreen), outlined white pill (secondary). Sale campaigns use tracked ALL CAPS ("SHOP THE 20% OFF SALE"); flows and evergreen use sentence case with an arrow ("Complete your order →"). Paired buttons for species ("SHOP CAT" / "SHOP DOG").
- **Backgrounds:** stone body, slate logo bars / footers / dark panels, dark ticker `#092129`, teal `#103E4C` for testimonial emails. **Rust-orange gradient `#B03F05 → #D3590D`** for sale offer banners, the Complete Kit card in sale emails and warm seasonal heroes (white line-art leaves, tilted polaroids). Dark "last call" variant: slate page, kit-color product cards, lilac buttons. Light lilac `#E4D9FF` page for playful seasonal directions.

## Components

- **Offer rows** (landing-page style, 520x106): thumb + title + subline left; price over struck price + lilac "Save $X" pill right; selected row has a dark border and a "MOST POPULAR" tab.
- **Grid cards** (3 columns): kit image (mini seal during sales), centered title, 2-line description, price + lilac "2 for $X" pill, slate button.
- **Tags:** "BEST VALUE" dark green `#1E4D3A`; tilted lilac sticky note ("SAVE $158"); "Bundle + 20% off" lilac pill beside a struck price; offer-code box with a dashed border ("Ends at midnight PT"); "No code needed · Applied automatically · Ends Mon 11/30" strip.
- **Chips:** pathogen or symptom chips about 33 to 35 tall, outlined or light-lilac fill.
- **Steps:** numbered lilac circles, or a big lilac numeral in a dark card.
- **Trust row:** thin-outline line icons (about 56x44) with captions "Free shipping on every order / Every report vet-reviewed / Lab results in 24–48 hrs*".
- **Testimonial card:** lilac quote mark, caps headline, quote, lilac stars, "Name · Product".
- **Footer:** "Questions before you order?", support email, divider, ©, contact line, "View in browser | Preferences | Unsubscribe", Instagram / Facebook / LinkedIn icons (22px), white logo about 180 wide, disclaimer below.

## Sale vs evergreen

Sale versions add the ticker, the orange banner, lilac seals, caps buttons, struck prices and holiday props. Evergreen uses slate buttons, eyebrow pills, chips and editorial photos, and drops the seals and countdown language.

## File conventions

Each page opens with a 1400-wide header frame (caps label, title, offer summary). Sections like "Emails – Black Friday 2026 (desktop v1 → newer, mobile below)" with a "Section banner · EMAIL N". Versions run left to right at a 660 pitch with a label frame above each ("Label · Mon 11/16 · Email 1 · v3"). Frame names "BF Email 1 · Mon 11/16 · v3 – Desktop". Markers: "★ CURRENT DRAFT", "CHOSEN", "FINAL SET", "(archived)", "(parked)". Inspo frames labeled "INSPO · X (real email, Really Good Emails)" beside "OUR VERSION". Coded handoffs split each email into content / close / footer slices.

## Locked design standards

- Headlines in Creolia (rendered as images in HTML so they survive every client); body, cards, buttons and footer in live Plus Jakarta Sans text.
- **Hero:** square 520x520 image for single-kit emails; headline near the top, intro copy 20px on 25px line height, button text 20px. Sale seal (110px) top-right in the image's empty space during promotions.
- **Product card:** image well about 206x170 with the image allowed to overflow, title and price share a baseline with a 6px gap. Savings pill ("SAVE $56 WHEN YOU BUY 2") inside the white card, left-aligned above the title. Product images wrapped in gap-centered frames.
- **Complete Health Kit card:** default to the open box with a shadow and no phone or tubes, which generally looks better. The version with the phone, tubes and a "Best value" tag is also acceptable when a layout calls for it. Card details: bullets "Fecal test / Oral test / Respiratory test", button "Shop now and save $X →" with the current offer's savings ($158 during Black Friday 2026).
- **"What it screens for" order:** Fecal, Respiratory, Oral.
- **How it works:** the return step reads "Pack it up and drop it off at FedEx." Results step: "Results in 24 to 48 hours*" / "Delivered electronically." with the footnote "*Once your sample reaches our lab."
- **Testimonial headlines:** short caps headline above each review (Plus Jakarta Sans ExtraBold, wide tracking, dark text, left-aligned, no trailing period). Reviews verbatim from Okendo; lead review matches the viewed product.
- Button arrows vertically centered on the text's cap height.
- Single-kit pricing in grids: regular price + "Save $X when you buy 2", no strikethrough.

## SMS / MMS images

- Canvases: 1080x1080 (MMS components) and 1080x1350 (4:5). Light backgrounds, big headline (Plus Jakarta Sans Bold, very large, tight leading, slight negative tracking), product cutout large, offer and subline as live text in Figma components so copy is edited once and reused. Phone mockups pull from the components and show the character count.
- Complete Health Kit SMS: box tilted slightly, "Get all 3 tests & save $158".

## Klaviyo HTML gotchas

- Klaviyo strips Google Fonts `<link>` tags on save. Embed `@font-face` inside `<style>` instead. Gmail still falls back to Helvetica Neue; Apple Mail uses the font.
- Use separate desktop and mobile `<img>` elements with explicit widths, swapped by media query. Never force size with `height: ... !important; width: auto`.
- Don't use `white-space: nowrap` on checklist lines; it overflows at 320px.
- Scope any Gmail link-color fix to the footer only; a global rule turned white button text black.
- Keep images under about 300KB (JPEG on a solid background color for photos).
- Cart and checkout buttons resume checkout when a checkout URL exists, otherwise go to the product page.

## Copy patterns

- Sale emails: "Grab it during our only sale of the year: 20% off orders $150+."
- Abandonment: "Your {Kit} is still waiting." (cart/checkout), "Did the {Kit} catch your eye?" (browse).
- When asked to change one element (a disclaimer, a headline), change only that node.
