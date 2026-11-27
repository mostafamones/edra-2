-- Keep registered 20-student recipes valid and admit the owner-approved 300-student recipe.
-- Only a private registry CHECK changes; public API/database TypeScript shapes are unchanged.
alter table edra_private.dev_runs drop constraint dev_runs_student_count_check;
alter table edra_private.dev_runs add constraint dev_runs_student_count_check
  check (student_count in (20, 300));
