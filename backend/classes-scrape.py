import argparse
import os
import shutil
import subprocess
import time
from concurrent.futures import ProcessPoolExecutor, as_completed

import pandas as pd
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from webdriver_manager.chrome import ChromeDriverManager


DEFAULT_URL = "https://stds.eng.cu.edu.eg/ClassList.aspx?s=1"
DEFAULT_OUTPUT = "Fall-27-1.csv"
DEFAULT_WORKERS = 8
DEFAULT_DOWNLOAD_TIMEOUT = 20
DEFAULT_STAGGER_SECONDS = 2


def clean_temp_dir(temp_dir: str) -> None:
    if os.path.exists(temp_dir):
        for filename in os.listdir(temp_dir):
            file_path = os.path.join(temp_dir, filename)
            try:
                if os.path.isfile(file_path) or os.path.islink(file_path):
                    os.unlink(file_path)
                elif os.path.isdir(file_path):
                    shutil.rmtree(file_path)
            except Exception as exc:
                print(f"Failed to delete {file_path}: {exc}")


def setup_driver(temp_dir: str, driver_path: str, headless: bool = True) -> webdriver.Chrome:
    if os.path.exists(temp_dir):
        shutil.rmtree(temp_dir)
    os.makedirs(temp_dir, exist_ok=True)

    options = Options()
    if headless:
        options.add_argument("--headless=new")
    options.add_argument("--disable-gpu")
    options.add_argument("--window-size=1920,1080")
    options.add_experimental_option(
        "prefs",
        {
            "download.default_directory": temp_dir,
            "download.prompt_for_download": False,
            "safebrowsing.enabled": True,
        },
    )

    service = Service(driver_path)
    return webdriver.Chrome(service=service, options=options)


def wait_for_excel_download(temp_dir: str, timeout_seconds: int = 10) -> str | None:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        time.sleep(0.5)
        files = [
            f
            for f in os.listdir(temp_dir)
            if (f.endswith(".xlsx") or f.endswith(".xls")) and not f.endswith(".crdownload")
        ]
        if files:
            candidate = os.path.join(temp_dir, files[0])
            if os.path.getsize(candidate) > 0:
                return candidate
    return None


def scrape_row_range(
    worker_id: int,
    url: str,
    indices: list[int],
    total_rows: int,
    base_temp_dir: str,
    driver_path: str,
    headless: bool,
    download_timeout: int,
    stagger_seconds: int,
) -> list[dict]:
    if stagger_seconds:
        time.sleep(worker_id * stagger_seconds)

    temp_dir = f"{base_temp_dir}_worker{worker_id}"
    driver = None
    records: list[dict] = []

    try:
        driver = setup_driver(temp_dir, driver_path, headless=headless)
        print(f"[worker {worker_id}] Opening page for {len(indices)} rows", flush=True)
        driver.get(url)
        time.sleep(5)

        for index in indices:
            clean_temp_dir(temp_dir)
            try:
                row = driver.find_elements(By.XPATH, "//table[@id='GridView1']//tr")[index + 1]
                cols = row.find_elements(By.TAG_NAME, "td")
                if len(cols) < 9:
                    continue

                course_info = {
                    "course_code": cols[0].text.strip(),
                    "course_name": cols[1].text.strip(),
                    "location": cols[2].text.strip(),
                    "type": cols[3].text.strip(),
                    "day": cols[4].text.strip(),
                    "start": cols[5].text.strip(),
                    "end": cols[6].text.strip(),
                    "group": cols[7].text.strip(),
                }

                try:
                    row.find_element(By.LINK_TEXT, "Download").click()
                except Exception:
                    cols[8].find_element(By.TAG_NAME, "a").click()

                downloaded_file = wait_for_excel_download(temp_dir, download_timeout)
                if not downloaded_file:
                    print(f"[worker {worker_id}] [{index + 1}/{total_rows}] Timeout: {course_info['course_code']}", flush=True)
                    continue

                try:
                    df = pd.read_excel(downloaded_file)
                    for _, s_row in df.iterrows():
                        student_id = str(s_row.iloc[1]).replace(".0", "").strip()
                        student_name = str(s_row.iloc[3]).strip()
                        student_name_ar = str(s_row.iloc[2]).strip() if len(s_row) > 2 else ""
                        if student_name_ar.lower() == "nan":
                            student_name_ar = ""
                        if len(student_id) > 2:
                            records.append({
                                "student_id": student_id,
                                "student_name": student_name,
                                "student_name_ar": student_name_ar,
                                **course_info,
                            })
                    print(f"[worker {worker_id}] [{index + 1}/{total_rows}] OK: {course_info['course_code']}", flush=True)
                except Exception as exc:
                    print(f"[worker {worker_id}] Read error for {course_info['course_code']}: {exc}", flush=True)
            except Exception as exc:
                print(f"[worker {worker_id}] [{index + 1}/{total_rows}] Row skipped: {exc}", flush=True)
            finally:
                clean_temp_dir(temp_dir)
    finally:
        if driver:
            driver.quit()
        shutil.rmtree(temp_dir, ignore_errors=True)

    return records


