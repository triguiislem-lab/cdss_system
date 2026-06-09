import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DispatchChannel,
  PharmacyTarget,
} from '../common/entities/enums';
import {
  ContactMessage,
  NewsletterSubscription,
} from '../cms/cms.entities';
import { Prescription } from '../prescriptions/prescription.entity';

type ResendEmailPayload = {
  from: string;
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  reply_to?: string;
  attachments?: Array<{
    filename: string;
    content: string;
    content_type?: string;
  }>;
  tags?: Array<{ name: string; value: string }>;
};

type ResendEmailResponse = {
  id?: string;
  message?: string;
  name?: string;
};

export type EmailDeliveryResult = {
  status: 'sent' | 'skipped' | 'failed';
  id?: string;
  reason?: string;
};

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly config: ConfigService) {}

  async sendContactMessageNotification(message: ContactMessage) {
    const recipients = this.recipients('CONTACT_NOTIFICATION_TO');
    if (recipients.length === 0) {
      this.logger.warn('CONTACT_NOTIFICATION_TO is empty; contact email skipped.');
      return {
        status: 'skipped',
        reason: 'CONTACT_NOTIFICATION_TO is empty',
      } satisfies EmailDeliveryResult;
    }

    return this.sendEmail({
      to: recipients,
      subject: `[MedCity] Nouveau message contact: ${message.subject || 'Sans objet'}`,
      reply_to: message.email,
      html: `
        <h2>Nouveau message contact</h2>
        <p><strong>Nom:</strong> ${this.escapeHtml(message.name)}</p>
        <p><strong>Email:</strong> ${this.escapeHtml(message.email)}</p>
        <p><strong>Source:</strong> ${this.escapeHtml(message.source)}</p>
        <p><strong>Sujet:</strong> ${this.escapeHtml(message.subject || 'Sans objet')}</p>
        <hr />
        <p>${this.escapeHtml(message.message).replace(/\n/g, '<br />')}</p>
      `,
      text: [
        'Nouveau message contact',
        `Nom: ${message.name}`,
        `Email: ${message.email}`,
        `Source: ${message.source}`,
        `Sujet: ${message.subject || 'Sans objet'}`,
        '',
        message.message,
      ].join('\n'),
      tags: [
        { name: 'event', value: 'contact_message' },
        { name: 'source', value: this.tagValue(message.source) },
      ],
    });
  }

  async sendNewsletterSubscriptionEmails(subscription: NewsletterSubscription) {
    const adminRecipients = this.recipients('NEWSLETTER_NOTIFICATION_TO');
    return Promise.all([
      adminRecipients.length
        ? this.sendEmail({
            to: adminRecipients,
            subject: '[MedCity] Nouvel abonnement newsletter',
            html: `
              <h2>Nouvel abonnement newsletter</h2>
              <p><strong>Email:</strong> ${this.escapeHtml(subscription.email)}</p>
              <p><strong>Source:</strong> ${this.escapeHtml(subscription.source)}</p>
              <p><strong>Status:</strong> ${this.escapeHtml(subscription.status)}</p>
            `,
            text: [
              'Nouvel abonnement newsletter',
              `Email: ${subscription.email}`,
              `Source: ${subscription.source}`,
              `Status: ${subscription.status}`,
            ].join('\n'),
            tags: [
              { name: 'event', value: 'newsletter_subscription' },
              { name: 'source', value: this.tagValue(subscription.source) },
            ],
          })
        : Promise.resolve({
            status: 'skipped',
            reason: 'NEWSLETTER_NOTIFICATION_TO is empty',
          } satisfies EmailDeliveryResult),
      this.newsletterConfirmationEnabled()
        ? this.sendEmail({
            to: subscription.email,
            subject: 'Bienvenue dans la newsletter MedCity',
            html: `
              <h2>Bienvenue dans la newsletter MedCity</h2>
              <p>Votre inscription est bien enregistree.</p>
              <p>Vous recevrez nos actualites medicales et les mises a jour importantes de la plateforme.</p>
            `,
            text: [
              'Bienvenue dans la newsletter MedCity',
              'Votre inscription est bien enregistree.',
              'Vous recevrez nos actualites medicales et les mises a jour importantes de la plateforme.',
            ].join('\n'),
            tags: [{ name: 'event', value: 'newsletter_confirmation' }],
          })
        : Promise.resolve({
            status: 'skipped',
            reason: 'Newsletter confirmation disabled',
          } satisfies EmailDeliveryResult),
    ]);
  }

  async sendNewsletterCampaign(input: {
    recipients: string[];
    subject: string;
    message: string;
  }) {
    const recipients = Array.from(
      new Set(
        input.recipients
          .map((email) => email.trim().toLowerCase())
          .filter((email) => this.looksLikeEmail(email)),
      ),
    );

    if (recipients.length === 0) {
      return {
        total: 0,
        sent: 0,
        failed: 0,
        skipped: 0,
        results: [],
      };
    }

    const results = await Promise.all(
      recipients.map(async (recipient) => ({
        recipient,
        ...(await this.sendEmail({
          to: recipient,
          subject: input.subject,
          html: `
            <h2>${this.escapeHtml(input.subject)}</h2>
            <p>${this.escapeHtml(input.message).replace(/\n/g, '<br />')}</p>
          `,
          text: input.message,
          tags: [{ name: 'event', value: 'newsletter_campaign' }],
        })),
      })),
    );

    return {
      total: recipients.length,
      sent: results.filter((result) => result.status === 'sent').length,
      failed: results.filter((result) => result.status === 'failed').length,
      skipped: results.filter((result) => result.status === 'skipped').length,
      results,
    };
  }

  async sendDoctorCredentialsEmail(input: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
  }) {
    const doctorName = [input.firstName, input.lastName].filter(Boolean).join(' ');
    const loginUrl = this.config.get<string>('FRONTEND_PUBLIC_URL', '').replace(/\/$/, '');
    const loginLine = loginUrl ? `${loginUrl}/login` : 'MedCity Connect';

    return this.sendEmail({
      to: input.email,
      subject: 'Vos identifiants MedCity Connect',
      html: `
        <h2>Bienvenue sur MedCity Connect</h2>
        <p>Bonjour Dr. ${this.escapeHtml(doctorName || input.email)},</p>
        <p>Votre compte medecin a ete cree par l'administration MedCity.</p>
        <p><strong>Email:</strong> ${this.escapeHtml(input.email)}</p>
        <p><strong>Mot de passe initial:</strong> ${this.escapeHtml(input.password)}</p>
        ${loginUrl ? `<p><strong>Lien de connexion:</strong> <a href="${this.escapeHtml(loginUrl)}/login">${this.escapeHtml(loginUrl)}/login</a></p>` : ''}
        <p>Pour des raisons de securite, veuillez changer ce mot de passe apres votre premiere connexion.</p>
      `,
      text: [
        'Bienvenue sur MedCity Connect',
        `Bonjour Dr. ${doctorName || input.email},`,
        "Votre compte medecin a ete cree par l'administration MedCity.",
        `Email: ${input.email}`,
        `Mot de passe initial: ${input.password}`,
        `Connexion: ${loginLine}`,
        'Pour des raisons de securite, veuillez changer ce mot de passe apres votre premiere connexion.',
      ].join('\n'),
      tags: [{ name: 'event', value: 'doctor_credentials' }],
    });
  }

  async sendPasswordResetEmail(input: {
    email: string;
    firstName?: string;
    lastName?: string;
    resetToken: string;
    expiresMinutes: number;
  }) {
    const doctorName = [input.firstName, input.lastName].filter(Boolean).join(' ');
    const frontendUrl = this.config.get<string>('FRONTEND_PUBLIC_URL', '').replace(/\/$/, '');
    const resetUrl = frontendUrl
      ? `${frontendUrl}/reset-password?token=${encodeURIComponent(input.resetToken)}`
      : `Reset token: ${input.resetToken}`;

    return this.sendEmail({
      to: input.email,
      subject: 'Reinitialisation de votre mot de passe MedCity',
      html: `
        <h2>Reinitialisation du mot de passe</h2>
        <p>Bonjour Dr. ${this.escapeHtml(doctorName || input.email)},</p>
        <p>Une demande de reinitialisation de mot de passe a ete recue pour votre compte MedCity.</p>
        ${
          frontendUrl
            ? `<p><a href="${this.escapeHtml(resetUrl)}">Definir un nouveau mot de passe</a></p>`
            : `<p><strong>Token:</strong> ${this.escapeHtml(input.resetToken)}</p>`
        }
        <p>Ce lien expire dans ${input.expiresMinutes} minutes.</p>
        <p>Si vous n'etes pas a l'origine de cette demande, ignorez cet email.</p>
      `,
      text: [
        'Reinitialisation du mot de passe MedCity',
        `Bonjour Dr. ${doctorName || input.email},`,
        'Une demande de reinitialisation de mot de passe a ete recue pour votre compte MedCity.',
        `Lien/token: ${resetUrl}`,
        `Expiration: ${input.expiresMinutes} minutes`,
        "Si vous n'etes pas a l'origine de cette demande, ignorez cet email.",
      ].join('\n'),
      tags: [{ name: 'event', value: 'doctor_password_reset' }],
    });
  }

  async sendPrescriptionDispatchEmail(input: {
    prescription: Prescription;
    target: PharmacyTarget;
    recipient: string;
    channel: DispatchChannel;
    note?: string;
  }) {
    if (input.channel !== DispatchChannel.Email) {
      return {
        status: 'skipped',
        reason: 'Dispatch channel is not email',
      } satisfies EmailDeliveryResult;
    }
    if (!this.looksLikeEmail(input.recipient)) {
      this.logger.warn(
        `Prescription dispatch email skipped; invalid recipient: ${input.recipient}`,
      );
      return {
        status: 'skipped',
        reason: 'Invalid email recipient',
      } satisfies EmailDeliveryResult;
    }

    const prescription = input.prescription;
    const patientName = [
      prescription.patient?.firstName,
      prescription.patient?.lastName,
    ].filter(Boolean).join(' ') || 'Patient';
    const patientSummary = this.patientSummary(
      prescription.patient?.birthDate,
      prescription.patient?.gender,
    );
    const doctorName = [
      prescription.doctor?.firstName,
      prescription.doctor?.lastName,
    ].filter(Boolean).join(' ') || 'MedCity';
    const targetLabel =
      input.target === PharmacyTarget.Patient ? 'patient' : 'pharmacie';
    const medicationRows = [...(prescription.medications ?? [])]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((medication) => `
        <tr>
          <td>${this.escapeHtml(medication.medicineName)}</td>
          <td>${this.escapeHtml(medication.dosage)}</td>
          <td>${this.escapeHtml(medication.frequency)}</td>
          <td>${this.escapeHtml(medication.duration || '')}</td>
          <td>${this.escapeHtml(medication.instructions || medication.indication || '')}</td>
        </tr>
      `)
      .join('');
    const pdf = this.buildPrescriptionPdf({
      prescriptionNumber: prescription.prescriptionNumber,
      patientName,
      patientSummary,
      doctorName,
      diagnosis: prescription.diagnosis,
      notes: prescription.notes,
      medications: [...(prescription.medications ?? [])].sort(
        (a, b) => a.sortOrder - b.sortOrder,
      ).map((medication) => ({
        name: medication.medicineName,
        dosage: medication.dosage,
        route: medication.route || '',
        frequency: medication.frequency,
        duration: medication.duration || '',
        indication: medication.indication || '',
        instructions: medication.instructions || '',
      })),
    });

    return this.sendEmail({
      to: input.recipient,
      subject: `[MedCity] Ordonnance ${prescription.prescriptionNumber}`,
      html: `
        <h2>Ordonnance MedCity</h2>
        <p>Bonjour,</p>
        <p>Une ordonnance a ete transmise a votre attention via MedCity.</p>
        <p><strong>Numero:</strong> ${this.escapeHtml(prescription.prescriptionNumber)}</p>
        <p><strong>Patient:</strong> ${this.escapeHtml(patientName)}</p>
        <p><strong>Medecin:</strong> Dr. ${this.escapeHtml(doctorName)}</p>
        ${prescription.diagnosis ? `<p><strong>Diagnostic / indication:</strong> ${this.escapeHtml(prescription.diagnosis)}</p>` : ''}
        ${input.note ? `<p><strong>Note:</strong> ${this.escapeHtml(input.note)}</p>` : ''}
        <table border="1" cellpadding="6" cellspacing="0">
          <thead>
            <tr>
              <th>Medicament</th>
              <th>Dosage</th>
              <th>Frequence</th>
              <th>Duree</th>
              <th>Instructions</th>
            </tr>
          </thead>
          <tbody>${medicationRows}</tbody>
        </table>
        <p>Ce message est destine au ${this.escapeHtml(targetLabel)} indique par le prescripteur.</p>
      `,
      text: [
        'Ordonnance MedCity',
        `Numero: ${prescription.prescriptionNumber}`,
        `Patient: ${patientName}`,
        `Medecin: Dr. ${doctorName}`,
        prescription.diagnosis ? `Diagnostic / indication: ${prescription.diagnosis}` : '',
        input.note ? `Note: ${input.note}` : '',
        '',
        ...(prescription.medications ?? []).map((medication) =>
          [
            medication.medicineName,
            medication.dosage,
            medication.frequency,
            medication.duration,
            medication.instructions || medication.indication,
          ].filter(Boolean).join(' - '),
        ),
      ].filter(Boolean).join('\n'),
      attachments: [
        {
          filename: `${this.safeFilename(prescription.prescriptionNumber)}.pdf`,
          content: pdf.toString('base64'),
          content_type: 'application/pdf',
        },
      ],
      tags: [
        { name: 'event', value: 'prescription_dispatch' },
        { name: 'target', value: input.target },
      ],
    });
  }

  private async sendEmail(payload: Omit<ResendEmailPayload, 'from'>) {
    if (!this.emailEnabled()) {
      this.logger.debug('EMAIL_ENABLED=false; Resend email skipped.');
      return {
        status: 'skipped',
        reason: 'EMAIL_ENABLED=false',
      } satisfies EmailDeliveryResult;
    }

    const apiKey = this.config.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      this.logger.warn('RESEND_API_KEY is empty; Resend email skipped.');
      return {
        status: 'skipped',
        reason: 'RESEND_API_KEY is empty',
      } satisfies EmailDeliveryResult;
    }

    const from = this.config.get<string>(
      'RESEND_FROM',
      'MedCity Connect <noreply@triguiislem.me>',
    );
    const timeoutMs = this.config.get<number>('RESEND_TIMEOUT_MS', 10000);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': 'medcity-connect/1.0',
        },
        body: JSON.stringify({
          from,
          ...payload,
        } satisfies ResendEmailPayload),
      });

      const data = (await response.json().catch(() => ({}))) as ResendEmailResponse;
      if (!response.ok) {
        const reason =
          data.message || data.name || `Resend HTTP ${response.status}`;
        this.logger.error(`Resend returned HTTP ${response.status}: ${reason}`);
        return {
          status: 'failed',
          reason,
        } satisfies EmailDeliveryResult;
      }

      this.logger.log(`Resend email sent: ${data.id || 'no-id'}`);
      return {
        status: 'sent',
        id: data.id,
      } satisfies EmailDeliveryResult;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Resend email failed: ${reason}`);
      return {
        status: 'failed',
        reason,
      } satisfies EmailDeliveryResult;
    } finally {
      clearTimeout(timeout);
    }
  }

  private recipients(key: string) {
    return this.config
      .get<string>(key, '')
      .split(',')
      .map((email) => email.trim())
      .filter(Boolean);
  }

  private emailEnabled() {
    return this.config.get<string>('EMAIL_ENABLED', 'true') === 'true';
  }

  private newsletterConfirmationEnabled() {
    return (
      this.config.get<string>('NEWSLETTER_CONFIRMATION_ENABLED', 'true') ===
      'true'
    );
  }

  private tagValue(value: string) {
    const normalized = value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 256);
    return normalized || 'unknown';
  }

  private looksLikeEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  }

  private buildPrescriptionPdf(input: {
    prescriptionNumber: string;
    patientName: string;
    patientSummary?: string;
    doctorName: string;
    diagnosis?: string;
    notes?: string;
    medications: Array<{
      name: string;
      dosage: string;
      route: string;
      frequency: string;
      duration: string;
      indication: string;
      instructions: string;
    }>;
  }) {
    const contentLines: string[] = [];
    const text = (
      value: string,
      x: number,
      y: number,
      size = 10,
      bold = false,
    ) => {
      contentLines.push(
        'BT',
        `${bold ? '/F2' : '/F1'} ${size} Tf`,
        `${x} ${y} Td`,
        `(${this.escapePdfText(value)}) Tj`,
        'ET',
      );
    };
    const line = (x1: number, y1: number, x2: number, y2: number) => {
      contentLines.push(`0.75 w ${x1} ${y1} m ${x2} ${y2} l S`);
    };
    const rect = (x: number, y: number, width: number, height: number) => {
      contentLines.push(`0.65 w ${x} ${y} ${width} ${height} re S`);
    };

    text('MedCity Connect', 262, 800, 7, true);
    text('MedCity - Ordonnance numerique', 88, 770, 14, true);
    text(`Digital prescription - ${input.prescriptionNumber}`, 88, 754, 8);
    text(`Date: ${this.formatDisplayDate(new Date())}`, 430, 775, 8);
    text(`Prescriber: Dr. ${input.doctorName}`, 386, 761, 8, true);
    line(50, 730, 545, 730);

    text('PATIENT', 50, 708, 8, true);
    text(input.patientName, 50, 691, 10, true);
    if (input.patientSummary) text(input.patientSummary, 50, 678, 8);

    text('DIAGNOSIS / INDICATION', 305, 708, 8, true);
    const diagnosisLines = this.wrapText(input.diagnosis || 'Non renseigne', 42);
    diagnosisLines.slice(0, 3).forEach((value, index) => {
      text(value, 305, 691 - index * 13, 9);
    });
    if (input.notes) {
      this.wrapText(input.notes, 42).slice(0, 3).forEach((value, index) => {
        text(value, 305, 650 - index * 12, 8);
      });
    }

    text('PRESCRIPTION', 50, 626, 8, true);
    let y = 590;
    input.medications.forEach((medication, index) => {
      const instruction = medication.instructions || medication.indication;
      const instructionLines = instruction ? this.wrapText(instruction, 52) : [];
      const cardHeight = Math.max(64, 58 + Math.max(0, instructionLines.length - 1) * 11);
      rect(50, y - cardHeight + 22, 495, cardHeight);
      text(`${index + 1}. ${medication.name}`, 66, y, 11, true);
      if (instructionLines[0]) text(instructionLines[0], 230, y, 8);
      instructionLines.slice(1, 4).forEach((value, lineIndex) => {
        text(value, 230, y - 12 - lineIndex * 11, 8);
      });

      const detailY = y - cardHeight + 42;
      text('DOSE', 66, detailY + 14, 7, true);
      text(medication.dosage || '-', 66, detailY, 8);
      text('ROUTE', 185, detailY + 14, 7, true);
      text(medication.route || '-', 185, detailY, 8);
      text('FREQUENCY', 305, detailY + 14, 7, true);
      text(medication.frequency || '-', 305, detailY, 8);
      text('DURATION', 425, detailY + 14, 7, true);
      text(medication.duration || '-', 425, detailY, 8);
      y -= cardHeight + 16;
    });

    line(50, 180, 545, 180);
    line(425, 135, 545, 135);
    text('Signature', 510, 121, 8);
    const stream = contentLines.join('\n');
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
      `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
    ];
    const chunks = ['%PDF-1.4\n'];
    const offsets: number[] = [0];
    for (const [index, object] of objects.entries()) {
      offsets.push(Buffer.byteLength(chunks.join(''), 'latin1'));
      chunks.push(`${index + 1} 0 obj\n${object}\nendobj\n`);
    }
    const xrefOffset = Buffer.byteLength(chunks.join(''), 'latin1');
    chunks.push(`xref\n0 ${objects.length + 1}\n`);
    chunks.push('0000000000 65535 f \n');
    offsets.slice(1).forEach((offset) => {
      chunks.push(`${String(offset).padStart(10, '0')} 00000 n \n`);
    });
    chunks.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
    return Buffer.from(chunks.join(''), 'latin1');
  }

  private wrapText(value: string, maxLength: number) {
    const words = value.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (next.length > maxLength && current) {
        lines.push(current);
        current = word;
      } else {
        current = next;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  private patientSummary(birthDate?: Date | string, gender?: string) {
    const parts: string[] = [];
    const age = this.ageYears(birthDate);
    if (age !== undefined) parts.push(`${age} ans`);
    if (gender) parts.push(this.genderLabel(gender));
    return parts.join(' - ');
  }

  private ageYears(birthDate?: Date | string) {
    if (!birthDate) return undefined;
    const date = new Date(birthDate);
    if (Number.isNaN(date.getTime())) return undefined;
    const now = new Date();
    let age = now.getFullYear() - date.getFullYear();
    const monthDiff = now.getMonth() - date.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < date.getDate())) {
      age -= 1;
    }
    return age >= 0 ? age : undefined;
  }

  private genderLabel(gender: string) {
    const normalized = gender.toLowerCase();
    if (normalized === 'male') return 'Homme';
    if (normalized === 'female') return 'Femme';
    return gender;
  }

  private formatDisplayDate(date: Date) {
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  }

  private escapePdfText(value: string) {
    return this.toPdfSafeText(value)
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');
  }

  private toPdfSafeText(value: string) {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\x20-\x7E]/g, ' ');
  }

  private safeFilename(value: string) {
    return value.replace(/[^a-zA-Z0-9_-]/g, '_') || 'ordonnance';
  }

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
