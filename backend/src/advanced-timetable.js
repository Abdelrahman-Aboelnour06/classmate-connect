/**
 * Simple Timetable Generator
 * Finds all valid conflict-free timetable combinations for selected courses
 */

const DAY_ORDER = { 'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6 };

function hasTimeConflict(session1, session2) {
  if (session1.day_of_week !== session2.day_of_week) return false;
  return !(session1.end_time <= session2.start_time || session2.end_time <= session1.start_time);
}

export function buildTimetableCombinations(db, selectedCourses, maxResults = 500) {
  const candidates = new Map();

  // Fetch all classes for each course
  for (const code of selectedCourses) {
    const rows = db
      .prepare(
        `SELECT 
          co.course_code, 
          co.course_name,
          ct.type_name as class_type,
          ts.day_of_week, 
          ts.start_time, 
          ts.end_time,
          cl.location,
          cl.group_number
         FROM classes cl
         JOIN courses co ON co.id = cl.course_id
         JOIN class_types ct ON ct.id = cl.class_type_id
         JOIN time_slots ts ON ts.id = cl.time_slot_id
         WHERE co.course_code = ?
         ORDER BY ts.day_of_week, ts.start_time`,
      )
      .all(code);

    if (rows.length === 0) continue;

    // Split into lectures and tutorials
    const lectures = rows.filter((r) => ["lecture", "lec"].includes(r.class_type.toLowerCase()));
    const tutorials = rows.filter((r) => {
      const type = r.class_type.toLowerCase();
      return ["tutorial", "tut", "exercise", "lab", "practical", "section", "workshop"].includes(type);
    });

    if (lectures.length === 0) continue;

    // Build choice sets for this course
    const choiceSets = [];

    // Check if this is GENS or a Seminar course (tutorials optional)
    const isTutorialOptional = code === "GENS" || rows[0].course_name.toLowerCase().includes("seminar");

    if (tutorials.length > 0) {
      // Pair lecture + tutorial (prefer same group, fallback to first 3 tutorials)
      const lecTutPairs = [];
      for (const lec of lectures) {
        const sameTut = tutorials.find((t) => t.group_number === lec.group_number);
        if (sameTut) {
          lecTutPairs.push([lec, sameTut]);
        } else {
          // Fallback: pair with first 3 tutorials
          const fallbackTuts = tutorials.slice(0, 3);
          for (const tut of fallbackTuts) {
            lecTutPairs.push([lec, tut]);
          }
        }
      }
      
      // Add lecture+tutorial pairs
      for (const pair of lecTutPairs) {
        choiceSets.push(pair);
      }

      // Add lecture-only as fallback only if tutorials are optional (GENS or Seminar)
      if (isTutorialOptional) {
        for (const lec of lectures) {
          choiceSets.push([lec]);
        }
      }
    } else {
      // No tutorials available
      if (isTutorialOptional) {
        // For GENS/Seminar: lecture-only is fine
        for (const lec of lectures) {
          choiceSets.push([lec]);
        }
      }
      // For other courses: if no tutorials available, skip this course
    }

    candidates.set(code, choiceSets);
  }

  const courseCodes = [...candidates.keys()];
  
  if (courseCodes.length === 0) {
    return [];
  }

  const results = [];

  function hasConflict(choiceSet, current) {
    for (const session of choiceSet) {
      if (current.some((existing) => hasTimeConflict(existing, session))) {
        return true;
      }
    }
    return false;
  }

  function dfs(courseIndex, current) {
    if (results.length >= maxResults) return;

    if (courseIndex === courseCodes.length) {
      results.push([...current]);
      return;
    }

    const code = courseCodes[courseIndex];
    const choiceSets = candidates.get(code) || [];

    for (const choiceSet of choiceSets) {
      if (hasConflict(choiceSet, current)) continue;

      for (const session of choiceSet) {
        current.push(session);
      }

      dfs(courseIndex + 1, current);

      for (let i = 0; i < choiceSet.length; i++) {
        current.pop();
      }
    }
  }

  dfs(0, []);

  // Sort results by number of unique days (fewer days = more compact), then by day/time
  return results
    .map(schedule => {
      // Count unique days in this schedule
      const uniqueDays = new Set(schedule.map(s => s.day_of_week)).size;
      return {
        schedule: schedule.sort((a, b) => {
          const dayDiff = DAY_ORDER[a.day_of_week] - DAY_ORDER[b.day_of_week];
          if (dayDiff !== 0) return dayDiff;
          return a.start_time.localeCompare(b.start_time);
        }),
        daysCount: uniqueDays
      };
    })
    .sort((a, b) => a.daysCount - b.daysCount)
    .slice(0, maxResults)
    .map(item => item.schedule);
}
