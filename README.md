# Label verification prototype

Checks whether an alcohol label image matches its application data. Built for the TTB label compliance take-home.

## Process

1. **Requirements** — extracted as user stories ("As a &lt;role&gt;, I want &lt;behavior&gt; so that &lt;benefit&gt;") directly from the stakeholder interview notes in the brief, rather than starting from assumed features.
2. **Personas** — Jenny (primary user, high tech comfort), Dave (skeptical veteran, low tech comfort — stress-tests usability and false positives), Sarah (manager, cares about speed/adoption).
3. **Scenarios** — concrete walkthroughs per persona (obvious pass, obvious mismatch, formatting-only near-match, missing warning, warning present but misformatted, batch upload), used to define the tri-state PASS/WARNING/FAIL model before writing any matching logic.
4. **Architecture sketch** — decided on a single AI call (vision extraction) followed by deterministic comparison logic, specifically to keep results fast and explainable, before touching code.
5. **Low-fidelity prototype** — wireframed the single-verification screen to validate the information hierarchy (upload → per-field results) before building it for real.
6. **Implementation** — scaffolded the repo, built the comparator logic first and unit-tested it standalone (no API dependency), then wired up AI extraction, then the frontend.
7. **Test data** — generated synthetic label images covering each scenario from step 3, each paired with expected output, so the comparator could be validated end-to-end.
8. **Debugging & iteration** — mid-build AI provider swap (Anthropic → Gemini) due to an account hold unrelated to the code; fixed a Gemini schema-format incompatibility, a deprecated model ID, an overly strict warning-text comparison surfaced by real extraction output, and default "thinking" latency — each diagnosed from an actual error or observed result rather than guessed at.

## Setup

```bash
npm install
cp .env.example .env   # add your GEMINI_API_KEY (free key: aistudio.google.com)
npm start               # http://localhost:3000
```

## Approach

- **One AI call per verification.** Google Gemini's vision API reads structured fields off the label image (`server/lib/extractLabel.js`). Everything after that — the actual pass/fail logic — is plain deterministic JS (`server/lib/compareFields.js`), not a second AI call. This keeps latency low and makes every result explainable ("why did this fail?" has a concrete answer).
- **Note on model choice:** this was originally built against the Anthropic API and swapped to Gemini partway through development, due to an Anthropic account hold unrelated to this project blocking API billing. The extraction module is isolated behind one function (`extractLabelFields`) specifically so a provider swap wouldn't touch the comparator or route logic — same JSON contract in, same JSON contract out. Either provider works equally well here; this isn't a statement about model quality.
- **Tri-state matching, not boolean.** Each field returns `PASS`, `WARNING`, or `FAIL`:
  - `PASS` — exact match (case/whitespace/punctuation-insensitive)
  - `WARNING` — close but not identical (e.g. minor typo) — flagged for a human to glance at, not auto-rejected
  - `FAIL` — clearly different, or missing entirely
- **Batch mode reuses the single-verification function** in a loop with a concurrency cap of 5, rather than a separate code path.
- Match rules are intentionally simple (obvious matches pass, obvious mismatches fail) rather than a precise implementation of TTB's actual adjudication standards — out of scope for this prototype.

## Assumptions & trade-offs

- **No persistent storage.** Nothing is written to disk or a database; results exist only for the request/response cycle.
- **No auth.** Out of scope for a prototype.
- **No COLA integration.** Standalone tool per the discovery notes — not wired into the existing system.
- **External API dependency.** This calls the Gemini API directly, which conflicts with the note that the target network blocks a lot of outbound traffic. A production version would likely need a vision model hosted in the agency's own VPC/cloud environment rather than calling a public API.
- **Free-tier data usage.** Gemini's free tier may use submitted inputs/outputs to improve Google's models. Fine for a prototype with synthetic test labels, but a real deployment handling actual applicant data would need the paid tier (which opts out of this) or an on-prem model.
- **Image quality handling is out of scope.** Angled photos, glare, poor lighting — the prototype assumes a reasonably legible image, consistent with treating this as a known limitation rather than building it under time constraints.
- **Field extraction accuracy depends on the vision model** — this isn't validated against a large or adversarial label test set.

## Testing

`server/lib/compareFields.js` has no external dependencies, so its logic can be sanity-checked directly:

```bash
node -e '
const { compareAll } = require("./server/lib/compareFields");
console.log(compareAll(
  { brand_name: "Old Tom Distillery", class_type: "x", abv: "45%", net_contents: "750 mL" },
  { brand_name: "OLD TOM DISTILLERY", class_type: "x", abv: "45%", net_contents: "750 mL", warning_present: true, warning_text: "...", warning_all_caps_lead_in: true }
));
'
```
