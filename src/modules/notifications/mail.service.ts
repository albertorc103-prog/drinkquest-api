import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter | null;

  constructor(private readonly config: ConfigService) {
    if (this.isMailEnabled()) {
      const host = this.config.get<string>('smtp.host')!;
      const port = this.config.get<number>('smtp.port') ?? 587;
      const user = this.config.get<string>('smtp.user');
      const pass = this.config.get<string>('smtp.pass');
      if (!user || !pass) {
        this.logger.warn('MAIL_ENABLED=true pero faltan SMTP_USER o SMTP_PASS');
        this.transporter = null;
      } else {
        this.transporter = nodemailer.createTransport({
          host,
          port,
          secure: port === 465,
          requireTLS: port === 587,
          auth: { user, pass },
          connectionTimeout: 15_000,
          greetingTimeout: 15_000,
          socketTimeout: 30_000,
        });
        this.logger.log(`SMTP enabled (${host}:${port}, from=${this.config.get<string>('smtp.from')})`);
      }
    } else {
      this.transporter = null;
      this.logger.log('SMTP disabled (MAIL_ENABLED=false or SMTP_HOST empty)');
    }
  }

  isMailEnabled(): boolean {
    if (this.config.get<boolean>('smtp.enabled') !== true) return false;
    const host = this.config.get<string>('smtp.host');
    return typeof host === 'string' && host.length > 0;
  }

  /** Comprueba login SMTP (no envía correo). */
  async verifyConnection(): Promise<boolean> {
    if (!this.transporter) return false;
    try {
      await this.transporter.verify();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`SMTP verify failed: ${message}`);
      return false;
    }
  }

  private authLink(template: string, token: string): string {
    return template.replace('{token}', encodeURIComponent(token));
  }

  async sendEmailVerification(to: string, token: string): Promise<void> {
    if (!this.isMailEnabled()) {
      this.logger.warn('[MAIL_DISABLED] Verification email skipped');
      return;
    }
    const url = this.authLink(
      this.config.get<string>('smtp.verifyEmailUrlTemplate')!,
      token,
    );
    await this.send(
      to,
      'Verifica tu email — DrinkQuest',
      `Abre este enlace en tu teléfono con DrinkQuest instalada:\n\n${url}\n\nSi no se abre la app, copia el enlace en el navegador.`,
    );
  }

  async sendPasswordReset(to: string, token: string): Promise<void> {
    if (!this.isMailEnabled()) {
      this.logger.warn('[MAIL_DISABLED] Password reset email skipped');
      return;
    }
    const url = this.authLink(
      this.config.get<string>('smtp.resetPasswordUrlTemplate')!,
      token,
    );
    await this.send(
      to,
      'Recuperar contraseña — DrinkQuest',
      `Abre este enlace en tu teléfono con DrinkQuest instalada:\n\n${url}\n\nSi no se abre la app, copia el enlace en el navegador.`,
    );
  }

  private async send(to: string, subject: string, text: string): Promise<void> {
    if (!this.transporter) {
      throw new Error('SMTP no configurado en el servidor');
    }
    const from = this.config.get<string>('smtp.from');
    try {
      const info = await this.transporter.sendMail({
        from: from?.includes('<') ? from : `DrinkQuest <${from}>`,
        to,
        subject,
        text,
      });
      this.logger.log(`SMTP sent to ${to} (${subject}) id=${info.messageId ?? 'n/a'}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`SMTP send failed (${to}, ${subject}): ${message}`);
      throw err;
    }
  }
}
