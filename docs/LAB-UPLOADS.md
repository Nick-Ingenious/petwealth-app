# Lab uploads (WellResult CSV)

Staff upload the qPCR export on **Lab Results** in the admin (or through the staff assistant's `upload_lab_results`). The file is cleaned, matched to kits, reviewed by AI, then a person reviews and releases. Nothing reaches a customer until it's released.

## Cleanup rules (always applied, same result every time)
Lab files vary run to run, so the upload fixes what it safely can instead of rejecting the file:

1. **Kit IDs:** spaces trimmed, uppercased (`ffec-004-926` → `FFEC-004-926`). A valid ID is `FFEC|FRES|FORA|CFEC|CRES|CORA-###-###`.
2. **Plate controls:** rows where Sample is `Positive Control` / `Negative Control` check the run as a whole (shown under **Run controls**) and never become pet results.
3. **Rows with no kit ID:** held under **Rows with no kit ID**, grouped by the panel code on their targets (`_CGI` → dog fecal, a CFEC kit; `_RWP` → a panel Petwealth doesn't have). They're never guessed or dropped. Staff **set them aside**; to import them, fill in the Sample column and upload again.
4. **Only panel targets are results:** a target counts only if it's on that kit's panel list (`packages/domain/src/pathogens.ts`). Internal quality checks (extraction controls, NADH, GAPDH) are shown to staff as controls; anything else is left out, so a new control target can't reach a customer's report. If a left-out target was **detected**, the kit gets a review note, in case the lab renamed a real pathogen (then add it to the panel list).

The upload page shows what was done, e.g. "Cleaned before import: 12 kit IDs tidied · 162 plate control rows checked as run controls · 137 quality-check rows set aside · 3 rows with no kit ID held".

A sample ID that still isn't valid goes under **Unmatched samples** with a suggested kit where one is clear (missing dashes, spaces, the letter O for zero, one extra character). Staff enter or confirm the kit code.

## AI review (suggests only)
Right after upload, Claude (`claude-opus-5-5`, same setup as the result summaries) reads what the rules couldn't settle: unmatched samples, held rows, review notes, run controls. It writes a short summary and notes marked **Problem**, **Check** or **Note**.

- For an unmatched sample that is clearly a waiting kit written differently, a note offers **Apply: <kit>**. The server re-checks every suggestion first: the sample is unmatched in this upload, the kit exists, is waiting for results, and fits the panel. Otherwise the suggestion isn't offered.
- The AI only sees the closest waiting kits by spelling for each unmatched sample, never suggests a kit for held rows, and never changes a Cq value or a result.
- **Run review again** after assigning samples or setting rows aside. If the AI isn't available, the page says so and everything else still works.

## Done
An upload is complete once every result is released or held for rerun, every sample has a kit, and every group of held rows is set aside.
