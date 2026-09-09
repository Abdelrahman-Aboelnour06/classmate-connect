import { useEffect, useMemo, useState } from "react";
import PageLayout from "@/components/PageLayout";
import { CaretDown as ChevronDown, ChartBar as BarChart3, CircleNotch as Loader2, UploadSimple as Upload } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { runFullUpdate, uploadCsvAndMigrate, uploadStatsCsvData, validateCsv } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

type UploadStatus = "idle" | "uploading" | "validating" | "processing" | "success" | "error";
type ImportHistoryItem = { at: string; rows: number; imported: number; errors: number };

const REQUIRED_CSV_FORMAT = `student_id,student_name,student_name_ar,course_code,course_name,class_type,day_of_week,start_time,end_time,location,group_number
123456,Ahmed Ali,,CS101,Introduction to Computer Science,Lecture,Monday,09:00,10:30,Room 101,A`;
const REQUIRED_STATS_FORMAT = `course_code,semester,program,grade,student_count
CMPS211,Fall 2024,Computer Engineering,A+,15`;
const HISTORY_KEY = "classmate-connect-import-history";

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function UploadPage() {
  const { token, adminEmail } = useAuth();
  const { toast } = useToast();
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [message, setMessage] = useState("");
  const [stats, setStats] = useState<{ students: number; courses: number; schedules: number } | null>(null);
  const [csvText, setCsvText] = useState("");
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [validationRows, setValidationRows] = useState({ total: 0, valid: 0 });
  const [showFormat, setShowFormat] = useState(false);
  const [showStatsFormat, setShowStatsFormat] = useState(false);
  const [statsStatus, setStatsStatus] = useState<UploadStatus>("idle");
  const [statsMessage, setStatsMessage] = useState("");
  const [statsFile, setStatsFile] = useState<File | null>(null);
  const [history, setHistory] = useState<ImportHistoryItem[]>([]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]") as ImportHistoryItem[];
      setHistory(Array.isArray(saved) ? saved : []);
    } catch {
      setHistory([]);
    }
  }, []);

  const lineCount = useMemo(() => csvText ? csvText.split(/\r?\n/).filter(Boolean).length - 1 : 0, [csvText]);
  const isBusy = ["uploading", "validating", "processing"].includes(status);

  const rememberImport = (item: ImportHistoryItem) => {
    const next = [item, ...history].slice(0, 5);
    setHistory(next);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  };

  const validateSchedule = async (content: string) => {
    if (!content.trim()) throw new Error("CSV file is empty");
    setStatus("validating");
    setMessage(`Validating data, rows 1 / ${Math.max(lineCount, 1)}...`);
    const result = await validateCsv(token, content);
    setValidationRows({ total: result.totalRows, valid: result.validRows });
    setValidationErrors(result.errors || []);
    setMessage(`Validation complete, ${result.validRows} of ${result.totalRows} rows are ready.`);
    return result;
  };

  const handleFileChange = async (file: File | null) => {
    setValidationErrors([]);
    setStats(null);
    if (!file) {
      setCsvText("");
      setStatus("idle");
      return;
    }

    try {
      const content = await file.text();
      setCsvText(content);
      await validateSchedule(content);
    } catch (error) {
      const errorMessage = getErrorMessage(error, "CSV validation failed");
      setStatus("error");
      setMessage(errorMessage);
      toast({ title: "Validation failed", description: errorMessage, variant: "destructive" });
    }
  };

  const handleCsvUpload = async () => {
    if (!csvText.trim()) return;
    try {
      const validation = await validateSchedule(csvText);
      if (validation.errors.length > 0) {
        setStatus("error");
        setMessage("Fix the listed rows, then retry the corrected CSV.");
        toast({ title: "CSV needs corrections", description: `${validation.errors.length} row(s) need attention.`, variant: "destructive" });
        return;
      }

      setStatus("uploading");
      setMessage(`Uploading ${validation.totalRows} validated rows...`);
      setStatus("processing");
      setMessage(`Saving to database, rows ${validation.totalRows} / ${validation.totalRows}...`);
      const result = await uploadCsvAndMigrate(token, csvText);
      const migration = result.migration;
      setStats({ students: migration.students, courses: migration.courses, schedules: migration.schedules });
      setStatus("success");
      setMessage(`Done. Imported ${migration.importedRows} of ${migration.totalRows} schedule rows.`);
      rememberImport({ at: new Date().toISOString(), rows: migration.totalRows, imported: migration.importedRows, errors: migration.errors?.length || 0 });
      toast({ title: "Import complete", description: `${migration.importedRows} schedule rows saved.` });
    } catch (error) {
      const errorMessage = getErrorMessage(error, "Schedule upload failed");
      setStatus("error");
      setMessage(errorMessage);
      toast({ title: "Import failed", description: errorMessage, variant: "destructive" });
    }
  };

  const handleStatsUpload = async () => {
    if (!statsFile) return;
    setStatsStatus("uploading");
    setStatsMessage("Uploading statistics data...");
    try {
      const csv = await statsFile.text();
      if (!csv.trim()) throw new Error("CSV file is empty");
      const result = await uploadStatsCsvData(csv);
      setStatsStatus("success");
      setStatsMessage(`Done. Imported ${result.count} statistics records.`);
      toast({ title: "Statistics imported", description: `${result.count} records saved.` });
    } catch (error) {
      const errorMessage = getErrorMessage(error, "Statistics upload failed");
      setStatsStatus("error");
      setStatsMessage(errorMessage);
      toast({ title: "Statistics import failed", description: errorMessage, variant: "destructive" });
    }
  };

  const handleUpdate = async () => {
    try {
      setMessage("Updating source data...");
      await runFullUpdate(token);
      setMessage("Done. Source data updated.");
      toast({ title: "Data updated", description: "The schedule source was refreshed." });
    } catch (error) {
      const errorMessage = getErrorMessage(error, "Update failed");
      setMessage(errorMessage);
      toast({ title: "Update failed", description: errorMessage, variant: "destructive" });
    }
  };

  return (
    <PageLayout title="Admin Uploads">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <section className="border-b border-border pb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-secondary">Data operations</p>
          <h2 className="mt-2 font-display text-2xl font-bold text-foreground sm:text-3xl">Keep the timetable current.</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Signed in as {adminEmail}. Validate first, review row-level issues, then save.</p>
        </section>

        <section className="grid gap-4 sm:grid-cols-3" aria-label="Import status">
          <div className="rounded-lg border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Current state</p><p className="mt-1 font-semibold">{status === "idle" ? "Waiting for a file" : status === "success" ? "Done" : message || status}</p></div>
          <div className="rounded-lg border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Rows ready</p><p className="mt-1 font-semibold">{validationRows.valid} / {validationRows.total || lineCount || 0}</p></div>
          <div className="rounded-lg border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Last action</p><p className="mt-1 truncate font-semibold">{history[0] ? new Date(history[0].at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "None yet"}</p></div>
        </section>

        <section className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h3 className="font-display text-lg font-semibold">Schedule database</h3><p className="mt-1 text-sm text-muted-foreground">Upload, validate, correct, and import course schedules.</p></div>
            <Button type="button" variant="outline" size="sm" onClick={() => void handleUpdate()}>Refresh source</Button>
          </div>
          <Collapsible open={showFormat} onOpenChange={setShowFormat}>
            <CollapsibleTrigger asChild><Button variant="outline" size="sm" className="mt-4 w-full justify-between">Schedule CSV format <ChevronDown aria-hidden="true" /></Button></CollapsibleTrigger>
            <CollapsibleContent className="mt-3 overflow-x-auto rounded-lg bg-muted/30 p-3 text-xs font-mono text-muted-foreground"><pre>{REQUIRED_CSV_FORMAT}</pre></CollapsibleContent>
          </Collapsible>
          <label className="mt-4 block text-sm font-medium" htmlFor="schedule-csv">Schedule CSV file</label>
          <input id="schedule-csv" type="file" accept=".csv,text/csv" aria-describedby="schedule-csv-help" onChange={(event) => void handleFileChange(event.target.files?.[0] || null)} className="mt-2 block w-full min-w-0 text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary/20 file:px-3 file:py-2 file:text-secondary-foreground" />
          <p id="schedule-csv-help" className="mt-2 text-xs text-muted-foreground">Validation starts as soon as a file is selected.</p>

          {csvText && validationErrors.length > 0 && (
            <div className="mt-4 space-y-3" role="alert">
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3"><p className="font-semibold text-destructive">{validationErrors.length} row(s) need correction</p><ul className="mt-2 max-h-40 list-disc space-y-1 overflow-auto pl-5 text-sm text-destructive">{validationErrors.map((error) => <li key={error}>{error}</li>)}</ul></div>
              <label className="block text-sm font-medium" htmlFor="csv-editor">Corrected CSV</label>
              <textarea id="csv-editor" value={csvText} onChange={(event) => setCsvText(event.target.value)} rows={8} className="w-full rounded-md border border-input bg-background p-3 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-describedby="csv-editor-help" />
              <p id="csv-editor-help" className="text-xs text-muted-foreground">Edit the rows above, then validate again. No database changes happen while errors remain.</p>
            </div>
          )}

          {isBusy && <div className="mt-4" role="status" aria-live="polite"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{message}</div><div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full bg-secondary transition-all ${status === "processing" ? "w-full" : "w-1/2"}`} /></div></div>}
          <Button type="button" onClick={() => void handleCsvUpload()} disabled={!csvText.trim() || isBusy} className="mt-4 w-full sm:w-auto"><Upload aria-hidden="true" />{validationErrors.length > 0 ? "Validate corrected CSV" : isBusy ? "Working..." : "Validate and import schedule"}</Button>
          {status === "success" && stats && <p className="mt-3 text-sm font-medium text-green-700 dark:text-green-300" role="status">{message} {stats.students} students, {stats.courses} courses, {stats.schedules} schedules.</p>}
          {status === "error" && !validationErrors.length && <p className="mt-3 text-sm font-medium text-destructive" role="alert">{message}</p>}
        </section>

        <section className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-6">
          <div className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-secondary" aria-hidden="true" /><div><h3 className="font-display text-lg font-semibold">Statistics database</h3><p className="mt-1 text-sm text-muted-foreground">Import historical grade distributions.</p></div></div>
          <Collapsible open={showStatsFormat} onOpenChange={setShowStatsFormat}><CollapsibleTrigger asChild><Button variant="outline" size="sm" className="mt-4 w-full justify-between">Statistics CSV format <ChevronDown aria-hidden="true" /></Button></CollapsibleTrigger><CollapsibleContent className="mt-3 overflow-x-auto rounded-lg bg-muted/30 p-3 text-xs font-mono text-muted-foreground"><pre>{REQUIRED_STATS_FORMAT}</pre></CollapsibleContent></Collapsible>
          <label className="mt-4 block text-sm font-medium" htmlFor="stats-csv">Statistics CSV file</label>
          <input id="stats-csv" type="file" accept=".csv,text/csv" onChange={(event) => setStatsFile(event.target.files?.[0] || null)} className="mt-2 block w-full min-w-0 text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-2 file:text-primary" />
          <Button type="button" onClick={() => void handleStatsUpload()} disabled={!statsFile || statsStatus === "uploading"} variant="secondary" className="mt-4 w-full sm:w-auto"><Upload aria-hidden="true" />{statsStatus === "uploading" ? "Uploading..." : "Upload statistics CSV"}</Button>
          {statsMessage && <p className={`mt-3 text-sm font-medium ${statsStatus === "error" ? "text-destructive" : "text-green-700 dark:text-green-300"}`} role={statsStatus === "error" ? "alert" : "status"}>{statsMessage}</p>}
        </section>

        {history.length > 0 && <section aria-labelledby="import-history"><h3 id="import-history" className="font-display text-lg font-semibold">Recent imports</h3><div className="mt-3 divide-y divide-border rounded-lg border border-border bg-card">{history.map((item) => <div key={item.at} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm"><span>{new Date(item.at).toLocaleString()}</span><span className="text-muted-foreground">{item.imported}/{item.rows} rows, {item.errors} errors</span></div>)}</div></section>}
      </div>
    </PageLayout>
  );
}
