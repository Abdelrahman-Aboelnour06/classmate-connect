import { useState, useEffect, useRef } from "react";
import { searchStudents } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { MagnifyingGlass } from "@phosphor-icons/react";

type Student = { student_id: string; student_name: string; student_name_ar: string | null };

interface StudentSearchProps {
  label: string;
  onSelect: (student: Student) => void;
  selected?: Student | null;
  placeholder?: string;
}

export default function StudentSearch({ label, onSelect, selected, placeholder }: StudentSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Student[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await searchStudents(query);
        setResults(data);
        setIsOpen(data.length > 0);
        setHighlightIndex(-1);
      } catch {
        setResults([]);
      }
    }, 300);

    return () => clearTimeout(debounceRef.current);
  }, [query]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && highlightIndex >= 0) {
      e.preventDefault();
      handleSelect(results[highlightIndex]);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  const handleSelect = (student: Student) => {
    onSelect(student);
    setQuery("");
    setIsOpen(false);
  };

  if (selected) {
    return (
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">{label}</label>
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
          <div className="flex-1">
            <p className="text-sm font-medium text-card-foreground">{selected.student_name}</p>
            <p className="text-xs text-muted-foreground">{selected.student_id}{selected.student_name_ar ? ` • ${selected.student_name_ar}` : ""}</p>
          </div>
          <button
            onClick={() => onSelect(null as any)}
            className="text-xs text-muted-foreground hover:text-destructive transition-colors"
          >
            Clear
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative space-y-1.5" ref={containerRef}>
      <label className="text-sm font-medium text-foreground">{label}</label>
      <div className="relative">
            <MagnifyingGlass weight="bold" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || "Search by name or ID..."}
          className="pl-9"
        />
      </div>
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-card shadow-elevated overflow-hidden">
          {results.map((student, i) => (
            <button
              key={student.student_id}
              onClick={() => handleSelect(student)}
              className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                i === highlightIndex ? "bg-muted" : "hover:bg-muted/50"
              }`}
            >
              <span className="font-medium text-card-foreground">{student.student_name}</span>
              <span className="ml-2 font-mono text-xs text-muted-foreground">{student.student_id}</span>
              {student.student_name_ar && (
                <span className="float-right text-xs text-muted-foreground">{student.student_name_ar}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
