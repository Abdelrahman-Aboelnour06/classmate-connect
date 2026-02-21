export function normalizeArabic(text = "") {
  return String(text)
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .trim();
}

export function extractLocationCode(raw = "") {
  const match = String(raw).match(/\[(\d+)\]/);
  return match ? match[1] : String(raw).trim();
}

export function to24Hour(timeValue = "") {
  const value = String(timeValue).trim();
  // Accept both H:MM and HH:MM formats
  if (/^\d{1,2}:\d{2}$/.test(value)) {
    const parts = value.split(':');
    let hour = Number(parts[0]);
    // If hour is 1-7 (no AM/PM designation), treat as PM since uni operates 8 AM - 10 PM
    if (hour >= 1 && hour <= 7) {
      hour += 12;
    }
    return `${String(hour).padStart(2, '0')}:${parts[1]}`;
  }
  const match = value.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return "";
  let hour = Number(match[1]);
  const minute = match[2];
  const meridiem = match[3].toUpperCase();
  if (meridiem === "PM" && hour !== 12) hour += 12;
  if (meridiem === "AM" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${minute}`;
}

export function toDisplayTime(timeValue = "") {
  const normalized = to24Hour(timeValue);
  if (!normalized) return "";
  const [h, m] = normalized.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const displayHour = h % 12 || 12;
  return `${displayHour}:${String(m).padStart(2, "0")} ${ampm}`;
}
