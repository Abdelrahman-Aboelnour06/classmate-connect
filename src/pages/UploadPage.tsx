import { useState } from "react";
import PageLayout from "@/components/PageLayout";
import { Loader2, CheckCircle, AlertCircle, RefreshCcw, Upload, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { runFullUpdate, uploadCsvAndMigrate } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

type UploadStatus = "idle" | "uploading" | "processing" | "success" | "error";

const REQUIRED_CSV_FORMAT = `
student_id,student_name,student_name_ar,course_code,course_name,class_type,day_of_week,start_time,end_time,location,group_number
123456,Ahmed Ali,احمد علي,CS101,Introduction to Computer Science,Lecture,Monday,09:00,10:30,Room 101,A
123457,Fatima Hassan,فاطمة حسن,CS101,Introduction to Computer Science,Lab,Tuesday,14:00,15:30,[20503],B
`.trim();

export default function UploadPage() {
  const { token, adminEmail } = useAuth();
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [message, setMessage] = useState("");
  const [stats, setStats] = useState<{ students: number; courses: number; schedules: number } | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [showFormat, setShowFormat] = useState(false);
  const [errorDetails, setErrorDetails] = useState<string>("");

  const handleUpdate = async () => {
    if (!token) return;
    setStatus("processing");
    setMessage("Scraping source and updating database...");
    setErrorDetails("");

    try {
      const data = await runFullUpdate(token);
      if (data?.status === "success") {
        setStatus("success");
        setMessage("Update complete.");
        setStats({
          students: data.migration.students,
          courses: data.migration.courses,
          schedules: data.migration.schedules,
        });
      } else if (data?.status === "partial") {
        setStatus("error");
        setMessage("Scrape completed, but migration failed.");
        setErrorDetails(data.error || "Unknown error");
      } else {
        throw new Error(data?.message || "Update failed");
      }
    } catch (err: any) {
      setStatus("error");
      const errMsg = err.message || "Update failed";
      setMessage(errMsg);
      setErrorDetails(errMsg);
    }
  };

  const handleCsvUpload = async () => {
    if (!token || !csvFile) {
      setStatus("error");
      setMessage("Missing credentials or file");
      return;
    }

    setStatus("uploading");
    setMessage("Reading file and uploading CSV...");
    setErrorDetails("");

    try {
      // Read file with validation
      const csv = await csvFile.text();
      
      if (!csv || csv.trim().length === 0) {
        throw new Error("CSV file is empty");
      }
      
      console.log("File read successfully. Size:", csv.length, "bytes");
      console.log("First 100 chars:", csv.substring(0, 100));
      
      const data = await uploadCsvAndMigrate(token, csv);
      if (data?.status === "success") {
        setStatus("success");
        setMessage("CSV import complete.");
        setStats({
          students: data.migration.students,
          courses: data.migration.courses,
          schedules: data.migration.schedules,
        });
        return;
      }

      throw new Error(data?.error || data?.message || "CSV upload failed");
    } catch (err: any) {
      setStatus("error");
      const errMsg = err.message || "CSV upload failed";
      setMessage(errMsg);
      setErrorDetails(errMsg);
      console.error("Upload error:", err);
    }
  };

  return (
    <PageLayout title="Upload Data">
      <div className="max-w-xl mx-auto space-y-8">
        <div className="animate-fade-in">
          <h2 className="font-display text-2xl font-bold text-foreground">Scrape & Update Database</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Trigger a full update from the configured scrape source URL.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Signed in as: {adminEmail}</p>
        </div>

        <Button
          onClick={handleUpdate}
          disabled={status === "processing" || status === "uploading"}
          className="w-full gradient-amber text-secondary-foreground font-medium"
        >
          {status === "processing" ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Running update...
            </>
          ) : (
            <>
              <RefreshCcw className="mr-2 h-4 w-4" />
              Run Full Scrape + Migration
            </>
          )}
        </Button>

        <div className="rounded-xl border border-border bg-card p-6 space-y-4 animate-fade-in" style={{ animationDelay: "0.15s" }}>
          <h3 className="font-display text-sm font-semibold text-card-foreground">Manual CSV Upload (Fallback)</h3>
          <p className="text-xs text-muted-foreground">
            If scraping fails, upload a CSV file directly to migrate data.
          </p>

          {/* CSV Format Help */}
          <Collapsible open={showFormat} onOpenChange={setShowFormat}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="w-full">
                <ChevronDown className={`mr-2 h-4 w-4 transition-transform ${showFormat ? "rotate-180" : ""}`} />
                CSV Format Requirements
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 space-y-2 rounded-lg border border-dashed border-border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground mb-2 font-medium">Required columns:</div>
              <ul className="text-xs space-y-1 text-muted-foreground list-disc list-inside">
                <li><code className="bg-muted px-1">student_id</code> - Unique student identifier</li>
                <li><code className="bg-muted px-1">student_name</code> - Student name (English)</li>
                <li><code className="bg-muted px-1">student_name_ar</code> - Student name (Arabic)</li>
                <li><code className="bg-muted px-1">course_code</code> - Course code (e.g., CS101)</li>
                <li><code className="bg-muted px-1">course_name</code> - Course name</li>
                <li><code className="bg-muted px-1">class_type</code> - Lecture, Lab, Tutorial, etc.</li>
                <li><code className="bg-muted px-1">day_of_week</code> - Monday through Sunday</li>
                <li><code className="bg-muted px-1">start_time</code> - HH:MM or H:MM AM/PM</li>
                <li><code className="bg-muted px-1">end_time</code> - HH:MM or H:MM AM/PM</li>
                <li><code className="bg-muted px-1">location</code> - Room location (e.g., [20503])</li>
                <li><code className="bg-muted px-1">group_number</code> - Group designation (A, B, C, etc.)</li>
              </ul>
              <div className="mt-4 bg-muted/50 rounded p-2 font-mono text-xs overflow-x-auto whitespace-pre text-muted-foreground">
                {REQUIRED_CSV_FORMAT}
              </div>
            </CollapsibleContent>
          </Collapsible>

          <input
            type="file"
            accept=".csv"
            onChange={(event) => {
              setCsvFile(event.target.files?.[0] || null);
              setErrorDetails("");
            }}
            className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary/20 file:px-3 file:py-2 file:text-secondary-foreground"
          />

          <Button
            onClick={handleCsvUpload}
            disabled={!csvFile || status === "processing" || status === "uploading"}
            variant="secondary"
            className="w-full"
          >
            {status === "uploading" ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importing CSV...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Upload CSV and Migrate
              </>
            )}
          </Button>
        </div>

        {/* Status */}
        {status === "success" && (
          <div className="rounded-xl border border-border bg-card p-6 animate-fade-in">
            <div className="flex items-center gap-2 text-secondary">
              <CheckCircle className="h-5 w-5" />
              <span className="font-display font-semibold">{message}</span>
            </div>
            {stats && (
              <div className="mt-4 grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-card-foreground">{stats.students}</p>
                  <p className="text-xs text-muted-foreground">Students</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-card-foreground">{stats.courses}</p>
                  <p className="text-xs text-muted-foreground">Courses</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-card-foreground">{stats.schedules}</p>
                  <p className="text-xs text-muted-foreground">Schedule Entries</p>
                </div>
              </div>
            )}
          </div>
        )}

        {status === "error" && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 animate-fade-in space-y-2">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <span className="text-sm font-medium">{message}</span>
            </div>
            {errorDetails && (
              <div className="text-xs text-destructive/80 ml-7 whitespace-pre-wrap break-words bg-destructive/5 rounded p-2 border border-destructive/20">
                {errorDetails}
              </div>
            )}
          </div>
        )}

        <div className="rounded-xl border border-border bg-card p-6 animate-fade-in" style={{ animationDelay: "0.2s" }}>
          <h3 className="font-display text-sm font-semibold text-card-foreground">Automation Mode</h3>
          <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
            This page updates the database by running: scrape → master CSV snapshot → normalized migration.
          </p>
        </div>
      </div>
    </PageLayout>
  );
}
