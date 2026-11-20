
import { config } from "./config.js";
import { connectDb } from "./db.js";
import { createApp } from "./app.js";
import { backfillMockQuestionSources, backfillSeen, backfillStemKeys, startDailyMockScheduler } from "./jobs.js";
import { failStaleJobs } from "./pyq/discovery.js";
import { startCurrentAffairsScheduler } from "./current-affairs.js";

const app = createApp();

await connectDb();
startDailyMockScheduler();
startCurrentAffairsScheduler();
void backfillStemKeys()
  .then((count) => count && console.log(`Backfilled stemKey on ${count} questions.`))
  .catch((error) => console.warn(`stemKey backfill failed: ${error?.message || error}`));
// Discovery jobs cannot survive a restart: close any left "running".
void failStaleJobs(true)
  .then((count) => count && console.log(`Marked ${count} interrupted PYQ discovery job(s) as failed.`))
  .catch((error) => console.warn(`PYQ job cleanup failed: ${error?.message || error}`));
void backfillSeen()
  .then((count) => count && console.log(`Recorded ${count} previously shown questions so the shared pool never repeats them.`))
  .catch((error) => console.warn(`Seen backfill failed: ${error?.message || error}`));
void backfillMockQuestionSources()
  .then((count) => count && console.log(`Marked ${count} questions as daily-mock questions.`))
  .catch((error) => console.warn(`Mock question source backfill failed: ${error?.message || error}`));

app.listen(config.port, "0.0.0.0", () => {
  console.log(`ArivuVazhi API listening on port ${config.port}`);
});
