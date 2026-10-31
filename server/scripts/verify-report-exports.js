// Layout QA only. Fixtures are never inserted into MongoDB or application history.
import { mkdir, writeFile } from "node:fs/promises";
import { reportFixture } from "../tests/helpers/reportFixture.js";
import { reportProvider } from "../tests/helpers/reportProvider.js";
import { generateReport } from "../services/reports/generate.js";
import { exportPDF } from "../services/reports/pdf.js";
import { exportMarkdown } from "../services/reports/markdown.js";
const fixture = await reportFixture();
fixture.state.topic =
  "Export validation fixture - not a research report / भारत";
fixture.state.blueprint.objective =
  "Verify layout, source links, citation destinations and saved report structure.";
fixture.state.blueprint.scope =
  "Synthetic unit-test data used solely to validate the export engine. No application records are created.";
const { data } = await generateReport({
  ...fixture,
  providers: reportProvider(),
});
data.createdAt = fixture.now;
data.limitations.push(
  "Export validation fixture only. The statements and source addresses in this file are test fixtures, not completed research.",
);
await mkdir("tmp/pdfs", { recursive: true });
await writeFile("tmp/pdfs/report-export-fixture.pdf", await exportPDF(data));
await writeFile("tmp/pdfs/report-export-fixture.md", exportMarkdown(data));
console.log("Created isolated export QA fixtures in tmp/pdfs.");
