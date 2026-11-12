import mongoose from "mongoose";
import { config } from "./config.js";

export async function connectDb() {
  mongoose.set("strictQuery", true);
  // Keep a few connections warm: opening a new TLS connection to Atlas costs ~0.5 s,
  // which otherwise lands on whichever request arrives during a burst.
  await mongoose.connect(config.mongoUri, {
    minPoolSize: Number(process.env.MONGO_MIN_POOL || 5),
    maxIdleTimeMS: 10 * 60 * 1000,
  });
}

export async function disconnectDb() {
  await mongoose.disconnect();
}
