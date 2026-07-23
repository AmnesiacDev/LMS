import "dotenv/config";
import mongoose from "mongoose";
import Db_Connection from "../Configs/DbConfig.js";

const args = new Set(process.argv.slice(2));
const isDryRun = args.has("--dry-run");
const isConfirmed = args.has("--confirm");

const getLabel = () => {
  const labelArg = process.argv.find((argument) => argument.startsWith("--label="));
  return labelArg ? labelArg.slice("--label=".length) : "unlabelled";
};

async function resetDatabase() {
  await Db_Connection();

  try {
    const collections = await mongoose.connection.db.listCollections({}, { nameOnly: true }).toArray();
    const userCollections = collections.filter(({ name }) => !name.startsWith("system."));
    const counts = await Promise.all(
      userCollections.map(async ({ name }) => ({
        name,
        count: await mongoose.connection.db.collection(name).countDocuments(),
      })),
    );
    const totalDocuments = counts.reduce((sum, collection) => sum + collection.count, 0);
    const database = `${mongoose.connection.host}/${mongoose.connection.name}`;

    console.log(`Target label: ${getLabel()}`);
    console.log(`Application environment: ${process.env.NODE_ENV || "not set"}`);
    console.log(`Target database: ${database}`);
    console.log(`Collections: ${counts.length}; documents to remove: ${totalDocuments}`);

    if (isDryRun) {
      console.log("Dry run complete. No data was changed.");
      return;
    }

    if (!isConfirmed) {
      throw new Error("Refusing to delete data without --confirm. Use --dry-run to inspect the target first.");
    }

    await Promise.all(userCollections.map(({ name }) => mongoose.connection.db.collection(name).deleteMany({})));
    console.log(`Removed ${totalDocuments} documents from ${counts.length} collections.`);
    console.log("Indexes were preserved.");
  } finally {
    await mongoose.connection.close();
  }
}

resetDatabase().catch((error) => {
  console.error("Database reset failed:", error.message);
  process.exitCode = 1;
});
