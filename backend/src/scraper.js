import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import XLSX from "xlsx";
import { stringify } from "csv-stringify/sync";
import { extractLocationCode, to24Hour } from "./utils.js";

function ensureCleanDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  for (const item of fs.readdirSync(dirPath)) {
    fs.rmSync(path.join(dirPath, item), { recursive: true, force: true });
  }
}

function parseMainRow(columns) {
  const [courseCode = "", courseName = "", location = "", classType = "", day = "", start = "", end = "", group = ""] = columns;
  return {
    course_code: String(courseCode).trim().toUpperCase(),
    course_name: String(courseName).trim(),
    location: extractLocationCode(location),
    class_type: String(classType).trim() || "Lecture",
    day_of_week: String(day).trim(),
    start_time: to24Hour(start),
    end_time: to24Hour(end),
    group_number: String(group).trim(),
  };
}

function parseRosterSpreadsheet(filePath, classMeta) {
  const wb = XLSX.readFile(filePath);
  const firstSheetName = wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[firstSheetName], { defval: "" });

  const out = [];
  for (const row of rows) {
    const values = Object.values(row).map((v) => String(v).trim());
    const studentId = values.find((v) => /^\d{6,}$/.test(v)) || values[0] || "";
    const name = values[1] || values[0] || "";
    const nameAr = values[2] || "";

    if (!studentId || !name) continue;

    out.push({
      student_id: studentId,
      student_name: name,
      student_name_ar: nameAr,
      ...classMeta,
    });
  }

  return out;
}

export async function scrapeToMasterCsv(options = {}) {
  const sourceUrl = options.sourceUrl || process.env.SCRAPE_SOURCE_URL || "https://stds.eng.cu.edu.eg/ClassList.aspx?s=1";
  const outputCsv = options.outputCsv || path.join(process.cwd(), "backend", "data", "master_schedule.csv");
  const tempDir = path.join(os.tmpdir(), "classmate-connect-scrape");

  ensureCleanDir(tempDir);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  const allRows = [];

  try {
    await page.goto(sourceUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1500);

    const trHandles = await page.locator("table tr").all();
    for (const tr of trHandles) {
      const cells = await tr.locator("td").allTextContents();
      if (cells.length < 6) continue;

      const classMeta = parseMainRow(cells.slice(0, 8));
      if (!classMeta.course_code || !classMeta.day_of_week || !classMeta.start_time || !classMeta.end_time) {
        continue;
      }

      const link = tr.locator("a").first();
      const linkCount = await link.count();
      if (!linkCount) continue;

      ensureCleanDir(tempDir);

      let downloadedPath = "";
      try {
        const [download] = await Promise.all([
          page.waitForEvent("download", { timeout: 20000 }),
          link.click(),
        ]);

        downloadedPath = path.join(tempDir, download.suggestedFilename() || `${Date.now()}.xlsx`);
        await download.saveAs(downloadedPath);
      } catch {
        continue;
      }

      if (!downloadedPath || !fs.existsSync(downloadedPath) || fs.statSync(downloadedPath).size === 0) {
        continue;
      }

      const rosterRows = parseRosterSpreadsheet(downloadedPath, classMeta);
      allRows.push(...rosterRows);

      ensureCleanDir(tempDir);
    }
  } finally {
    await context.close();
    await browser.close();
    ensureCleanDir(tempDir);
  }

  fs.mkdirSync(path.dirname(outputCsv), { recursive: true });
  const csvData = stringify(allRows, { header: true });
  fs.writeFileSync(outputCsv, csvData, "utf8");

  return { outputCsv, records: allRows.length };
}
