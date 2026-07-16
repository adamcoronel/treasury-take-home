const express = require("express");
const { extractLabelFields } = require("../lib/extractLabel");
const { compareAll } = require("../lib/compareFields");

const router = express.Router();

/**
 * Core logic shared by single and batch verification. Kept as one function
 * so batch is just "call this in a loop" rather than a separate code path.
 */
async function verifyOne({ application, label_image, media_type }) {
  if (!label_image || !media_type) {
    return { error: "Missing label_image or media_type" };
  }
  if (!application) {
    return { error: "Missing application data" };
  }

  const extracted = await extractLabelFields(label_image, media_type);
  console.log("Extracted fields:", JSON.stringify(extracted, null, 2));
  const comparison = compareAll(application, extracted);

  return { extracted, comparison };
}

// POST /api/verify — single label + application pair
router.post("/verify", async (req, res) => {
  const start = Date.now();
  try {
    const result = await verifyOne(req.body);
    if (result.error) {
      return res.status(400).json(result);
    }
    res.json({ ...result, elapsed_ms: Date.now() - start });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/verify-batch — { items: [{ application, label_image, media_type }, ...] }
router.post("/verify-batch", async (req, res) => {
  const start = Date.now();
  const { items } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Missing or empty items array" });
  }

  // Processed with a small concurrency cap rather than unbounded
  // Promise.all, so a 200-label batch doesn't fire 200 simultaneous
  // requests at the Anthropic API at once.
  const CONCURRENCY = 5;
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      try {
        results[i] = { index: i, ...(await verifyOne(items[i])) };
      } catch (err) {
        results[i] = { index: i, error: err.message };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker)
  );

  res.json({ results, elapsed_ms: Date.now() - start });
});

module.exports = router;
