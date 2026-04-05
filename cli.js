const fs = require('fs');
const { buildSummary } = require('./parser');
const { runFullAnalysis } = require('./analysis-runner');
const { generatePDF } = require('./pdf-generator');

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("Usage: node cli.js <path-to-excel-or-csv>");
    process.exit(1);
  }

  const filePath = args[0];
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const path = require('path');
  const allowed = ['.xlsx', '.xls', '.csv'];
  if (!allowed.includes(path.extname(filePath).toLowerCase())) {
    console.error(`❌ Unsupported file type. Allowed: ${allowed.join(', ')}`);
    process.exit(1);
  }

  try {
    console.log(`\n[Stage 1] Parsing file: ${filePath}`);
    const summary = buildSummary(filePath);
    console.log(`Detected ${summary.row_count} rows.`);
    console.log(`Columns mapped: ${Object.keys(summary.columns_detected).join(', ')}`);

    console.log(`\n[Stage 2] Running AI Analysis...`);
    const analysis = await runFullAnalysis(summary);
    console.log(`Analysis complete! Overall Score: ${analysis.overall_score} (${analysis.health_label})`);

    console.log(`\n[Stage 3] Generating PDF Report...`);
    const outputPath = filePath.replace(/\.[^/.]+$/, "") + "-bizpulse-report.pdf";
    await generatePDF(analysis, outputPath);

    console.log(`\n✅ Success! Report is ready at: ${outputPath}`);
  } catch (err) {
    console.error(`\n❌ Pipeline failed:`, err);
  }
}

main();
