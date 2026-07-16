/**
 * Calls Google Gemini (vision) to extract structured fields from a label image.
 * This is the ONE AI call per verification — comparison logic afterward is
 * plain deterministic code (see compareFields.js).
 *
 * NOTE: originally built against the Anthropic API (see git history / README
 * for context) and swapped to Gemini mid development. The extraction module is
 * isolated on purpose so this swap didn't touch comparator or route logic
 * at all — same JSON contract in, same JSON contract out.
 */

const GEMINI_MODEL = "gemini-3.5-flash";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const EXTRACTION_PROMPT = `You are looking at a photo of an alcohol beverage label. Extract the following fields exactly as they appear on the label.

If a field is not visible or not present on the label, use null (or false for booleans). Do not guess or infer values that aren't actually printed on the label.

Fields to extract:
- brand_name: string or null
- class_type: string or null (e.g. "Kentucky Straight Bourbon Whiskey")
- abv: string or null (the alcohol content exactly as printed, e.g. "45% Alc./Vol. (90 Proof)")
- net_contents: string or null (e.g. "750 mL")
- warning_present: boolean (is there a government warning statement anywhere on the label?)
- warning_text: string or null (the complete warning text transcribed exactly, INCLUDING the "GOVERNMENT WARNING:" lead-in phrase itself, not just the body that follows it)
- warning_all_caps_lead_in: boolean (does the "GOVERNMENT WARNING:" lead-in appear in bold, all-caps text on the label?)`;

// Structured schema so Gemini returns clean JSON directly, no fence-stripping needed.
// Note: Gemini's responseSchema is a proto-based subset of OpenAPI, not full JSON
// Schema — nullability is its own "nullable" field, type can't be an array like
// ["string", "null"] the way standard JSON Schema allows.
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    brand_name: { type: "string", nullable: true },
    class_type: { type: "string", nullable: true },
    abv: { type: "string", nullable: true },
    net_contents: { type: "string", nullable: true },
    warning_present: { type: "boolean" },
    warning_text: { type: "string", nullable: true },
    warning_all_caps_lead_in: { type: "boolean" },
  },
  required: [
    "brand_name",
    "class_type",
    "abv",
    "net_contents",
    "warning_present",
    "warning_text",
    "warning_all_caps_lead_in",
  ],
};

async function extractLabelFields(imageBase64, mediaType) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set in the environment");
  }

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { inline_data: { mime_type: mediaType, data: imageBase64 } },
            { text: EXTRACTION_PROMPT },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        thinkingConfig: { thinkingLevel: "low" },
      },
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errBody}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("No text response from model");
  }

  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`Failed to parse extraction response as JSON: ${text}`);
  }
}

module.exports = { extractLabelFields };
