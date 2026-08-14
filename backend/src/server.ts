import "dotenv/config";
import app from "./app";

const PORT = process.env.PORT || 4000;

const server = app.listen(PORT, () => {
  console.log(`FieldDesk API running on port ${PORT}`);
});

export default server;
