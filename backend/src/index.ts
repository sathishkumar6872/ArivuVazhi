
import { config } from "./config.js";
import { connectDb } from "./db.js";
import { createApp } from "./app.js";

const app = createApp();

await connectDb();

app.listen(config.port, "0.0.0.0", () => {
  console.log(`ArivuVazhi API listening on port ${config.port}`);
});
