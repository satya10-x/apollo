import mongoose from "mongoose";
import { env } from "../config/env.js";
const names = process.argv.slice(2);
if (
  !names.length ||
  names.some((name) => !/^apollo_av_\d+_[a-f0-9]{8}$/.test(name))
)
  throw new Error(
    "Provide exact disposable Athena verification database name(s).",
  );
try {
  await mongoose.connect(env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 5000,
    socketTimeoutMS: 10000,
    maxPoolSize: 1,
  });
  for (const name of names) {
    await mongoose.connection.getClient().db(name).dropDatabase();
    console.log(JSON.stringify({ database: name, cleanup: "completed" }));
  }
} catch {
  console.error("Temporary database cleanup could not connect or complete.");
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
