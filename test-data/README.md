# Test labels

Six generated label images, each paired with application data in `application-data.json`, covering the core scenarios from the design phase:

| File | Tests |
|---|---|
| `case1_obvious_pass.png` | Everything matches — baseline happy path |
| `case2_abv_mismatch.png` | Clear numeric mismatch (application vs label) |
| `case3_formatting_near_match.png` | Casing-only difference (Dave's "STONE'S THROW" case) — should still PASS |
| `case4_missing_warning.png` | No government warning on the label at all |
| `case5_warning_formatting_issue.png` | Correct warning wording, wrong formatting (title case, not bold) — should WARN, not FAIL |
| `case6_missing_field.png` | Net contents missing entirely from the label |

To test: open the app, pick a case's `.png` as the label image, and type in the matching `application` fields from `application-data.json`. Compare the result against that case's `expected` field.

Generated with a Python/Pillow script (not photorealistic — clean and legible on purpose, since image-quality robustness is an out-of-scope stretch goal, not the thing being tested here).
