
-- Students table
CREATE TABLE public.students (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id TEXT NOT NULL UNIQUE,
  student_name TEXT NOT NULL,
  student_name_ar TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Courses table
CREATE TABLE public.courses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  course_code TEXT NOT NULL UNIQUE,
  course_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Class types table
CREATE TABLE public.class_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type_name TEXT NOT NULL UNIQUE
);

-- Time slots table
CREATE TABLE public.time_slots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  day_of_week TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  UNIQUE(day_of_week, start_time, end_time)
);

-- Classes table
CREATE TABLE public.classes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  time_slot_id UUID NOT NULL REFERENCES public.time_slots(id) ON DELETE CASCADE,
  class_type_id UUID NOT NULL REFERENCES public.class_types(id) ON DELETE CASCADE,
  location TEXT,
  group_number TEXT,
  UNIQUE(course_id, time_slot_id, class_type_id, location, group_number)
);

-- Enrollments table
CREATE TABLE public.enrollments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  UNIQUE(student_id, course_id)
);

-- Schedules table
CREATE TABLE public.schedules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  UNIQUE(student_id, class_id)
);

-- Performance indexes
CREATE INDEX idx_students_student_id ON public.students(student_id);
CREATE INDEX idx_students_student_name ON public.students(student_name);
CREATE INDEX idx_students_student_name_ar ON public.students(student_name_ar);
CREATE INDEX idx_courses_course_code ON public.courses(course_code);
CREATE INDEX idx_courses_course_name ON public.courses(course_name);
CREATE INDEX idx_time_slots_day ON public.time_slots(day_of_week);
CREATE INDEX idx_classes_course_id ON public.classes(course_id);
CREATE INDEX idx_classes_time_slot_id ON public.classes(time_slot_id);
CREATE INDEX idx_classes_class_type_id ON public.classes(class_type_id);
CREATE INDEX idx_enrollments_student_id ON public.enrollments(student_id);
CREATE INDEX idx_enrollments_course_id ON public.enrollments(course_id);
CREATE INDEX idx_schedules_student_id ON public.schedules(student_id);
CREATE INDEX idx_schedules_class_id ON public.schedules(class_id);

-- RLS (public read, insert via edge functions)
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;

-- Public read policies (this is a public university tool, no auth needed)
CREATE POLICY "Public read students" ON public.students FOR SELECT USING (true);
CREATE POLICY "Public read courses" ON public.courses FOR SELECT USING (true);
CREATE POLICY "Public read class_types" ON public.class_types FOR SELECT USING (true);
CREATE POLICY "Public read time_slots" ON public.time_slots FOR SELECT USING (true);
CREATE POLICY "Public read classes" ON public.classes FOR SELECT USING (true);
CREATE POLICY "Public read enrollments" ON public.enrollments FOR SELECT USING (true);
CREATE POLICY "Public read schedules" ON public.schedules FOR SELECT USING (true);

-- Service role insert policies (edge functions use service role)
CREATE POLICY "Service insert students" ON public.students FOR INSERT WITH CHECK (true);
CREATE POLICY "Service insert courses" ON public.courses FOR INSERT WITH CHECK (true);
CREATE POLICY "Service insert class_types" ON public.class_types FOR INSERT WITH CHECK (true);
CREATE POLICY "Service insert time_slots" ON public.time_slots FOR INSERT WITH CHECK (true);
CREATE POLICY "Service insert classes" ON public.classes FOR INSERT WITH CHECK (true);
CREATE POLICY "Service insert enrollments" ON public.enrollments FOR INSERT WITH CHECK (true);
CREATE POLICY "Service insert schedules" ON public.schedules FOR INSERT WITH CHECK (true);
