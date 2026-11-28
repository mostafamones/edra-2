-- Keep registered 20-student recipes valid and admit the owner-approved roughly-300-student recipes (280-320).
-- Only a private registry CHECK changes; public API/database TypeScript shapes are unchanged.
alter table edra_private.dev_runs drop constraint dev_runs_student_count_check;
alter table edra_private.dev_runs add constraint dev_runs_student_count_check
  check (student_count = 20 or student_count between 280 and 320);
