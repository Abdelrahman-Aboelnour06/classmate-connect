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

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  console.log(`📡 API Request: ${init?.method || "GET"} ${path}`, init?.body ? JSON.parse(init.body as string) : "");
  
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(init?.headers || {}),
      },
    });
  } catch (error) {
    console.error("❌ Fetch error:", error);
    throw new Error(`Cannot reach API at ${API_BASE_URL}. Make sure backend is running.`);
  }

  if (!response.ok) {
    const text = await response.text();
    console.error(`❌ API Error (${response.status}):`, text);
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
  console.log(`✅ API Response:`, result);
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

export async function loginAdmin(email: string, password: string): Promise<{ token: string; admin: { email: string } }> {
  return apiRequest("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function runFullUpdate(token: string): Promise<any> {
  return apiRequest("/api/update", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
    },
  });
}

export async function uploadCsvAndMigrate(token: string, csv: string): Promise<any> {
  return apiRequest("/api/upload-csv", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ csv }),
  });
}

export async function generateTimetables(selectedCourses: string[], index = 0, maxResults = 50): Promise<{ 
  current_index: number; 
  total: number; 
  has_next: boolean; 
  timetable: Array<{
    course_code: string;
    course_name: string;
    class_type: string;
    day_of_week: string;
    start_time: string;
    end_time: string;
    location: string | null;
    group_number: string | null;
  }>
}> {
  console.log("📤 generateTimetables called with:", { selectedCourses, index, maxResults });
  return apiRequest("/api/timetables", {
    method: "POST",
    body: JSON.stringify({ selectedCourses, index, maxResults }),
  });
}

export async function findStudentsByCourses(courseCodes: string[], matchType: "all" | "any") {
  return apiRequest<{ count: number; students: Array<{ student_id: string; student_name: string; student_name_ar: string | null }> }>(
    "/api/students-by-courses",
    {
      method: "POST",
      body: JSON.stringify({ courseCodes, matchType }),
    },
  );
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

