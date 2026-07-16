require("dotenv").config();
const express = require("express");
const path = require("path");
const verifyRoutes = require("./routes/verify");

const app = express();
const PORT = process.env.PORT || 3000;

// Label images as base64 in JSON can be a few MB; raise the default limit.
app.use(express.json({ limit: "15mb" }));

app.use("/api", verifyRoutes);
app.use(express.static(path.join(__dirname, "..", "public")));

app.listen(PORT, () => {
  console.log(`label-verify running at http://localhost:${PORT}`);
});
