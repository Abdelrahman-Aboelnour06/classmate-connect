import { useState, useCallback } from "react";
import PageLayout from "@/components/PageLayout";
import { Upload, FileText, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

type UploadStatus = "idle" | "uploading" | "processing" | "success" | "error";

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [message, setMessage] = useState("");
  const [stats, setStats] = useState<{ students: number; courses: number; schedules: number } | null>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && f.name.endsWith(".csv")) setFile(f);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  };

  const handleUpload = async () => {
    if (!file) return;
    setStatus("uploading");
    setMessage("Reading file...");

    try {
      const text = await file.text();
      setStatus("processing");
      setMessage("Processing and importing data...");

      const { data, error } = await supabase.functions.invoke("import-csv", {
        body: { csv: text },
      });

      if (error) throw error;

      if (data?.success) {
        setStatus("success");
        setMessage(`Import complete!`);
        setStats(data.stats);
      } else {
        throw new Error(data?.error || "Import failed");
      }
    } catch (err: any) {
      setStatus("error");
      setMessage(err.message || "Upload failed");
    }
  };

  return (
    <PageLayout title="Upload Data">
      <div className="max-w-xl mx-auto space-y-8">
        <div className="animate-fade-in">
          <h2 className="font-display text-2xl font-bold text-foreground">Upload Schedule Data</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload your master_schedule.csv to populate the database.
          </p>
        </div>

        {/* Drop zone */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="animate-fade-in rounded-xl border-2 border-dashed border-border bg-card p-12 text-center transition-colors hover:border-secondary"
          style={{ animationDelay: "0.1s" }}
        >
          {file ? (
            <div className="flex flex-col items-center gap-3">
              <FileText className="h-10 w-10 text-secondary" />
              <p className="text-sm font-medium text-card-foreground">{file.name}</p>
              <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <Upload className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Drag & drop your CSV file here, or{" "}
                <label className="cursor-pointer text-secondary font-medium hover:underline">
                  browse
                  <input type="file" accept=".csv" className="hidden" onChange={handleFileSelect} />
                </label>
              </p>
            </div>
          )}
        </div>

        {/* Upload button */}
        {file && status !== "success" && (
          <Button
            onClick={handleUpload}
            disabled={status === "uploading" || status === "processing"}
            className="w-full gradient-amber text-secondary-foreground font-medium"
          >
            {(status === "uploading" || status === "processing") && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {status === "idle" || status === "error" ? "Import Data" : message}
          </Button>
        )}

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
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 animate-fade-in">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <span className="text-sm font-medium">{message}</span>
            </div>
          </div>
        )}

        {/* CSV format guide */}
        <div className="rounded-xl border border-border bg-card p-6 animate-fade-in" style={{ animationDelay: "0.2s" }}>
          <h3 className="font-display text-sm font-semibold text-card-foreground">Expected CSV Format</h3>
          <p className="mt-2 text-xs text-muted-foreground leading-relaxed font-mono">
            student_id, student_name, student_name_ar, course_code, course_name, class_type, day_of_week, start_time, end_time, location, group_number
          </p>
        </div>
      </div>
    </PageLayout>
  );
}
