#!/usr/bin/env node
/**
 * CLI entry point: imports a CSV into the normalized SQLite DB.
 *
 * Usage:
 *   node src/run-migration.js [path/to/master_schedule.csv]
 *
 * If no path is given it defaults to backend/data/master_schedule.csv
 */
import path from "node:path";
import { migrateCsvToDb } from "./migration.js";

const csvPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(process.cwd(), "backend", "data", "master_schedule.csv");

console.log(`\n📂 Importing CSV into DB: ${csvPath}\n`);

try {
  const stats = migrateCsvToDb(csvPath);
  console.log("\n✅ Migration complete:");
  console.log(`   Students : ${stats.students}`);
  console.log(`   Courses  : ${stats.courses}`);
  console.log(`   Classes  : ${stats.classes}`);
  console.log(`   Schedules: ${stats.schedules}`);
  if (stats.errors && stats.errors.length > 0) {
    console.warn(`   ⚠ ${stats.errors.length} row-level warnings (see above)`);
  }
} catch (err) {
  console.error("❌ Migration failed:", err.message || err);
  process.exit(1);
}
