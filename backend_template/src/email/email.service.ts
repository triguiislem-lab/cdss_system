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
  tags?: Array<{ name: string; value: string }>;
};

type ResendEmailResponse = {
  id?: string;
  message?: string;
  name?: string;
};

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly config: ConfigService) {}

  async sendContactMessageNotification(message: ContactMessage) {
    const recipients = this.recipients('CONTACT_NOTIFICATION_TO');
    if (recipients.length === 0) {
      this.logger.warn('CONTACT_NOTIFICATION_TO is empty; contact email skipped.');
      return;
    }

    await this.sendEmail({
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
    await Promise.all([
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
        : Promise.resolve(),
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
        : Promise.resolve(),
    ]);
  }

  async sendPrescriptionDispatchEmail(input: {
    prescription: Prescription;
    target: PharmacyTarget;
    recipient: string;
    channel: DispatchChannel;
    note?: string;
  }) {
    if (input.channel !== DispatchChannel.Email) {
      return;
    }
    if (!this.looksLikeEmail(input.recipient)) {
      this.logger.warn(
        `Prescription dispatch email skipped; invalid recipient: ${input.recipient}`,
      );
      return;
    }

    const prescription = input.prescription;
    const patientName = [
      prescription.patient?.firstName,
      prescription.patient?.lastName,
    ].filter(Boolean).join(' ') || 'Patient';
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

    await this.sendEmail({
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
      tags: [
        { name: 'event', value: 'prescription_dispatch' },
        { name: 'target', value: input.target },
      ],
    });
  }

  private async sendEmail(payload: Omit<ResendEmailPayload, 'from'>) {
    if (!this.emailEnabled()) {
      this.logger.debug('EMAIL_ENABLED=false; Resend email skipped.');
      return;
    }

    const apiKey = this.config.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      this.logger.warn('RESEND_API_KEY is empty; Resend email skipped.');
      return;
    }

    const from = this.config.get<string>(
      'RESEND_FROM',
      'MedCity Connect <onboarding@resend.dev>',
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
        this.logger.error(
          `Resend returned HTTP ${response.status}: ${data.message || data.name || 'unknown error'}`,
        );
        return;
      }

      this.logger.log(`Resend email sent: ${data.id || 'no-id'}`);
    } catch (error) {
      this.logger.error(
        `Resend email failed: ${error instanceof Error ? error.message : String(error)}`,
      );
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

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
