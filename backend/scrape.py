import argparse
import os
import shutil
import time

import pandas as pd
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from webdriver_manager.chrome import ChromeDriverManager


DEFAULT_URL = "https://stds.eng.cu.edu.eg/ClassList.aspx?s=1"
DEFAULT_OUTPUT = "master_schedule_scraped.csv"


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


def setup_driver(temp_dir: str, headless: bool = True) -> webdriver.Chrome:
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

    service = Service(ChromeDriverManager().install())
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


def scrape_to_csv(url: str, output_csv: str, temp_dir: str, headless: bool = True) -> int:
    driver = None
    all_records: list[dict] = []

    try:
        driver = setup_driver(temp_dir, headless=headless)
        print(f"Opening: {url}")
        driver.get(url)
        time.sleep(5)

        rows = driver.find_elements(By.XPATH, "//table[@id='GridView1']//tr")
        total_rows = max(0, len(rows) - 1)
        print(f"Found {total_rows} course rows")

        for index in range(total_rows):
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

                downloaded_file = wait_for_excel_download(temp_dir, timeout_seconds=10)
                if not downloaded_file:
                    print(f"[{index + 1}/{total_rows}] Timeout: {course_info['course_code']}")
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
                            all_records.append(
                                {
                                    "student_id": student_id,
                                    "student_name": student_name,
                                    "student_name_ar": student_name_ar,
                                    **course_info,
                                }
                            )

                    print(f"[{index + 1}/{total_rows}] OK: {course_info['course_code']}")
                except Exception as exc:
                    print(f"[{index + 1}/{total_rows}] Read error for {course_info['course_code']}: {exc}")
                finally:
                    clean_temp_dir(temp_dir)

            except Exception as exc:
                print(f"[{index + 1}/{total_rows}] Row skipped: {exc}")

        if not all_records:
            print("No records were scraped.")
            return 0

        output_path = os.path.abspath(output_csv)
        pd.DataFrame(all_records).to_csv(output_path, index=False, encoding="utf-8-sig")
        print(f"Saved {len(all_records)} records to: {output_path}")
        return len(all_records)

    finally:
        if driver:
            driver.quit()
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Scrape CU class list into CSV (no DB migration).")
    parser.add_argument("--url", default=DEFAULT_URL, help="Target class-list URL")
    parser.add_argument("--output", default=DEFAULT_OUTPUT, help="Output CSV path")
    parser.add_argument(
        "--temp-dir",
        default=os.path.join(os.getcwd(), "temp_downloads_csv"),
        help="Temporary download directory",
    )
    parser.add_argument(
        "--headed",
        action="store_true",
        help="Run browser with UI (default is headless)",
    )
    args = parser.parse_args()

    count = scrape_to_csv(
        url=args.url,
        output_csv=args.output,
        temp_dir=args.temp_dir,
        headless=not args.headed,
    )
    if count == 0:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
