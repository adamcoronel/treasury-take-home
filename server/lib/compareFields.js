/**
 * Rule-based comparator: application data vs. AI-extracted label fields.
 *
 * Deliberately NOT another AI call. Deterministic + fast + explainable to a
 * non-technical reviewer ("why did this fail?" has a real answer, not "the
 * model said so"). This also satisfies the ~5 second latency requirement,
 * since only ONE AI call happens per verification (extraction), not two.
 *
 * Scope note: match rules are intentionally simple ("obviously same" passes,
 * "obviously different" fails, "close but not exact" warns) rather than a
 * precise implementation of TTB's actual adjudication standards. See README.
 */

const REQUIRED_WARNING_TEXT =
  "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not " +
  "drink alcoholic beverages during pregnancy because of the risk of birth " +
  "defects. (2) Consumption of alcoholic beverages impairs your ability to " +
  "drive a car or operate machinery, and may cause health problems.";

function normalize(str) {
  if (!str) return "";
  return str
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u2018\u2019]/g, "'") // curly quotes -> straight
    .replace(/[^a-z0-9%. ]/g, "") // strip punctuation except % and .
    .replace(/\s+/g, " ")
    .trim();
}

// Simple Levenshtein distance for "how close is close enough" fuzzy matching.
function levenshtein(a, b) {
  const m = a.length,
    n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

/**
 * Compares one text field. Returns { status: 'PASS'|'WARNING'|'FAIL', reason }
 */
function compareTextField(fieldLabel, applicationValue, extractedValue) {
  if (!extractedValue || !extractedValue.trim()) {
    return {
      status: "FAIL",
      reason: `${fieldLabel} was not found on the label image`,
    };
  }
  if (!applicationValue || !applicationValue.trim()) {
    return {
      status: "FAIL",
      reason: `${fieldLabel} was not provided in the application data`,
    };
  }

  const a = normalize(applicationValue);
  const b = normalize(extractedValue);

  if (a === b) {
    return { status: "PASS", reason: "Exact match" };
  }

  // Fuzzy: allow small edit distance relative to string length (formatting-
  // level differences like "Stone's Throw" vs "STONE'S THROW" already get
  // caught by normalize(); this catches things like minor punctuation drift).
  const maxLen = Math.max(a.length, b.length);
  const distance = levenshtein(a, b);
  const similarity = 1 - distance / maxLen;

  if (similarity >= 0.85) {
    return {
      status: "WARNING",
      reason: `Close but not identical (application: "${applicationValue}", label: "${extractedValue}") — likely the same value, worth a human glance`,
    };
  }

  return {
    status: "FAIL",
    reason: `Application says "${applicationValue}", label says "${extractedValue}"`,
  };
}

/**
 * ABV gets its own comparator: pull the numeric percentage out of each
 * string and compare numerically, since formatting varies a lot
 * ("45%", "45% Alc./Vol.", "45.0 percent") but the number is what matters.
 */
function compareAbv(applicationValue, extractedValue) {
  if (!extractedValue) {
    return { status: "FAIL", reason: "Alcohol content was not found on the label image" };
  }
  if (!applicationValue) {
    return { status: "FAIL", reason: "Alcohol content was not provided in the application data" };
  }

  const extractNumber = (s) => {
    const match = s.match(/(\d+(\.\d+)?)\s*%/);
    return match ? parseFloat(match[1]) : null;
  };

  const appNum = extractNumber(applicationValue);
  const labelNum = extractNumber(extractedValue);

  if (appNum === null || labelNum === null) {
    // Couldn't parse a number from one side — fall back to text comparison.
    return compareTextField("Alcohol content", applicationValue, extractedValue);
  }

  if (appNum === labelNum) {
    return { status: "PASS", reason: "Exact match" };
  }

  if (Math.abs(appNum - labelNum) <= 0.1) {
    return {
      status: "WARNING",
      reason: `Very close but not identical (application: ${appNum}%, label: ${labelNum}%)`,
    };
  }

  return {
    status: "FAIL",
    reason: `Application says ${appNum}%, label says ${labelNum}%`,
  };
}

/**
 * Government warning gets its own comparator: presence, correct legal
 * wording, and formatting (all-caps lead-in) are three separate concerns
 * per Jenny's interview notes, so they get distinct failure reasons.
 */
function compareWarning(extracted) {
  const { warning_present, warning_text, warning_all_caps_lead_in } = extracted || {};

  if (!warning_present || !warning_text || !warning_text.trim()) {
    return { status: "FAIL", reason: "No government warning statement found on label" };
  }

  // Vision extraction of wrapped, multi-line legal text can introduce tiny
  // transcription artifacts (a dropped space at a line break, etc.) without
  // the actual wording being wrong — so this gets the same fuzzy tolerance
  // as the other fields rather than requiring byte-exact equality.
  const a = normalize(warning_text);
  const b = normalize(REQUIRED_WARNING_TEXT);
  const distance = levenshtein(a, b);
  const similarity = 1 - distance / Math.max(a.length, b.length);

  if (similarity < 0.9) {
    return {
      status: "FAIL",
      reason: "Warning statement text does not match the required wording",
    };
  }

  if (!warning_all_caps_lead_in) {
    return {
      status: "WARNING",
      reason: '"GOVERNMENT WARNING:" lead-in does not appear to be bold/all-caps as required — needs visual confirmation',
    };
  }

  if (similarity < 1) {
    return {
      status: "WARNING",
      reason: "Wording is very close to required text but not an exact match — worth a human glance",
    };
  }

  return { status: "PASS", reason: "Wording and formatting match requirements" };
}

/**
 * Runs the full comparison for one label + application pair.
 * @param {object} application - fields as submitted in the application
 * @param {object} extracted - fields as extracted from the label image by AI
 */
function compareAll(application, extracted) {
  const results = {
    brand_name: compareTextField("Brand name", application.brand_name, extracted.brand_name),
    class_type: compareTextField("Class/type", application.class_type, extracted.class_type),
    abv: compareAbv(application.abv, extracted.abv),
    net_contents: compareTextField("Net contents", application.net_contents, extracted.net_contents),
    government_warning: compareWarning(extracted),
  };

  const statuses = Object.values(results).map((r) => r.status);
  const overall = statuses.includes("FAIL")
    ? "FAIL"
    : statuses.includes("WARNING")
    ? "WARNING"
    : "PASS";

  return { overall, fields: results };
}

module.exports = { compareAll, REQUIRED_WARNING_TEXT };
