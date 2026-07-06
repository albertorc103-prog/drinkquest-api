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
      this.transporter = nodemailer.createTransport({
        host,
        port: this.config.get<number>('smtp.port'),
        secure: this.config.get<boolean>('smtp.secure'),
        auth: {
          user: this.config.get<string>('smtp.user'),
          pass: this.config.get<string>('smtp.pass'),
        },
      });
      this.logger.log(`SMTP enabled (${host}:${this.config.get<number>('smtp.port')})`);
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
      return;
    }
    try {
      await this.transporter.sendMail({
        from: this.config.get('smtp.from'),
        to,
        subject,
        text,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`SMTP send failed (${to}, ${subject}): ${message}`);
      throw err;
    }
  }
}
