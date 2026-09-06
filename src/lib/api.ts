import { supabase } from "@/integrations/supabase/client";

export function normalizeArabic(text: string): string {
  return text
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .trim();
}

// Extract location code from strings like "[20503]..."
export function extractLocation(raw: string): string {
  const match = raw.match(/\[(\d+)\]/);
  return match ? match[1] : raw;
}

// Format time for display
export function formatTime(time: string): string {
  const [h, m] = time.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${displayHour}:${m} ${ampm}`;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const value = document.cookie.split("; ").find((part) => part.startsWith(`${name}=`));
  return value ? decodeURIComponent(value.slice(name.length + 1)) : null;
}

async function getCsrfToken(): Promise<string> {
  const existing = readCookie("csrf_token");
  if (existing) return existing;

  const response = await fetch(`${API_BASE_URL}/api/auth/csrf`, { credentials: "include" });
  if (!response.ok) throw new Error("Unable to verify the request.");
  const data = await response.json() as { token: string };
  return data.token;
}

function extractFilename(contentDisposition: string | null): string | null {
  if (!contentDisposition) return null;

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const plainMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  return plainMatch?.[1] || null;
}

function buildCoursesExportFilename(courseCodes: string[]): string {
  const normalizedCodes = courseCodes
    .map((courseCode) => String(courseCode).trim().toUpperCase())
    .filter(Boolean);

  if (!normalizedCodes.length) {
    return "students-by-courses.xlsx";
  }

  return `${normalizedCodes.join("-")}`.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_") + ".xlsx";
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  const method = (init?.method || "GET").toUpperCase();
  const headers = new Headers(init?.headers);
  headers.set("content-type", "application/json");
  if (!["GET", "HEAD", "OPTIONS"].includes(method) && !headers.has("authorization")) {
    headers.set("x-csrf-token", await getCsrfToken());
  }
  
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      credentials: "include",
      headers,
    });
  } catch (error) {
    throw new Error(`Cannot reach API at ${API_BASE_URL}. Make sure backend is running.`);
  }

  if (!response.ok) {
    const text = await response.text();
    let message = text || `Request failed: ${response.status}`;

    try {
      const parsed = JSON.parse(text);
      // Check both 'error' and 'message' fields for error message
      if (parsed?.error) {
        message = parsed.error;
      } else if (parsed?.message) {
        message = parsed.message;
      }
    } catch {
      // If JSON parsing fails, use the raw text
    }

    throw new Error(message);
  }

  const result = await response.json() as T;
  return result;
}

export type StudentScheduleRecord = {
  student_id: string;
  student_name: string;
  student_name_ar: string | null;
  course_code: string;
  course_name: string;
  class_type: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  location: string | null;
  group_number: string | null;
  instructor?: string;
  original_start_time?: string;
  original_end_time?: string;
};

export type BusyTimeSlotFilter = {
  dayOfWeek: string;
  startTime: string;
  endTime: string;
};

export type StudentsByCoursesAvailabilityMode = "busy" | "free";

export async function searchStudents(query: string): Promise<Array<{ student_id: string; student_name: string; student_name_ar: string | null }>> {
  return apiRequest(`/api/search/students?q=${encodeURIComponent(query)}`);
}

export async function getStudentSchedule(studentQuery: string, strict = false): Promise<StudentScheduleRecord[]> {
  return apiRequest(
    `/api/search/schedule?query=${encodeURIComponent(studentQuery)}&strict=${strict ? "1" : "0"}`,
  );
}

export async function getAllCourses(): Promise<Array<{ course_code: string; course_name: string }>> {
  return apiRequest("/api/courses");
}

export async function getClassmates(courseCode: string, excludeStudentId?: string): Promise<Array<{ student_id: string; student_name: string; student_name_ar: string | null }>> {
  return apiRequest(
    `/api/classmates?courseCode=${encodeURIComponent(courseCode)}${excludeStudentId ? `&excludeStudentId=${encodeURIComponent(excludeStudentId)}` : ""}`,
  );
}

export async function getClassStudents(
  courseCode: string,
  classType: string,
  dayOfWeek: string,
  startTime: string,
  groupNumber?: string | null
): Promise<Array<{ student_id: string; student_name: string; student_name_ar: string | null }>> {
  const params = new URLSearchParams({
    courseCode,
    classType,
    dayOfWeek,
    startTime,
  });
  
  if (groupNumber) {
    params.append('groupNumber', groupNumber);
  }
  
  return apiRequest(`/api/class-students?${params.toString()}`);
}

export async function loginAdmin(email: string, password: string): Promise<{ token?: string; admin: { email: string } }> {
  return apiRequest("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password, website: "", startedAt: Date.now() - 1000 }),
  });
}

export async function logoutAdmin() {
  return apiRequest<void>("/api/auth/logout", { method: "POST" });
}

export async function registerUser(input: { email: string; username: string; password: string; termsAccepted: boolean; website: string; startedAt: number }) {
  return apiRequest<{ user: { email: string; username: string } }>("/api/users/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function loginUser(input: { identifier: string; password: string; website: string; startedAt: number }) {
  return apiRequest<{ user: { email: string; username: string }; admin?: boolean }>("/api/users/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function logoutUser() {
  return apiRequest<void>("/api/users/logout", { method: "POST" });
}

export async function runFullUpdate(token?: string): Promise<any> {
  return apiRequest("/api/update", {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });
}

export async function uploadCsvAndMigrate(token: string | null | undefined, csv: string): Promise<any> {
  return apiRequest("/api/upload-csv", {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
    body: JSON.stringify({ csv }),
  });
}

export async function findStudentsByCourses(
  courseCodes: string[],
  matchType: "all" | "any",
  busyTimeSlot?: BusyTimeSlotFilter,
  availabilityMode: StudentsByCoursesAvailabilityMode = "busy",
) {
  return apiRequest<{ count: number; students: Array<{ student_id: string; student_name: string; student_name_ar: string | null }> }>(
    "/api/students-by-courses",
    {
      method: "POST",
      body: JSON.stringify({ courseCodes, matchType, busyTimeSlot, availabilityMode }),
    },
  );
}

export async function exportStudentsByCoursesExcel(
  courseCodes: string[],
  matchType: "all" | "any",
  busyTimeSlot?: BusyTimeSlotFilter,
  availabilityMode: StudentsByCoursesAvailabilityMode = "busy",
): Promise<{ blob: Blob; fileName: string }> {
  const response = await fetch(`${API_BASE_URL}/api/students-by-courses/export`, {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
      "x-csrf-token": await getCsrfToken(),
    },
    body: JSON.stringify({ courseCodes, matchType, busyTimeSlot, availabilityMode }),
  });

  if (!response.ok) {
    const text = await response.text();
    let message = text || `Request failed: ${response.status}`;

    try {
      const parsed = JSON.parse(text);
      if (parsed?.error) {
        message = parsed.error;
      } else if (parsed?.message) {
        message = parsed.message;
      }
    } catch {
      // Keep raw response text as message when body is not JSON.
    }

    throw new Error(message);
  }

  const blob = await response.blob();
  const fallbackFileName = buildCoursesExportFilename(courseCodes);
  const fileName = extractFilename(response.headers.get("content-disposition")) || fallbackFileName;

  return { blob, fileName };
}

export type FriendsAndEnemiesAnalysis = {
  student_id: string;
  student_name: string;
  course_code: string;
  course_name: string;
  class_type: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  location: string | null;
  group_number: string | null;
  category: "friends-only" | "enemies-only" | "both" | "alone";
  friends: StudentScheduleRecord[];
  enemies: StudentScheduleRecord[];
};

export async function analyzeFriendsAndEnemies(
  studentId: string,
  friendIds: string[],
  enemyIds: string[]
): Promise<{ analysis: FriendsAndEnemiesAnalysis[] }> {
  return apiRequest(
    "/api/friends-and-enemies/analyze",
    {
      method: "POST",
      body: JSON.stringify({ studentId, friendIds, enemyIds }),
    }
  );
}

/// --- STATISTICS API (Local Backend Version) ---
export async function uploadStatsCsvData(csvText: string) {
  const lines = csvText.split('\n').filter(line => line.trim().length > 0);
  const dataToInsert = [];
  const gradeLabels = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "F"];

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
    if (row.length < 17) continue;

    const program = row[0].replace(/"/g, '').trim();
    const semester = row[1].replace(/"/g, '').trim();
    const courseCode = row[3].replace(/"/g, '').trim();

    if (!courseCode || semester.includes("Unknown") || program.includes("Unknown")) continue;

    for (let g = 0; g < gradeLabels.length; g++) {
      const count = parseInt(row[5 + g] || '0', 10);
      if (!isNaN(count) && count > 0) {
        dataToInsert.push({
          course_code: courseCode,
          semester: semester,
          program: program,
          grade: gradeLabels[g],
          student_count: count
        });
      }
    }
  }

  const chunkSize = 500;
  let totalInserted = 0;

  for (let i = 0; i < dataToInsert.length; i += chunkSize) {
    const chunk = dataToInsert.slice(i, i + chunkSize);
    // Send data to your local localhost:4000 backend
    await apiRequest("/api/statistics/upload", {
      method: "POST",
      body: JSON.stringify({ data: chunk }),
    });
    totalInserted += chunk.length;
  }

  return { success: true, count: totalInserted };
}

export async function fetchStatisticsData(course: string, semester: string, program: string): Promise<any[]> {
  const params = new URLSearchParams({ course, semester, program });
  // Add <any[]> right here to tell TypeScript we expect an array
  return apiRequest<any[]>(`/api/statistics?${params.toString()}`);
}

export async function fetchStatisticsFilters(): Promise<any[]> {
  // Add <any[]> right here as well
  return apiRequest<any[]>("/api/statistics/filters");
}

export async function getCurrentUser() {
  return apiRequest<{ user: { email: string; username: string } }>("/api/users/me");
}