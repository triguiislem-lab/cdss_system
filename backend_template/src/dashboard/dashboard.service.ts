import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditEntry } from '../audit/audit-entry.entity';
import { Consultation } from '../consultations/consultation.entity';
import {
  CmsStatus,
  ConsultationStatus,
  ContributionStatus,
  DoctorStatus,
  PrescriptionStatus,
  RiskLevel,
} from '../common/entities/enums';
import {
  ContactMessage,
  ContactMessageStatus,
  NewsletterSubscription,
  NewsletterSubscriptionStatus,
  Post,
} from '../cms/cms.entities';
import { DoctorProfile } from '../doctors/doctor-profile.entity';
import { MedicineContribution } from '../medicine-contributions/medicine-contribution.entity';
import { FirebaseMedicinesCatalog } from '../medicines/firebase-medicines.catalog';
import { Medicine } from '../medicines/medicine.entity';
import { Patient } from '../patients/patient.entity';
import { Prescription } from '../prescriptions/prescription.entity';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(AuditEntry)
    private readonly audits: Repository<AuditEntry>,
    @InjectRepository(Consultation)
    private readonly consultations: Repository<Consultation>,
    @InjectRepository(ContactMessage)
    private readonly contactMessages: Repository<ContactMessage>,
    @InjectRepository(DoctorProfile)
    private readonly doctors: Repository<DoctorProfile>,
    @InjectRepository(Medicine)
    private readonly medicines: Repository<Medicine>,
    @InjectRepository(MedicineContribution)
    private readonly contributions: Repository<MedicineContribution>,
    @InjectRepository(NewsletterSubscription)
    private readonly newsletter: Repository<NewsletterSubscription>,
    @InjectRepository(Patient)
    private readonly patients: Repository<Patient>,
    @InjectRepository(Post)
    private readonly posts: Repository<Post>,
    @InjectRepository(Prescription)
    private readonly prescriptions: Repository<Prescription>,
    private readonly firebaseCatalog: FirebaseMedicinesCatalog,
  ) {}

  async adminSummary() {
    const [medicineCount, prescriptions, consultations] = await Promise.all([
      this.catalogCount(),
      this.prescriptionCounts(),
      this.consultationCounts(),
    ]);

    const [doctorTotal, activeDoctors, patientTotal, auditTotal, pendingContributions, validatedContributions, refusedContributions, publishedPosts, draftPosts, archivedPosts, newMessages, contactTotal, activeNewsletter, newsletterTotal] = await Promise.all([
      this.doctors.count(),
      this.doctors.count({ where: { status: DoctorStatus.Active } }),
      this.patients.count(),
      this.audits.count(),
      this.contributions.count({ where: { status: ContributionStatus.Pending } }),
      this.contributions.count({ where: { status: ContributionStatus.Validated } }),
      this.contributions.count({ where: { status: ContributionStatus.Refused } }),
      this.posts.count({ where: { status: CmsStatus.Published } }),
      this.posts.count({ where: { status: CmsStatus.Draft } }),
      this.posts.count({ where: { status: CmsStatus.Archived } }),
      this.contactMessages.count({ where: { status: ContactMessageStatus.New } }),
      this.contactMessages.count(),
      this.newsletter.count({ where: { status: NewsletterSubscriptionStatus.Active } }),
      this.newsletter.count(),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      source: 'NestJS aggregate queries',
      doctors: { total: doctorTotal, active: activeDoctors, inactive: Math.max(0, doctorTotal - activeDoctors) },
      patients: { total: patientTotal },
      medicines: medicineCount,
      prescriptions,
      consultations,
      contributions: { pending: pendingContributions, validated: validatedContributions, refused: refusedContributions },
      auditEntries: auditTotal,
      cms: { published: publishedPosts, draft: draftPosts, archived: archivedPosts },
      contactMessages: { total: contactTotal, new: newMessages },
      newsletter: { total: newsletterTotal, active: activeNewsletter },
    };
  }

  async doctorSummary(userId: string) {
    const doctor = await this.doctors.findOne({ where: { userId } });
    if (!doctor) throw new NotFoundException('Doctor profile not found');

    const doctorId = doctor.id;
    const now = new Date();
    const [patientTotal, prescriptions, consultations] = await Promise.all([
      this.doctorPatientCount(doctorId),
      this.prescriptionCounts(doctorId),
      this.consultationCounts(doctorId, now),
    ]);

    return {
      generatedAt: now.toISOString(),
      source: 'NestJS aggregate queries',
      patients: { total: patientTotal },
      prescriptions,
      consultations,
    };
  }

  private async catalogCount() {
    if (this.firebaseCatalog.enabled()) {
      try {
        return { total: (await this.firebaseCatalog.list()).length, source: 'Firebase', available: true };
      } catch {
        return { total: null, source: 'Firebase', available: false };
      }
    }
    return { total: await this.medicines.count(), source: 'PostgreSQL', available: true };
  }

  private async prescriptionCounts(doctorId?: string) {
    const where = doctorId ? { doctorId } : undefined;
    const [total, drafts, pendingReview, validated, rejected, cancelled, highRisk] = await Promise.all([
      this.prescriptions.count({ where }),
      this.prescriptions.count({ where: { ...where, status: PrescriptionStatus.Draft } }),
      this.prescriptions.count({ where: { ...where, status: PrescriptionStatus.PendingReview } }),
      this.prescriptions.count({ where: { ...where, status: PrescriptionStatus.Validated } }),
      this.prescriptions.count({ where: { ...where, status: PrescriptionStatus.Rejected } }),
      this.prescriptions.count({ where: { ...where, status: PrescriptionStatus.Cancelled } }),
      this.prescriptions.count({ where: { ...where, risk: RiskLevel.High } }),
    ]);
    return { total, drafts, pendingReview, validated, rejected, cancelled, highRisk };
  }

  private doctorPatientCount(doctorId: string) {
    return this.patients
      .createQueryBuilder('patient')
      .leftJoin('patient.consultations', 'consultation')
      .leftJoin('patient.prescriptions', 'prescription')
      .where(
        'patient.ownerDoctorId = :doctorId OR consultation.doctorId = :doctorId OR prescription.doctorId = :doctorId',
        { doctorId },
      )
      .distinct(true)
      .getCount();
  }

  private async consultationCounts(doctorId?: string, now = new Date()) {
    const base = this.consultations.createQueryBuilder('consultation');
    if (doctorId) base.where('consultation.doctorId = :doctorId', { doctorId });
    const count = (status: ConsultationStatus) => {
      const query = base.clone().andWhere('consultation.status = :status', { status });
      return query.getCount();
    };
    const upcomingQuery = base.clone()
      .andWhere('consultation.status = :scheduled', { scheduled: ConsultationStatus.Scheduled })
      .andWhere('consultation.scheduledAt >= :now', { now });
    const [total, scheduled, upcoming, inProgress, completed, cancelled] = await Promise.all([
      base.clone().getCount(),
      count(ConsultationStatus.Scheduled),
      upcomingQuery.getCount(),
      count(ConsultationStatus.InProgress),
      count(ConsultationStatus.Completed),
      count(ConsultationStatus.Cancelled),
    ]);
    return { total, scheduled, upcoming, inProgress, completed, cancelled };
  }
}
