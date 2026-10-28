import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { writePublicRelease } from "./privacy/export-public";

// Runs on Node (locally or in CI), so firebase-admin is fine here, unlike on Workers
const app = initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    // GitHub Actions secrets keep the key newlines escaped
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n")
  })
});

async function exportResults() {
  const snapshot = await getFirestore(app).collection("results").get();
  return {
    results: snapshot.docs.map(doc => ({ ...doc.data(), userId: doc.id }))
  };
}

function getFileName() {
  const now = new Date();
  return `./scripts/${now.getFullYear()}-${
    now.getMonth() + 1
  }-${now.getDate()}----${now.getUTCHours()}H-${now.getMinutes()}min.json`;
}

function writeToFile(filename: string, data: any) {
  fs.writeFile(filename, JSON.stringify(data, null, 2), (err: any) => {
    if (err) {
      console.log(err);
    }
    else {
      console.log(`[SUCCESS] ${new Date().toISOString()} JSON saved to ${filename}`);
    }
  });
}

function writeToFileSync(filename: string, data: any) {
  try {
    fs.writeFileSync(filename, JSON.stringify(data, null, 2));
    console.log(`[SUCCESS] ${new Date().toISOString()} JSON saved to ${filename}`);
  }
  catch (err) {
    console.error(`[ERROR] Failed to write ${filename}:`, err);
    throw err;
  }
}

function ensureDirectoryExists(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`[INFO] Created directory: ${dirPath}`);
  }
}

async function run() {
  console.log("exporting results");
  const data = await exportResults();

  // Public release (docs/privacy.md): coarsened, gated, written only if the gate passes,
  // e.g. --public=results/2026/data. The full private export below is unchanged
  const publicArg = process.argv.find(arg => arg.startsWith("--public="));
  if (publicArg) {
    if (!writePublicRelease(data.results, publicArg.split("=")[1], { allowRows: process.argv.includes("--allow-rows") }))
      process.exitCode = 1;
    return;
  }

  // Get output directory from command line args (e.g., --output=results/2025/data)
  const outputArg = process.argv.find(arg => arg.startsWith("--output="));

  if (outputArg) {
    // Structured output mode for results directory
    const outputDir = outputArg.split("=")[1];
    // results/ is published: the full private export (ids, timestamps, free text, flaw block)
    // must never be written there
    const resolved = path.resolve(outputDir);
    if (resolved === path.resolve("results") || resolved.startsWith(`${path.resolve("results")}${path.sep}`)) {
      console.error("[REFUSED] The full private export (ids, timestamps, free text, flaw block) cannot be written under results/, which is published. Write it to a private folder outside the repo; publish with --public (docs/privacy.md)");
      process.exitCode = 1;
      return;
    }
    ensureDirectoryExists(outputDir);

    const resultsPath = path.join(outputDir, "results.json");
    writeToFileSync(resultsPath, data);
    console.log(`[INFO] Exported results to structured directory: ${outputDir}`);
  }
  else {
    // Default behavior: timestamped file in scripts/
    writeToFile(getFileName(), data);
  }
}

run().catch((error) => {
  console.error("Error exporting results:", error);
  process.exit(1);
});
