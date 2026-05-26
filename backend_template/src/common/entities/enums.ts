export enum UserRole {
  Admin = 'admin',
  Doctor = 'doctor',
}

export enum DoctorStatus {
  Active = 'active',
  Inactive = 'inactive',
}

export enum Gender {
  Male = 'male',
  Female = 'female',
  Other = 'other',
}

export enum ConsultationStatus {
  Scheduled = 'scheduled',
  InProgress = 'in_progress',
  Completed = 'completed',
  Cancelled = 'cancelled',
}

export enum PrescriptionStatus {
  Draft = 'draft',
  PendingReview = 'pending_review',
  Validated = 'validated',
  Rejected = 'rejected',
  Cancelled = 'cancelled',
}

export enum RiskLevel {
  High = 'high',
  Medium = 'medium',
  Low = 'low',
}

export enum MedicationStatus {
  AiProposed = 'ai_proposed',
  Edited = 'edited',
  Validated = 'validated',
  Rejected = 'rejected',
}

export enum ReimbursementRate {
  Full = '100%',
  High = '85%',
  Partial = '40%',
  None = '0%',
}

export enum PregnancyStatus {
  Authorized = 'Autorise',
  Precaution = 'Precaution',
  Contraindicated = 'Contre-indique',
}

export enum ContributionKind {
  NewMedicine = 'new_medicine',
  Correction = 'correction',
  Note = 'note',
}

export enum ContributionStatus {
  Pending = 'pending',
  Validated = 'validated',
  Refused = 'refused',
}

export enum PharmacyTarget {
  Pharmacist = 'pharmacist',
  Patient = 'patient',
}

export enum DispatchChannel {
  Email = 'email',
  Sms = 'sms',
  Portal = 'portal',
  Fax = 'fax',
}

export enum DispatchStatus {
  Sent = 'sent',
  Received = 'received',
  Cancelled = 'cancelled',
}

export enum AlertSeverity {
  Critical = 'critical',
  Major = 'major',
  Moderate = 'moderate',
  Minor = 'minor',
  Info = 'info',
}

export enum CmsStatus {
  Published = 'published',
  Draft = 'draft',
  Archived = 'archived',
}
