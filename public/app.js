// ---------- Tabs ----------
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`${btn.dataset.tab}-tab`).classList.add("active");
  });
});

// ---------- Helpers ----------
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function renderResultCard(title, data) {
  if (data.error) {
    return `<div class="result-card">
      <div class="result-header"><h3>${title}</h3><span class="overall-badge FAIL">Error</span></div>
      <p class="field-reason">${data.error}</p>
    </div>`;
  }

  const { comparison } = data;
  const fieldLabels = {
    brand_name: "Brand name",
    class_type: "Class / type",
    abv: "Alcohol content",
    net_contents: "Net contents",
    government_warning: "Government warning",
  };

  const rows = Object.entries(comparison.fields)
    .map(
      ([key, result]) => `
      <div class="field-result">
        <span class="field-name">${fieldLabels[key] || key}</span>
        <span class="badge ${result.status}">${result.status}</span>
        <span class="field-reason">${result.reason}</span>
      </div>`
    )
    .join("");

  return `<div class="result-card">
    <div class="result-header">
      <h3>${title}</h3>
      <span class="overall-badge ${comparison.overall}">${comparison.overall}</span>
    </div>
    ${rows}
  </div>`;
}

// ---------- Single mode ----------
const singleForm = document.getElementById("single-form");
singleForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const submitBtn = document.getElementById("single-submit");
  const statusEl = document.getElementById("single-status");
  const resultsEl = document.getElementById("single-results");

  const imageFile = document.getElementById("single-image").files[0];
  if (!imageFile) return;

  submitBtn.disabled = true;
  statusEl.textContent = "Verifying...";
  resultsEl.innerHTML = "";

  try {
    const base64 = await fileToBase64(imageFile);
    const start = Date.now();

    const res = await fetch("/api/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label_image: base64,
        media_type: imageFile.type,
        application: {
          brand_name: document.getElementById("single-brand").value,
          class_type: document.getElementById("single-class").value,
          abv: document.getElementById("single-abv").value,
          net_contents: document.getElementById("single-net").value,
        },
      }),
    });

    const data = await res.json();
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    if (!res.ok) {
      statusEl.textContent = `Error: ${data.error}`;
    } else {
      statusEl.textContent = `Done in ${elapsed}s`;
      resultsEl.innerHTML = renderResultCard(imageFile.name, data);
    }
  } catch (err) {
    statusEl.textContent = `Error: ${err.message}`;
  } finally {
    submitBtn.disabled = false;
  }
});

// ---------- Batch mode ----------
let batchCount = 0;

function addBatchItem() {
  batchCount++;
  const id = batchCount;
  const div = document.createElement("div");
  div.className = "batch-item";
  div.dataset.id = id;
  div.innerHTML = `
    <button type="button" class="remove-item" data-remove="${id}">Remove</button>
    <div class="field-row">
      <label>Label image</label>
      <input type="file" accept="image/*" class="batch-image" required />
    </div>
    <div class="grid-2">
      <div class="field-row"><label>Brand name</label><input type="text" class="batch-brand" required /></div>
      <div class="field-row"><label>Class / type</label><input type="text" class="batch-class" required /></div>
      <div class="field-row"><label>Alcohol content</label><input type="text" class="batch-abv" required /></div>
      <div class="field-row"><label>Net contents</label><input type="text" class="batch-net" required /></div>
    </div>
  `;
  document.getElementById("batch-items").appendChild(div);

  div.querySelector(`[data-remove="${id}"]`).addEventListener("click", () => div.remove());
}

document.getElementById("add-batch-item").addEventListener("click", addBatchItem);
addBatchItem(); // start with one row

document.getElementById("submit-batch").addEventListener("click", async () => {
  const statusEl = document.getElementById("batch-status");
  const resultsEl = document.getElementById("batch-results");
  const submitBtn = document.getElementById("submit-batch");

  const itemDivs = Array.from(document.querySelectorAll(".batch-item"));
  if (itemDivs.length === 0) return;

  submitBtn.disabled = true;
  statusEl.textContent = `Verifying ${itemDivs.length} labels...`;
  resultsEl.innerHTML = "";

  try {
    const items = await Promise.all(
      itemDivs.map(async (div) => {
        const file = div.querySelector(".batch-image").files[0];
        const base64 = file ? await fileToBase64(file) : null;
        return {
          _filename: file ? file.name : "(no file)",
          label_image: base64,
          media_type: file ? file.type : null,
          application: {
            brand_name: div.querySelector(".batch-brand").value,
            class_type: div.querySelector(".batch-class").value,
            abv: div.querySelector(".batch-abv").value,
            net_contents: div.querySelector(".batch-net").value,
          },
        };
      })
    );

    const start = Date.now();
    const res = await fetch("/api/verify-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: items.map(({ _filename, ...rest }) => rest) }),
    });
    const data = await res.json();
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    if (!res.ok) {
      statusEl.textContent = `Error: ${data.error}`;
    } else {
      statusEl.textContent = `Done in ${elapsed}s (${items.length} labels)`;
      resultsEl.innerHTML = data.results
        .map((r, i) => renderResultCard(items[i]._filename, r))
        .join("");
    }
  } catch (err) {
    statusEl.textContent = `Error: ${err.message}`;
  } finally {
    submitBtn.disabled = false;
  }
});
