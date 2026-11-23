# Dashboards, data pages and financial models

The reference build is the **Petwealth Revenue Dashboard** (a light, editorial "silent luxury" HTML dashboard published as a Claude artifact). New dashboards and data pages should feel like it.

## Look and feel

- Light, warm, editorial. Not a dark terminal and not a generic SaaS admin.
- Max content width about 1180px, 24px side padding, generous vertical rhythm (section groups separated by a hairline and about 46px of space).
- Sticky header: wordmark (Creolia) + page label, period pill on the right, tabs below.

**Tokens**

```css
--slate:#19242B; --teal:#0E4655; --lilac:#CAB3FF;
--bg1:#FBF7F0; --bg2:#F4ECDD; --card:#FFFFFF; --card2:#FAF6EE;
--ink:#19242B; --ink2:#5B5346; --ink3:#8A7D6A;
--line:#E7DDCD; --line2:#EFE6D6;
/* series */
--c1:#3F9DB5; --c2:#5B84D6; --c3:#9C7BE6; --c4:#C9A24B; --c5:#D06B8A; --c6:#4FA98A;
/* status */
--good:#4E9E7E; --warn:#C9A24B; --bad:#D06B8A;
--grad:linear-gradient(100deg,#0E4655,#5B84D6 48%,#9C7BE6);
--font-display:"Creolia",Georgia,serif;
--font-body:"Plus Jakarta Sans",system-ui,sans-serif;
```

- Cards: white, 1px `--line` border, radius 14, padding about 20 / 22.
- Section group titles: Creolia 22px with a small Plus Jakarta Sans subline. Section labels: 15.5px uppercase, 0.055em tracking, bold slate.
- Hero numbers: Creolia, `clamp(32px, 5.25vw, 52px)`. Small stat labels: 10px uppercase, wide tracking, `--ink3`; values 17px bold.
- Numbers use tabular figures.
- Bars use the brand gradient: plan at about 32% opacity, actual at full. Empty or pending values use a light hatched pattern, not zero-height bars.
- Embed the brand fonts (as @font-face) so the page renders correctly when shared.

## Information design

- **Overview first, detail on tabs.** The revenue dashboard uses three top-level tabs (Top-level, Direct-to-Consumer, Wholesale). D2C detail is organized by the revenue equation (Traffic x Conversion x Order value x Repeat), with explanation layers (creative performance, what customers say) and a plan-vs-actual scorecard. Don't organize by data source or by team ("acquisition / retention").
- **Be honest about data.** Pending actuals show blank with the goal beside them, never a fabricated number. Never invent accounts, deals or values. Never show platform-claimed revenue (Meta, Google) without the Shopify actual beside it.
- A number may appear twice if it answers two different questions.
- Keep scope tight: don't "helpfully" add margin, COGS, SKU mix or operational metrics to views where they were deliberately left out.
- No filler status lines or notes that don't carry information.
- Copy rules apply: no em dashes (use a middot `·` as a label separator; an en dash only to mark an empty data cell).

## Financial models in Google Sheets

- Palette: `#0E4655` dark teal (title banner, header bands), `#19242B` body text, `#5C6B75` grey italic (subtitles, notes, % rows, check rows), `#CAB3FF` lilac fill on every **input** cell, `#F8F2EA` cream section-divider bands, white fill over the whole used range (hides gridlines).
- Arial throughout. Title 13 bold white on teal; subtitle 9 italic grey; body 10; header bands bold white centered; subtotals bold.
- Number formats with a dash for zero: money `$#,##0;($#,##0);"-"`, per-unit `$#,##0.00;($#,##0.00);"-"`, percent `0.0%;(0.0%);"-"`, counts `#,##0;(#,##0);"-"`.
- Structure: row 1 title banner, row 2 one-line italic subtitle (what this view is and what the check row proves), cream-banded sections each with a teal header row, scenarios as columns (A / B / Delta), and a "Check (must be 0)" row.
- Use live formulas, never pasted values.

## Charts

- Follow the dashboard palette above. Plan vs actual: gradient bars, plan muted. Status colors only for status.
- Label directly where possible; keep legends small. Axis and tick text in `--ink3`.
- Test at phone width; tables scroll horizontally inside their card rather than breaking the page.
