import csv
import re
import concurrent.futures

# Regex patterns to identify key data elements regardless of column shifting
program_regex = re.compile(r'^\[[A-Z]+\]\s.*')
term_regex = re.compile(r'^(Spring|Fall|Summer)\s\d{4}$')
subject_code_regex = re.compile(r'^[A-Z]{3,4}-?\d{3}$')

# Our structured output headers
headers = [
    'Program', 'Term', 'Level', 'Subject Code', 'Subject Name',
    'A*', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'F',
    'All', 'A* To C+', 'C To D', 'F Only'
]

def process_row(args):
    row, current_program, current_term = args
    # 2. Search for the Subject Code across the columns to locate the valid payload
    for i in range(1, len(row)):
        cell = row[i].strip()
        if subject_code_regex.match(cell):
            # Ensure we have bounds to the left (Level) and enough columns to the right (Grades)
            if i >= 1 and (i + 17) <= len(row):
                level = row[i-1].strip()
                code = cell
                name = row[i+1].strip()
                
                # Validate that 'Level' is a digit to exclude random header strings
                if not level.isdigit():
                    continue
                    
                grades = [row[i+k].strip() for k in range(2, 18)]
                
                # Validate that the 'All' (Total Students) column is a digit to ensure it's a data row
                if not grades[12].isdigit():
                    continue
                    
                # Map the extracted data to our clean schema
                record = {headers[0]: current_program, headers[1]: current_term, headers[2]: level, headers[3]: code, headers[4]: name}
                record.update({headers[j]: grades[j-5] for j in range(5, 21)})
                return record
            break  # Break out of the column loop once the subject is processed
    return None

def extract_and_format_statistics(input_path, output_path):
    clean_data = []
    rows_with_context = []

    with open(input_path, 'r', encoding='utf-8', errors='replace') as infile:
        reader = csv.reader(infile)
        
        current_program = "Unknown Program"
        current_term = "Unknown Term"
        
        for row in reader:
            if not row:
                continue
            
            # 1. Update the Program and Term context if they appear at the start of the row
            if len(row) > 0 and program_regex.match(row[0].strip()):
                current_program = row[0].strip()
            if len(row) > 1 and term_regex.match(row[1].strip()):
                current_term = row[1].strip()
                
            rows_with_context.append((row, current_program, current_term))

    # 2. Process rows using multithreading
    with concurrent.futures.ThreadPoolExecutor() as executor:
        # executor.map guarantees the results are in the same order as the input
        results = executor.map(process_row, rows_with_context)
        
        for result in results:
            if result:
                clean_data.append(result)

    # 3. Write out to the nice, formatted CSV
    with open(output_path, 'w', encoding='utf-8', newline='') as outfile:
        writer = csv.DictWriter(outfile, fieldnames=headers)
        writer.writeheader()
        writer.writerows(clean_data)
        
    print(f"Successfully extracted {len(clean_data)} meaningful records!")
    print(f"Saved formatted data to: {output_path}")

if __name__ == "__main__":
    input_csv = r"c:\Users\abdel\OneDrive\Desktop\GAM3A\عبث\mywebsite\classmate-connect\cu_result_statistics.csv"
    output_csv = r"c:\Users\abdel\OneDrive\Desktop\GAM3A\عبث\mywebsite\classmate-connect\cu_result_statistics_cleaned.csv"
    
    extract_and_format_statistics(input_csv, output_csv)