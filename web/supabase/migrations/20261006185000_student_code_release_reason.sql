-- Student codes: a code can be released instead of retired.
--
-- `released` marks a code its holder gave up without reserving it, so it can be issued again
-- (including to another student). It is a separate migration because a new enum value cannot be
-- used in the transaction that adds it; the next migration uses it.

alter type public.student_code_retirement_reason add value if not exists 'released';
