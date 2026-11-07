import { config } from "./config.js";
import { connectDb } from "./db.js";
import { createApp } from "./app.js";

const app = createApp();
await connectDb();
app.listen(config.port, () => {
  console.log(`ArivuVazhi API listening on http://localhost:${config.port}`);
});
