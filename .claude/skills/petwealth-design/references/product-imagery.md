# Product imagery

Most design feedback has come from product images. These rules exist because each one was a rejected round.

## Sources (use real assets first)

- **Packshots:** `Marketing/Photography/PetWealth Primary Product Photos/<canine|feline>-<fecal|respiratory|oral>/`. `*-hero-dark.png` (transparent), `*-open.png` (transparent, straight-on open kit).
- **Transparent PDP renders (June 2026 shoot):** `Marketing/Photography/June 2026 Photoshoot/2ND ROUND TRANSPARENT PNGS/` (`Product_PDP_<Test>_<Canine|Feline>.png`, `*_Kit_Open(_straight).png`, 6000x4000).
- **Preferred render:** the straight-on open kit (box + tray) on transparent.
- **UGC and working photos:** `Marketing/Photography/UGC/` (organized Cat | Dog > Fecal | Respiratory | Oral | General).
- The baked-in contact shadow on the per-test cutouts is light grey for light backgrounds. On dark backgrounds it renders slightly lighter than the card. For large or print pieces, re-matte the shadow to black or use a dark-background export. Alternatively strip the long cast shadow and add a soft drop shadow in Figma.

## The centered-gap rule

Any image that shows two pieces side by side (box + tray, sleeve + open kit, cat box + dog box): **the gap between the pieces sits at the exact horizontal center of the image.**

How: in the alpha channel, find the two opaque runs in a mid-height band, take the midpoint of the gap, pad the canvas so that point is at width / 2. Then center the image in its container. A contact shadow on one side throws off the bounding box, which is why "just center the layer" isn't enough. In circular "halo" layouts, the gap also sits exactly on the circle's center.

## Packaging is sacred

- Never let AI draw, redraw or "fix" the box, tray, tubes or swab. Widths, proportions and text drift every time.
- Method that works: generate or edit the scene **without** the product, then composite the real packshot cutout with a contact shadow aligned to the last opaque row, matched lighting and color temperature, a touch of blur and grain.
- In video, make footage crisper (use a sharper nearby frame), never replace the box art with packshots.
- Real scale: the closed box is about as tall as a whole hand (wrist to fingertips), wider than the palm, roughly 1.7:1, usually held at a bottom corner. AI defaults to phone-sized; give it a real hand-holding-box photo as a size reference.
- Check zoomed-in for garbled box text, extra fingers, and real brand logos (pet food bags, clothing). Remove them.

## Editing real photos

- **Adding a pet to a real handheld photo:** keep every original pixel of the hand, arm, box and floor; take only the pet (and nearby floor) from the AI edit. Pasting only the box back produces a "two thumbs" seam.
- **Don't composite-move objects inside real product photos** (lifting a kit, refilling the backdrop, synthetic shadows). It looks distorted. Re-crop or pick another photo.
- **Studio background recolor (light to light, e.g. grey to stone gradient):** use a multiplicative tint, not a hard cutout. Estimate the smooth background, output gradient x (pixel / background) so every real shadow survives. Hard masks miss light box faces and kill contact shadows.
- **Light to dark backdrop swaps:** pixel methods fail on cream fur. Use an AI edit with a "minimal edit, replace ONLY the backdrop, keep the pet, hand and box EXACTLY, copy packaging text letter for letter" prompt, then verify.
- **Seamless studio backdrops:** fit a smooth model (polynomial) to clean background pixels instead of blurring neighbors.

## Cutouts

- **Kit boxes on white:** box side faces are the same grey as floor shadows, so color masks eat the corners or keep shadow shards. Use exact outlines per box (polygon from measured corners), pull edge color as min(pixel, 2px inside) to kill white halos. Preferred look: front faces only, soft cast shadows kept, shadow alpha capped around 0.5.
- **Pets for dark sections:** cutouts shot on light backgrounds keep a light halo in the fur edges, invisible on white, glowing on dark. Detect by comparing semi-transparent edge luminance to the fur interior; defringe with F = (C - (1 - a) x B) / a.
- **Tan or orange pets on orange backgrounds:** don't use color-to-alpha; use a solid mask from color distance plus a soft rim.

## AI-generated images (pets, scenes)

- Quality settings matter: high quality, 2k resolution, or results look cartoonish. Pass real photos and packshots as references.
- **Pets too sharp read as fake.** Ask for the pet softly out of focus with focus on the box; a feathered local blur on the pet works if needed.
- **Candid over staged.** Phone-shot, natural available light, mild grain, plain backgrounds. Reject glossy studio-perfect scenes, posed props, red bows (unless it's a gift concept).
- **Known failure modes to prompt against:**
  - Two stacked panels in a tall frame: ask for "one single unbroken vertical image filling the frame top to bottom".
  - Merged animals, extra limbs: "exactly one <animal>, one head, one body", "exactly two hands".
  - Undressed people: name the garments explicitly.
  - Coughing reads as snarling: "head lowered and stretched forward, calm, absolutely not aggressive, no bared teeth".
  - Human-looking teeth on pets: spell out the anatomy (small incisors, curved canine fangs, dark lip edge, "not human teeth").
  - Cat lip-lifts look grotesque: use a cupped hand tilting the chin, mouth closed.
  - Swabs render as cotton buds: describe a thin straight white plastic stem, scored break line, slim flocked tip, explicitly not a cotton bud.
  - Similes become literal shapes in AI video (soft-serve becomes a coil). Describe physics and texture, and list banned shapes.
  - Stray lettering and brand logos on clothes and props.
- Generate 9:16 masters when you'll need several ratios: 9:16 reaches 4:5 and 1:1 by trimming top and bottom only. Ask for the subject centered with generous space above and below.
- File AI source images under `Marketing/Photography/UGC/<descriptive folder>/`, never in the Ad Creative folder.
