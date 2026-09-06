const RAMADAN_HOUR_MAP: Record<number, string> = {
  8: "08:00",
  9: "08:45",
  10: "09:30",
  11: "10:15",
  12: "11:00",
  13: "11:45",
  14: "12:30",
  15: "13:15",
  16: "14:00",
  17: "14:45",
  18: "15:30",
  19: "16:15",
  20: "16:15",
  21: "16:15",
};

function getHour(time: string): number {
  return parseInt(time.split(":")[0], 10);
}

export function convertToRamadanSessionTiming(startTime: string, endTime: string) {
  const startHour = getHour(startTime);
  const endHour = getHour(endTime);

  const requiresMakeup = endHour >= 20;
  const ramadanStartTime = RAMADAN_HOUR_MAP[startHour] || startTime;
  const ramadanEndTime = requiresMakeup ? "16:15" : (RAMADAN_HOUR_MAP[endHour] || endTime);

  return {
    startTime: ramadanStartTime,
    endTime: ramadanEndTime,
    requiresMakeup,
  };
}
