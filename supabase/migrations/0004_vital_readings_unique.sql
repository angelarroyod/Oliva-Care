-- One reading per vital per control (one save). Makes the offline outbox's
-- replay idempotent: a control resent after its response was lost hits 23505,
-- which flush() counts as already sent, instead of doubling the readings.
create unique index if not exists vital_readings_control_kind_key on public.vital_readings (control_id, kind);
-- The unique index leads with control_id, so it also serves undo's delete by control_id.
drop index if exists public.vital_readings_control_idx;
