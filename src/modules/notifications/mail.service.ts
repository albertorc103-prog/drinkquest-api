import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter | null;
  private readonly brevoApiKey: string | undefined;

  constructor(private readonly config: ConfigService) {
    this.brevoApiKey = this.config.get<string>('smtp.brevoApiKey') || undefined;

    if (this.isMailEnabled()) {
      const host = this.config.get<string>('smtp.host');
      const port = this.config.get<number>('smtp.port') ?? 587;
      const user = this.config.get<string>('smtp.user');
      const pass = this.config.get<string>('smtp.pass');
      const secure = this.config.get<boolean>('smtp.secure') === true || port === 465;
      const hasAuth = Boolean(user && pass);

      if (this.brevoApiKey) {
        this.logger.log('Brevo API key configured (HTTPS) — preferred on Render');
      }

      if (host) {
        // Mailpit local: sin auth. Brevo SMTP: con auth.
        if (!hasAuth && port === 587 && !this.brevoApiKey) {
          this.logger.warn(
            'MAIL_ENABLED=true en puerto 587 sin SMTP_USER/SMTP_PASS ni BREVO_API_KEY',
          );
          this.transporter = null;
        } else {
          this.transporter = nodemailer.createTransport({
            host,
            port,
            secure,
            requireTLS: port === 587 && hasAuth,
            ...(hasAuth ? { auth: { user: user!, pass: pass! } } : {}),
            connectionTimeout: 25_000,
            greetingTimeout: 20_000,
            socketTimeout: 30_000,
          });
          this.logger.log(
            `SMTP configured (${host}:${port}, auth=${hasAuth}, from=${this.config.get<string>('smtp.from')})`,
          );
        }
      } else {
        this.transporter = null;
        if (!this.brevoApiKey) {
          this.logger.warn('MAIL_ENABLED=true pero faltan SMTP_HOST y BREVO_API_KEY');
        }
      }
    } else {
      this.transporter = null;
      this.logger.log('Mail disabled (MAIL_ENABLED=false)');
    }
  }

  isMailEnabled(): boolean {
    return this.config.get<boolean>('smtp.enabled') === true;
  }

  isConfigured(): boolean {
    if (!this.isMailEnabled()) return false;
    return Boolean(this.brevoApiKey) || this.transporter != null;
  }

  /** Comprueba que el canal de correo esté usable. */
  async verifyConnection(): Promise<boolean> {
    if (!this.isConfigured()) return false;
    if (this.brevoApiKey) {
      try {
        const res = await fetch('https://api.brevo.com/v3/account', {
          headers: { 'api-key': this.brevoApiKey },
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) {
          this.logger.warn(`Brevo API verify failed: HTTP ${res.status}`);
          return false;
        }
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Brevo API verify failed: ${message}`);
        return false;
      }
    }
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
      `Hola,\n\nToca este enlace en tu teléfono (con DrinkQuest instalada):\n\n${url}\n\nEl enlace caduca en 24 horas. Si no abre la app, copia la URL completa en el navegador.\n\n— DrinkQuest`,
    );
  }

  /** No bloquea la petición HTTP; errores solo en logs. */
  dispatchEmailVerification(to: string, token: string): void {
    void this.sendEmailVerification(to, token).catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Async verification email failed (${to}): ${message}`);
    });
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
    if (!this.isConfigured()) {
      throw new Error('Correo no configurado en el servidor');
    }
    const from = this.config.get<string>('smtp.from') || 'noreply@drinkquest.com';

    // En Render el SMTP suele dar Connection timeout; la API HTTPS de Brevo sí funciona.
    if (this.brevoApiKey) {
      await this.sendViaBrevoApi(to, subject, text, from);
      return;
    }

    if (!this.transporter) {
      throw new Error('SMTP no configurado en el servidor');
    }
    try {
      const info = await this.transporter.sendMail({
        from: from.includes('<') ? from : `DrinkQuest <${from}>`,
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

  private async sendViaBrevoApi(
    to: string,
    subject: string,
    text: string,
    from: string,
  ): Promise<void> {
    const senderEmail = from.includes('<')
      ? (from.match(/<([^>]+)>/)?.[1] ?? from)
      : from;
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'api-key': this.brevoApiKey!,
      },
      body: JSON.stringify({
        sender: { name: 'DrinkQuest', email: senderEmail.trim() },
        to: [{ email: to }],
        subject,
        textContent: text,
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      this.logger.warn(`Brevo API send failed (${to}, ${subject}): HTTP ${res.status} ${body}`);
      throw new Error(`Brevo API HTTP ${res.status}`);
    }
    const data = (await res.json().catch(() => ({}))) as { messageId?: string };
    this.logger.log(`Brevo API sent to ${to} (${subject}) id=${data.messageId ?? 'n/a'}`);
  }
}
