import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

function cleanSecret(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  let v = raw.trim();
  // Render/pegar a veces deja comillas o saltos.
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1).trim();
  }
  v = v.replace(/\r|\n|\t/g, '').trim();
  return v.length > 0 ? v : undefined;
}

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter | null;
  private readonly brevoApiKey: string | undefined;

  constructor(private readonly config: ConfigService) {
    this.brevoApiKey = cleanSecret(
      this.config.get<string>('smtp.brevoApiKey') || process.env.BREVO_API_KEY,
    );

    if (this.isMailEnabled()) {
      const host = cleanSecret(
        this.config.get<string>('smtp.host') || process.env.SMTP_HOST,
      );
      const port =
        this.config.get<number>('smtp.port') ??
        parseInt(process.env.SMTP_PORT ?? '587', 10);
      const user = cleanSecret(
        this.config.get<string>('smtp.user') || process.env.SMTP_USER,
      );
      const pass = cleanSecret(
        this.config.get<string>('smtp.pass') || process.env.SMTP_PASS,
      );
      const secure =
        this.config.get<boolean>('smtp.secure') === true ||
        process.env.SMTP_SECURE === 'true' ||
        port === 465;
      const hasAuth = Boolean(user && pass);
      const from = this.getFromAddress();

      this.logger.log(
        `Mail bootstrap: enabled=true hasBrevoKey=${Boolean(this.brevoApiKey)} ` +
          `brevoKeyPrefix=${this.brevoApiKey?.slice(0, 12) ?? 'none'} ` +
          `brevoKeyLen=${this.brevoApiKey?.length ?? 0} ` +
          `hasSmtpHost=${Boolean(host)} from=${from}`,
      );

      if (this.brevoApiKey && !this.brevoApiKey.startsWith('xkeysib-')) {
        this.logger.warn(
          'BREVO_API_KEY no empieza por xkeysib- (¿pegaste la clave SMTP xsmtpsib- o una clave MCP?). ' +
            'Usa Claves API (no SMTP, no MCP).',
        );
      }

      if (this.brevoApiKey) {
        this.logger.log('Brevo API key configured (HTTPS) — preferred on Render');
      }

      if (host) {
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
          this.logger.log(`SMTP configured (${host}:${port}, auth=${hasAuth})`);
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

  async onModuleInit(): Promise<void> {
    if (!this.brevoApiKey || !this.isMailEnabled()) return;
    const ok = await this.verifyConnection();
    this.logger.log(`Brevo API startup verify: ${ok ? 'ok' : 'FAILED — revisa la clave en Render'}`);
  }

  isMailEnabled(): boolean {
    if (this.config.get<boolean>('smtp.enabled') === true) return true;
    const raw = process.env.MAIL_ENABLED?.trim().toLowerCase();
    return raw === 'true' || raw === '1' || raw === 'yes';
  }

  isConfigured(): boolean {
    if (!this.isMailEnabled()) return false;
    return Boolean(this.brevoApiKey) || this.transporter != null;
  }

  /** Motivo legible para /health (sin secretos). */
  getMailStatusDetail(): string {
    if (!this.isMailEnabled()) return 'MAIL_ENABLED is not true';
    if (this.brevoApiKey) {
      const prefixOk = this.brevoApiKey.startsWith('xkeysib-');
      return `brevo_api_key_present; prefix_ok=${prefixOk}; len=${this.brevoApiKey.length}`;
    }
    if (this.transporter) return 'smtp_transporter_present';
    return 'missing BREVO_API_KEY and SMTP';
  }

  private getFromAddress(): string {
    return (
      cleanSecret(this.config.get<string>('smtp.from') || process.env.SMTP_FROM) ||
      'noreply@drinkquest.com'
    );
  }

  /** Comprueba que el canal de correo esté usable. */
  async verifyConnection(): Promise<boolean> {
    if (!this.isConfigured()) return false;
    if (this.brevoApiKey) {
      const endpoints = [
        'https://api.brevo.com/v3/account',
        'https://api.brevo.com/v3/senders',
      ];
      for (const url of endpoints) {
        try {
          const res = await fetch(url, {
            headers: {
              accept: 'application/json',
              'api-key': this.brevoApiKey,
            },
            signal: AbortSignal.timeout(15_000),
          });
          if (res.ok) return true;
          const body = await res.text().catch(() => '');
          this.logger.warn(
            `Brevo API verify failed (${url}): HTTP ${res.status} ${body.slice(0, 300)}`,
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          this.logger.warn(`Brevo API verify failed (${url}): ${message}`);
        }
      }
      return false;
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
      this.config.get<string>('smtp.verifyEmailUrlTemplate') ||
        process.env.EMAIL_VERIFY_URL ||
        'drinkquest://auth/verify?token={token}',
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
      this.config.get<string>('smtp.resetPasswordUrlTemplate') ||
        process.env.EMAIL_RESET_URL ||
        'drinkquest://auth/reset?token={token}',
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
      throw new Error('Correo no configurado en el servidor (MAIL_ENABLED / BREVO_API_KEY)');
    }
    const from = this.getFromAddress();

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
      this.logger.warn(
        `Brevo API send failed (${to}, ${subject}): HTTP ${res.status} ${body}. ` +
          `Revisa BREVO_API_KEY y que SMTP_FROM=${senderEmail} esté verificado en Brevo → Remitentes.`,
      );
      throw new Error(`Brevo API HTTP ${res.status}`);
    }
    const data = (await res.json().catch(() => ({}))) as { messageId?: string };
    this.logger.log(`Brevo API sent to ${to} (${subject}) id=${data.messageId ?? 'n/a'}`);
  }
}
