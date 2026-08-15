import nodemailer from 'nodemailer';
import { logger } from '../utils/logger';

export interface NotificationResult {
  success: boolean;
  temporary: boolean;
  reason?: string;
}

export class EtherealEmailProvider {
  private static transporter: nodemailer.Transporter | null = null;
  private static testAccount: nodemailer.TestAccount | null = null;

  static async init() {
    if (this.transporter) return;
    logger.info('Initializing Ethereal Email test account...');
    this.testAccount = await nodemailer.createTestAccount();
    
    this.transporter = nodemailer.createTransport({
      host: this.testAccount.smtp.host,
      port: this.testAccount.smtp.port,
      secure: this.testAccount.smtp.secure,
      auth: {
        user: this.testAccount.user,
        pass: this.testAccount.pass,
      },
    });
    logger.info(`Ethereal account created. Web UI: https://ethereal.email/login`);
  }

  static async sendNotification(emailAddress: string, workOrderId: string): Promise<NotificationResult> {
    if (!this.transporter) await this.init();
    
    logger.info({ emailAddress, workOrderId }, 'Sending real email via Ethereal...');
    
    try {
      const info = await this.transporter!.sendMail({
        from: '"FieldDesk Notifications" <no-reply@fielddesk.com>',
        to: emailAddress,
        subject: `New Work Order Assigned: ${workOrderId}`,
        text: `You have been assigned to work order ${workOrderId}. Please log in to your dashboard to view the details.`,
        html: `<p>You have been assigned to work order <b>${workOrderId}</b>.</p><p>Please log in to your dashboard to view the details.</p>`,
      });

      logger.info({ workOrderId }, 'Email sent successfully!');
      logger.info(`🔗 Preview URL: ${nodemailer.getTestMessageUrl(info)}`);

      return { success: true, temporary: false };
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to send Ethereal email');
      return { success: false, temporary: true, reason: error.message };
    }
  }
}
