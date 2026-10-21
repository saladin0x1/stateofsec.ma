/**
 * Standalone script to validate all survey YAML files
 * This can be run independently or as part of the build process
 */
/* eslint-disable node/prefer-global/process */

import { SURVEY_DIR } from "../src/lib/validators/constants";
import {
  formatErrorsOnly,
  formatValidationReport,
  validateAllSurveyFiles
} from "../src/lib/validators/survey-validator";

async function main() {
  // Check for --verbose flag
  const isVerbose = process.argv.includes("--verbose");

  console.log("Validating survey YAML files...\n");

  const validationReport = validateAllSurveyFiles(SURVEY_DIR);

  if (isVerbose) {
    // Verbose mode: show full report
    console.log(formatValidationReport(validationReport));
  }
  else {
    // Default mode: show only errors or success message
    if (validationReport.success) {
      // No errors, just show success
      console.log("[OK] All validations passed!");
      process.exit(0);
    }
    else {
      // Show only ERROR-level issues
      const errorsOutput = formatErrorsOnly(validationReport);
      if (errorsOutput) {
        console.log(errorsOutput);
      }
    }
  }

  if (validationReport.success) {
    if (isVerbose) {
      console.log("\n[OK] All validations passed!");
    }
    process.exit(0);
  }
  else {
    console.error("\n[X] Validation failed! Please fix the errors above.");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Error validating survey:", error);
  process.exit(1);
});
