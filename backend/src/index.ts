
import { config } from "./config.js";
import { connectDb } from "./db.js";
import { createApp } from "./app.js";
import { backfillStemKeys, startDailyMockScheduler } from "./jobs.js";

const app = createApp();

await connectDb();
startDailyMockScheduler();
void backfillStemKeys()
  .then((count) => count && console.log(`Backfilled stemKey on ${count} questions.`))
  .catch((error) => console.warn(`stemKey backfill failed: ${error?.message || error}`));

app.listen(config.port, "0.0.0.0", () => {
  console.log(`ArivuVazhi API listening on port ${config.port}`);
});
