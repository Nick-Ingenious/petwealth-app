---
name: petwealth-design
description: Petwealth's house design system and creative rules for every visual we make, so anything Claude builds looks and reads like Petwealth. Covers paid ads (Meta statics, Story/Reels 9:16, carousels), video ads, emails and SMS images (Klaviyo), landing pages and product detail pages (PDPs on petwealth.com, Pawp and Root Cause pages), decks and sales materials (one-pagers, partner sheets, sample lab reports), internal dashboards and data pages, Google Docs/Sheets formatting, and product imagery (packshots, cutouts, AI photos). Use this skill whenever someone at Petwealth asks to design, mock up, build, resize, version, review, critique, or export anything visual, or writes copy that will sit on a design (headlines, ad text, email copy, PDP sections), even if they never say "design" or "brand". Also use it for "make this on-brand", "check this before I send it", Figma work in Petwealth files, and anything involving our kits (Fecal, Oral, Respiratory, Complete Health Kit).
---

# Petwealth Design

This is the shared playbook for how Petwealth looks, sounds and ships creative. It captures rules the team has already settled, mostly through rounds of feedback on real work. Following them saves everyone a revision round.

## Who we are (the one-paragraph brief)

Petwealth makes premium at-home health testing for dogs and cats: vet-grade PCR kits for **fecal, oral and respiratory** testing, processed in our in-house lab, with results in 24 to 48 hours in the Petwealth app. Think Function Health or Oura for pets, not a cute pet brand. The feel is **"silent luxury"**: quiet, confident, science-backed, warm. The pet is always the hero. We help pet parents get answers and bring them to their vet; we never "diagnose". Our line is **"Love, backed by science."** Lead with emotion, support with science; benefits before features; a trusted guide, never a salesperson.

**The Petwealth filter:** if the logo were removed, would someone still recognize this as Petwealth? If not, it isn't done.

## How to use this skill

1. **Read the universal rules below.** They apply to every output.
2. **Open the reference file for the channel you're working in** (table below). Read only what you need.
3. **Before showing anything, run the review checklist** in `references/review-checklist.md`. Most rejected work failed something on that list.

| Working on | Read |
|---|---|
| Colors, fonts, logo, photography, UI style, shared components | `references/brand-foundations.md` |
| Voice, audiences, messaging pillars, organic social (grid, templates, carousels, cadence, community replies) | `references/voice-and-social.md` |
| Any copy: product facts, test names, prices, savings, claims, reviews | `references/copy-and-claims.md` |
| Product photos, packshots, cutouts, AI-generated images, compositing | `references/product-imagery.md` |
| Meta static ads, carousels, 4:5 / 9:16 / 1:1, Story safe zones, ad exports | `references/ads-static.md` |
| Video ads, UGC edits, captions, music, AI video | `references/video.md` |
| Emails, SMS/MMS images, Klaviyo HTML | `references/email-and-sms.md` |
| Landing pages, PDPs, homepage, cart/checkout mockups | `references/web-landing-pdp.md` |
| Decks, one-pagers, partner sheets, sample lab reports, Google Docs | `references/decks-and-sales-materials.md` |
| Dashboards, data pages, charts, Google Sheets models | `references/dashboards-and-data.md` |
| Final QA before sharing or exporting | `references/review-checklist.md` |

## Universal rules (every output, every channel)

**Writing**
- **No em dashes, ever** (and no en dashes used as punctuation). Use commas, periods, colons or parentheses. Hyphens in compound words and number ranges are fine. This includes chat replies, captions, alt text and code comments.
- **Name tests by product name:** fecal, oral, respiratory. Never "gut health, breathing and oral health" or other body-area stand-ins when describing what we test.
- **Savings are phrased "save $X"** (e.g. "Get all 3 tests and save $158" during Black Friday). Never "$X less" or "than buying separately". Prices change with offers; check `references/copy-and-claims.md` and the live site.
- Facts, counts and prices come from `references/copy-and-claims.md`. If a number isn't there, look it up on the live PDP or ask; never estimate a pathogen count.
- Reviews are quoted verbatim, with original spelling and punctuation, and only on the matching species and product.

**Imagery**
- **Two-piece product images (box + tray, cat box + dog box, sleeve + open kit): the gap between the pieces sits at the exact horizontal center of the image.** Pad or crop the PNG so the gap is centered, then center the image in its container. This applies to every tool and channel.
- **Never let AI draw or redraw our packaging.** Use real packshots and composite them in. Make footage sharper; never swap the box art.
- Don't composite-move objects inside real product photos (lifting a kit, refilling the backdrop). It reads as distorted. Crop differently or use another photo.
- Candid and real beats glossy and staged. Pets can sit slightly soft; product in focus.

**Working style**
- **Minimal, targeted changes.** When asked to change one thing, change only that thing. Don't redesign work that was already approved, and don't "helpfully" add prices, sections or copy nobody asked for.
- **Never delete someone's work.** Move superseded versions to an ARCHIVE section. Never delete grey `#D9D9D9` "needs designer" placeholder rectangles. If someone edited a frame or text themselves, don't overwrite it; flag it and ask. Before replacing text in Figma, note its current characters so it can be restored.
- **New Figma frames go in clear, empty canvas space** on the page the person is working on, never overlapping or behind other frames. Explorations go at the bottom of a page, not on top of the feedback board. Park temporary upload placeholders off canvas and delete them in the same step.
- **Design in Figma, and put the inspiration in Figma too**, side by side with our version, when the work is a visual design (ads, emails, PDPs, decks).
- **Check your own work visually before showing it.** Screenshot every frame you touched, compare against the original design or reference at the same size (desktop and mobile for web/email), and fix spacing, alignment and sizing yourself first.
- **Report briefly.** Lead with what changed, include a screenshot or link, and end with the one question that needs an answer. Don't publish, send, schedule or go live in any platform (Klaviyo, Shopify, Meta) without the owner's OK.

**Approvals:** Anya signs off on everything (ads, emails, video, web and PDP changes, decks, sales materials, social) before it exports, launches, sends or goes live. Everything follows the six checkpoints: brand voice, scientific review, copy review, design review, final check, approval. If a claim or stat feels uncertain, review it internally before it goes live.

## Fonts at a glance

- **Brand core:** Creolia (display serif, headlines, big numbers, used sparingly) + Plus Jakarta Sans (body, UI, everything else). Use for emails, web, decks, dashboards, docs and organic social. Track headlines tight (-3%), and one display moment per asset.
- **Paid statics:** many proven ad layouts use Gelica (headlines, quotes) + Google Sans Flex (body). When editing or versioning an existing ad, match the fonts already in that file.
- Never set the Petwealth wordmark in a substitute font; use the logo files.

## When the rules conflict

Specific beats general: a channel file overrides this page for that channel, and a direct instruction from the person you're working with overrides both for that piece of work. If a request would break a universal rule (an em dash in a headline, AI-drawn packaging, an unverified claim), say so in one line and offer the compliant version.
