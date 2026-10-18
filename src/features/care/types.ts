// Row shapes for supabase/migrations/0003_care_features.sql (+ 0001 tables still in use).
export type VitalKind = 'bp' | 'hr' | 'glucose' | 'spo2' | 'rr' | 'temp' | 'weight' | 'pain';
export type ConditionKind =
  | 'diabetes' | 'hypertension' | 'heart_failure' | 'copd_asthma'
  | 'hypothyroidism' | 'renal_failure' | 'dementia' | 'reduced_mobility';
export type GlucoseCtx = 'fasting' | 'pre_meal' | 'post_meal' | 'bedtime';
export type Severity = 'ok' | 'warn' | 'alert';
export type DoseStatus = 'pending' | 'given' | 'skipped' | 'unrecorded';
export type SkipReason = 'asleep' | 'refused' | 'nausea_vomiting' | 'not_eaten' | 'doctor_order' | 'out_of_stock' | 'other';
export type ReminderMode = 'exact' | 'before';
export type Role = 'nurse' | 'family' | 'doctor';

export type PatientRow = {
  id: string;
  full_name: string;
  age: number | null;
  room: string | null;
  status: string;
  allergies: string[] | null; // text[] (shared with vela-web)
};

// One care-team member, from the care_team() RPC (names + shift windows).
export type MemberRow = {
  id: string;
  patient_id: string;
  profile_id: string;
  role: Role;
  relationship: string | null;
  shift: string | null;
  shift_start: string | null; // 'HH:MM:SS'
  shift_end: string | null;
  profiles: { full_name: string } | null;
};

export type ScheduleRow = {
  id: string;
  patient_id: string;
  name: string;
  dose: string;
  purpose: string | null;
  times: string[]; // 'HH:MM:SS' from Postgres time[]
  reminder_mode: ReminderMode;
  reminder_minutes: number;
  active: boolean;
  start_date: string; // 'YYYY-MM-DD'
  end_date: string | null; // inclusive (planned course)
  suspended_at?: string | null; // "Dejar de dar": nothing expected from this instant on
  created_at: string;
  updated_by: string | null;
  updated_at: string;
};

export type DoseRow = {
  id: string;
  schedule_id: string;
  patient_id: string;
  scheduled_for: string; // ISO instant
  status: DoseStatus;
  recorded_at: string | null;
  recorded_by: string | null;
  recorded_late: boolean;
  skip_reason: SkipReason | null;
  skip_note: string | null;
};

export type ReadingRow = {
  id: string;
  patient_id: string;
  control_id: string;
  kind: VitalKind;
  value: number;
  value2: number | null; // diastolic
  context: GlucoseCtx | null;
  severity: Severity;
  taken_at: string;
  taken_by: string | null;
  note: string | null;
  family_notified: boolean;
};

export type ConditionRow = { patient_id: string; condition: ConditionKind; added_by: string | null; added_at: string };

export type VitalPlanRow = {
  patient_id: string;
  kind: VitalKind;
  frequency: string;
  in_routine: boolean;
  ranges: number[][]; // [[lo,hi]] or [[lo,hi],[lo,hi]] (bp, glucose); [] = no range set
  alert_low: number | null;
  alert_high: number | null;
  source_conditions: ConditionKind[];
  updated_by: string | null;
  updated_at: string;
};

export type EventRow = {
  id: string;
  patient_id: string;
  author_id: string | null;
  type: string; // 'note' | 'doctor_call' | legacy 'vitals' / 'medication'
  title: string | null;
  body: string | null;
  severity: string; // 'info' | 'warning'
  occurred_at: string;
};

export type HandoffRow = {
  id: string;
  patient_id: string;
  nurse_id: string | null;
  summary: string | null;
  recommendation: string | null;
  started_at: string | null;
  ended_at: string | null;
};
