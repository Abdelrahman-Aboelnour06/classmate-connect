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

async function loadSourcePage(page, sourceUrl) {
  await page.goto(sourceUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("table tr", { timeout: 60000 });
}

export async function scrapeToMasterCsv(options = {}) {
  const sourceUrl = options.sourceUrl || process.env.SCRAPE_SOURCE_URL || "https://stds.eng.cu.edu.eg/ClassList.aspx?s=1";
  const outputCsv = options.outputCsv || path.join(process.cwd(), "backend", "data", "master_schedule.csv");
  const tempDir = path.join(os.tmpdir(), "classmate-connect-scrape");

  ensureCleanDir(tempDir);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const discoveryPage = await context.newPage();
  const allRows = [];

  try {
    await loadSourcePage(discoveryPage, sourceUrl);
    const trHandles = await discoveryPage.locator("table tr").all();
    const tasks = [];

    for (let rowIndex = 0; rowIndex < trHandles.length; rowIndex += 1) {
      const tr = trHandles[rowIndex];
      const cells = await tr.locator("td").allTextContents();
      if (cells.length < 6) continue;

      const classMeta = parseMainRow(cells.slice(0, 8));
      if (!classMeta.course_code || !classMeta.day_of_week || !classMeta.start_time || !classMeta.end_time) {
        continue;
      }

      if (await tr.locator("a").first().count()) tasks.push({ rowIndex, classMeta });
    }

    let nextTask = 0;
    const requestedWorkers = Number.parseInt(process.env.SCRAPE_WORKERS || "4", 10);
    const workerCount = Math.min(Math.max(requestedWorkers || 4, 1), tasks.length || 1);
    const workers = Array.from({ length: workerCount }, async (_, workerId) => {
      const page = await context.newPage();
      try {
        await loadSourcePage(page, sourceUrl);

        while (nextTask < tasks.length) {
          const task = tasks[nextTask++];
          const row = page.locator("table tr").nth(task.rowIndex);
          const link = row.locator("a").first();
          let downloadedPath = "";

          try {
            const [download] = await Promise.all([
              page.waitForEvent("download", { timeout: 20000 }),
              link.click(),
            ]);
            downloadedPath = path.join(tempDir, `${workerId}-${task.rowIndex}-${download.suggestedFilename() || `${Date.now()}.xlsx`}`);
            await download.saveAs(downloadedPath);
          } catch {
            continue;
          }

          if (!downloadedPath || !fs.existsSync(downloadedPath) || fs.statSync(downloadedPath).size === 0) continue;
          allRows.push(...parseRosterSpreadsheet(downloadedPath, task.classMeta));
        }
      } finally {
        await page.close();
      }
    });

    await Promise.all(workers);
  } finally {
    await discoveryPage.close();
    await context.close();
    await browser.close();
    ensureCleanDir(tempDir);
  }

  fs.mkdirSync(path.dirname(outputCsv), { recursive: true });
  const csvData = stringify(allRows, { header: true });
  fs.writeFileSync(outputCsv, csvData, "utf8");

  return { outputCsv, records: allRows.length };
}
