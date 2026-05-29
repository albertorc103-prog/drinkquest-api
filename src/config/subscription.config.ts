import { registerAs } from '@nestjs/config';

export default registerAs('subscription', () => ({
  /** Días de prueba al registrar un negocio (BAR). Env: BAR_TRIAL_DAYS */
  barTrialDays: Math.max(1, parseInt(process.env.BAR_TRIAL_DAYS ?? '14', 10)),
}));
