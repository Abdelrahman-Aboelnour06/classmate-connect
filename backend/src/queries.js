import { db } from "./db.js";

const getCoursesQuery = db.prepare("SELECT course_code, course_name FROM courses ORDER BY course_code");

const searchStudentsQuery = db.prepare(`
  SELECT student_id, student_name, student_name_ar
  FROM students
  WHERE student_id LIKE @id
     OR rowid IN (
       SELECT rowid FROM student_search WHERE student_search MATCH @ftsQuery
     )
  ORDER BY student_name
  LIMIT 30
`);

const searchScheduleQuery = db.prepare(`
  SELECT
    s.student_id, s.student_name, s.student_name_ar,
    c.course_code, c.course_name,
    ct.type_name as class_type,
    ts.day_of_week, ts.start_time, ts.end_time,
    cl.location, cl.group_number
  FROM schedules sch
  JOIN students s ON s.id = sch.student_id
  JOIN classes cl ON cl.id = sch.class_id
  JOIN courses c ON c.id = cl.course_id
  JOIN class_types ct ON ct.id = cl.class_type_id
  JOIN time_slots ts ON ts.id = cl.time_slot_id
  WHERE s.student_id LIKE @id
     OR s.rowid IN (SELECT rowid FROM student_search WHERE student_search MATCH @ftsQuery)
  ORDER BY ts.day_of_week, ts.start_time, c.course_code
`);

const strictScheduleQuery = db.prepare(`
  SELECT
    s.student_id, s.student_name, s.student_name_ar,
    c.course_code, c.course_name,
    ct.type_name as class_type,
    ts.day_of_week, ts.start_time, ts.end_time,
    cl.location, cl.group_number
  FROM schedules sch
  JOIN students s ON s.id = sch.student_id
  JOIN classes cl ON cl.id = sch.class_id
  JOIN courses c ON c.id = cl.course_id
  JOIN class_types ct ON ct.id = cl.class_type_id
  JOIN time_slots ts ON ts.id = cl.time_slot_id
  WHERE s.student_id = @query
  ORDER BY ts.day_of_week, ts.start_time, c.course_code
`);

const classRosterQuery = db.prepare(`
  SELECT s.student_id, s.student_name, s.student_name_ar
  FROM schedules sch
  JOIN students s ON s.id = sch.student_id
  JOIN classes cl ON cl.id = sch.class_id
  JOIN courses c ON c.id = cl.course_id
  JOIN class_types ct ON ct.id = cl.class_type_id
  JOIN time_slots ts ON ts.id = cl.time_slot_id
  WHERE c.course_code = @courseCode
    AND ts.day_of_week = @day
    AND ts.start_time = @start
    AND ct.type_name = @type
    AND (@location IS NULL OR cl.location = @location)
  ORDER BY s.student_name
`);

const classmatesQuery = db.prepare(`
  SELECT DISTINCT s.student_id, s.student_name, s.student_name_ar
  FROM enrollments e
  JOIN students s ON s.id = e.student_id
  JOIN courses c ON c.id = e.course_id
  WHERE c.course_code = @courseCode
    AND (@excludeStudentId IS NULL OR s.student_id != @excludeStudentId)
    AND (@studentName IS NULL OR s.student_name != @studentName)
  ORDER BY s.student_name
`);

const classStudentsQuery = db.prepare(`
  SELECT DISTINCT s.student_id, s.student_name, s.student_name_ar
  FROM schedules sc
  JOIN students s ON s.id = sc.student_id
  JOIN classes cl ON cl.id = sc.class_id
  JOIN courses c ON c.id = cl.course_id
  JOIN class_types ct ON ct.id = cl.class_type_id
  JOIN time_slots ts ON ts.id = cl.time_slot_id
  WHERE c.course_code = @courseCode
    AND ct.type_name = @classType
    AND ts.day_of_week = @dayOfWeek
    AND ts.start_time = @startTime
    AND (@groupNumber IS NULL OR cl.group_number = @groupNumber)
  ORDER BY s.student_name
`);

const cohortClassmatesQuery = db.prepare(`
  SELECT DISTINCT s.student_id, s.student_name, s.student_name_ar
  FROM enrollments e
  JOIN students s ON s.id = e.student_id
  JOIN courses c ON c.id = e.course_id
  WHERE c.course_code = @courseCode
    AND s.student_id != @studentId
    AND SUBSTR(s.student_id, 2, 2) = @targetYear
  ORDER BY s.student_name
`);

export const queries = {
  getCourses() {
    return getCoursesQuery.all();
  },
  searchStudents(params) {
    return searchStudentsQuery.all(params);
  },
  searchSchedule(params, strict) {
    return (strict ? strictScheduleQuery : searchScheduleQuery).all(params);
  },
  classRoster(params) {
    return classRosterQuery.all(params);
  },
  classmates(params) {
    return classmatesQuery.all(params);
  },
  classStudents(params) {
    return classStudentsQuery.all(params);
  },
  cohortClassmates(params) {
    return cohortClassmatesQuery.all(params);
  },
};
