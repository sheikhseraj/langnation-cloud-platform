
const express = require("express");

const app = express();

const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.json({
    application: "LangNation Cloud Platform",
    environment: process.env.NODE_ENV || "development",
    status: "running",
    message: "LangNation Cloud Platform API is running successfully."
  });
});

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy"
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`LangNation application running on port ${PORT}`);
});