def get_total_rows(url: str, driver_path: str, base_temp_dir: str, headless: bool) -> int:
    probe_dir = f"{base_temp_dir}_probe"
    driver = setup_driver(probe_dir, driver_path, headless=headless)
    try:
        driver.get(url)
        time.sleep(5)
        rows = driver.find_elements(By.XPATH, "//table[@id='GridView1']//tr")
        return max(0, len(rows) - 1)
    finally:
        driver.quit()
        shutil.rmtree(probe_dir, ignore_errors=True)


def scrape_to_csv(
    url: str,
    output_csv: str,
    temp_dir: str,
    headless: bool = True,
    num_workers: int = DEFAULT_WORKERS,
    download_timeout: int = DEFAULT_DOWNLOAD_TIMEOUT,
    stagger_seconds: int = DEFAULT_STAGGER_SECONDS,
) -> int:
    print("Resolving chromedriver...", flush=True)
    driver_path = ChromeDriverManager().install()
    total_rows = get_total_rows(url, driver_path, temp_dir, headless)
    print(f"Found {total_rows} course rows", flush=True)
    if total_rows == 0:
        return 0

    num_workers = max(1, min(num_workers, total_rows))
    row_chunks = [list(range(worker_id, total_rows, num_workers)) for worker_id in range(num_workers)]
    all_records: list[dict] = []

    with ProcessPoolExecutor(max_workers=num_workers) as executor:
        futures = {
            executor.submit(
                scrape_row_range,
                worker_id,
                url,
                indices,
                total_rows,
                temp_dir,
                driver_path,
                headless,
                download_timeout,
                stagger_seconds,
            ): worker_id
            for worker_id, indices in enumerate(row_chunks)
        }
        for future in as_completed(futures):
            worker_id = futures[future]
            try:
                worker_records = future.result()
                all_records.extend(worker_records)
                print(f"[worker {worker_id}] Finished with {len(worker_records)} records", flush=True)
            except Exception as exc:
                print(f"[worker {worker_id}] Crashed: {exc}", flush=True)

    if not all_records:
        print("No records were scraped.")
        return 0

    output_path = os.path.abspath(output_csv)
    pd.DataFrame(all_records).to_csv(output_path, index=False, encoding="utf-8-sig")
    print(f"Saved {len(all_records)} records to: {output_path}")
    return len(all_records)


def run_migration(csv_path: str) -> None:
    """Run the Node.js migration script to import *csv_path* into the normalized SQLite DB."""
    # Resolve paths relative to the repo root (one level above backend/)
    script_dir = os.path.dirname(os.path.abspath(__file__))
    repo_root = os.path.dirname(script_dir)  # classmate-connect/
    migration_script = os.path.join(repo_root, "backend", "src", "run-migration.js")
    csv_abs = os.path.abspath(csv_path)

    if not os.path.isfile(migration_script):
        # Fallback: maybe we're already inside backend/
        migration_script = os.path.join(script_dir, "src", "run-migration.js")

    if not os.path.isfile(migration_script):
        print(f"⚠ Migration script not found at {migration_script} — skipping DB import.")
        return

    print(f"\n🔄 Running DB migration: {csv_abs}")
    result = subprocess.run(
        ["node", migration_script, csv_abs],
        cwd=repo_root,
    )
    if result.returncode != 0:
        print("❌ Migration finished with errors (see above).")
    else:
        print("✅ DB migration completed successfully.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Scrape CU class list into CSV and import into normalized DB.")
    parser.add_argument("--url", default=DEFAULT_URL, help="Target class-list URL")
    parser.add_argument("--output", default=DEFAULT_OUTPUT, help="Output CSV path")
    parser.add_argument(
        "--temp-dir",
        default=os.path.join(os.getcwd(), "temp_downloads_csv"),
        help="Base temporary download directory; each worker uses its own suffix",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=DEFAULT_WORKERS,
        help=f"Number of parallel browser workers (default: {DEFAULT_WORKERS})",
    )
    parser.add_argument(
        "--download-timeout",
        type=int,
        default=DEFAULT_DOWNLOAD_TIMEOUT,
        help=f"Seconds to wait for each Excel download (default: {DEFAULT_DOWNLOAD_TIMEOUT})",
    )
    parser.add_argument(
        "--stagger",
        type=int,
        default=DEFAULT_STAGGER_SECONDS,
        help=f"Seconds between worker startups (default: {DEFAULT_STAGGER_SECONDS})",
    )
    parser.add_argument(
        "--headed",
        action="store_true",
        help="Run browser with UI (default is headless)",
    )
    parser.add_argument(
        "--no-migrate",
        action="store_true",
        help="Skip DB migration after scraping (only produce CSV)",
    )
    args = parser.parse_args()

    count = scrape_to_csv(
        url=args.url,
        output_csv=args.output,
        temp_dir=args.temp_dir,
        headless=not args.headed,
        num_workers=args.workers,
        download_timeout=args.download_timeout,
        stagger_seconds=args.stagger,
    )
    if count == 0:
        raise SystemExit(1)

    if not args.no_migrate:
        run_migration(args.output)
    else:
        print("ℹ DB migration skipped (--no-migrate).")


if __name__ == "__main__":
    main()
