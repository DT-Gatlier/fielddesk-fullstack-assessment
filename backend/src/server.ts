import express from "express";

const app = express();

const PORT = process.env.PORT || 4000;

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "fielddesk-api",
  });
});

app.listen(PORT, () => {
  console.log(`FieldDesk API running on port ${PORT}`);
});