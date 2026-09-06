import { useState } from "react";
import PageLayout from "@/components/PageLayout";
import { ArrowsClockwise as RefreshCcw, CaretDown as ChevronDown, ChartBar as BarChart3, CheckCircle, CircleNotch as Loader2, UploadSimple as Upload, WarningCircle as AlertCircle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { runFullUpdate, uploadCsvAndMigrate, uploadStatsCsvData } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

type UploadStatus = "idle" | "uploading" | "processing" | "success" | "error";

const REQUIRED_CSV_FORMAT = `student_id,student_name,student_name_ar,course_code,course_name,class_type,day_of_week,start_time,end_time,location,group_number\n123456,Ahmed Ali,احمد علي,CS101,Introduction to Computer Science,Lecture,Monday,09:00,10:30,Room 101,A`;
const REQUIRED_STATS_FORMAT = `course_code,semester,program,grade,student_count\nCMPS211,Fall 2024,Computer Engineering,A+,15\nCMPS211,Fall 2024,Computer Engineering,B,30`;

export default function UploadPage() {
  const { token, adminEmail } = useAuth();

  // States for Schedule Upload
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [message, setMessage] = useState("");
  const [stats, setStats] = useState<{ students: number; courses: number; schedules: number } | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [showFormat, setShowFormat] = useState(false);
  const [errorDetails, setErrorDetails] = useState<string>("");

  // States for Stats Upload
  const [statsStatus, setStatsStatus] = useState<UploadStatus>("idle");
  const [statsMessage, setStatsMessage] = useState("");
  const [statsFile, setStatsFile] = useState<File | null>(null);
  const [showStatsFormat, setShowStatsFormat] = useState(false);

  const handleUpdate = async () => { /* unchanged... */ };

  const handleCsvUpload = async () => {
    if (!csvFile) return;

    setStatus("uploading");
    setMessage("Uploading schedule CSV...");
    setErrorDetails("");

    try {
      const csv = await csvFile.text();
      if (!csv.trim()) throw new Error("CSV file is empty");

      setStatus("processing");
      setMessage("Processing schedule data...");
      const result = await uploadCsvAndMigrate(token, csv);
      const migration = result.migration;

      setStats({
        students: migration.students,
        courses: migration.courses,
        schedules: migration.schedules,
      });
      setStatus("success");
      setMessage(`Successfully imported ${migration.importedRows} of ${migration.totalRows} schedule rows.`);
      setErrorDetails(migration.errors?.slice(0, 5).join("\n") || "");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Schedule upload failed");
    }
  };

  const handleStatsUpload = async () => {
    if (!statsFile) return;
    setStatsStatus("uploading");
    setStatsMessage("Uploading statistics data...");

    try {
      const csv = await statsFile.text();
      if (!csv || csv.trim().length === 0) throw new Error("CSV file is empty");
      
      const result = await uploadStatsCsvData(csv);
      
      setStatsStatus("success");
      setStatsMessage(`Successfully imported ${result.count} statistics records.`);
    } catch (err: any) {
      setStatsStatus("error");
      setStatsMessage(err.message || "Statistics upload failed");
    }
  };

  return (
    <PageLayout title="Admin Uploads">
      <div className="max-w-xl mx-auto space-y-8">
        <div className="animate-fade-in">
          <h2 className="font-display text-2xl font-bold text-foreground">Admin Data Management</h2>
          <p className="mt-1 text-sm text-muted-foreground">Signed in as: {adminEmail}</p>
        </div>

        {/* --- SCHEDULE UPLOAD CARD (Your original one) --- */}
        <div className="rounded-xl border border-border bg-card p-6 space-y-4 shadow-sm">
          <h3 className="font-display text-lg font-semibold text-card-foreground">1. Schedule Database</h3>
          <p className="text-xs text-muted-foreground mb-4">Upload course schedules and student enrollments.</p>

          <Collapsible open={showFormat} onOpenChange={setShowFormat}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="w-full">
                <ChevronDown className="mr-2 h-4 w-4" /> Schedule CSV Format
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 p-3 bg-muted/30 rounded-lg text-xs font-mono whitespace-pre overflow-x-auto text-muted-foreground">
              {REQUIRED_CSV_FORMAT}
            </CollapsibleContent>
          </Collapsible>

          <input
            type="file" accept=".csv"
            onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
            className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary/20 file:px-3 file:py-2 file:text-secondary-foreground"
          />

          <Button onClick={handleCsvUpload} disabled={!csvFile || status === "uploading" || status === "processing"} className="w-full">
            {status === "uploading" || status === "processing" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            {status === "uploading" ? "Uploading..." : status === "processing" ? "Processing..." : "Upload Schedule CSV"}
          </Button>

          {status === "success" && <p className="text-sm text-green-500 mt-2 font-medium">{message}</p>}
          {status === "error" && <p className="text-sm text-red-500 mt-2 font-medium">{message}</p>}
          {errorDetails && <pre className="whitespace-pre-wrap text-xs text-muted-foreground">{errorDetails}</pre>}
        </div>

        {/* --- NEW STATISTICS UPLOAD CARD --- */}
        <div className="rounded-xl border border-border bg-card p-6 space-y-4 shadow-sm">
          <h3 className="font-display text-lg font-semibold text-card-foreground flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            2. Statistics Database
          </h3>
          <p className="text-xs text-muted-foreground mb-4">Upload historical grade distributions for the Statistics page.</p>

          <Collapsible open={showStatsFormat} onOpenChange={setShowStatsFormat}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="w-full">
                <ChevronDown className="mr-2 h-4 w-4" /> Statistics CSV Format
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 p-3 bg-muted/30 rounded-lg text-xs font-mono whitespace-pre overflow-x-auto text-muted-foreground">
              {REQUIRED_STATS_FORMAT}
            </CollapsibleContent>
          </Collapsible>

          <input
            type="file" accept=".csv"
            onChange={(e) => setStatsFile(e.target.files?.[0] || null)}
            className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-2 file:text-primary"
          />

          <Button onClick={handleStatsUpload} disabled={!statsFile || statsStatus === "uploading"} variant="secondary" className="w-full">
            <Upload className="mr-2 h-4 w-4" /> Upload Statistics CSV
          </Button>

          {statsStatus === "success" && <p className="text-sm text-green-500 mt-2 font-medium">{statsMessage}</p>}
          {statsStatus === "error" && <p className="text-sm text-red-500 mt-2 font-medium">{statsMessage}</p>}
        </div>

      </div>
    </PageLayout>
  );
}