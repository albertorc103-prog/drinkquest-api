import { BadRequestException } from '@nestjs/common';

export type OpeningHoursDayDto = {
  day: number;
  closed?: boolean;
  open?: string | null;
  close?: string | null;
};

export type OpeningHoursDto = {
  days: OpeningHoursDayDto[];
};

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Valida y normaliza el JSON de horario del bar. */
export function normalizeOpeningHours(raw: unknown): OpeningHoursDto | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new BadRequestException('openingHours debe ser un objeto { days: [...] }.');
  }
  const daysRaw = (raw as { days?: unknown }).days;
  if (!Array.isArray(daysRaw)) {
    throw new BadRequestException('openingHours.days debe ser un arreglo.');
  }

  const byDay = new Map<number, OpeningHoursDayDto>();
  for (const item of daysRaw) {
    if (!item || typeof item !== 'object') continue;
    const day = Number((item as OpeningHoursDayDto).day);
    if (!Number.isInteger(day) || day < 1 || day > 7) {
      throw new BadRequestException('openingHours: day debe ser 1 (lun) … 7 (dom).');
    }
    const closed = Boolean((item as OpeningHoursDayDto).closed);
    if (closed) {
      byDay.set(day, { day, closed: true, open: null, close: null });
      continue;
    }
    const open = String((item as OpeningHoursDayDto).open ?? '').trim();
    const close = String((item as OpeningHoursDayDto).close ?? '').trim();
    if (!TIME_RE.test(open) || !TIME_RE.test(close)) {
      throw new BadRequestException(
        `openingHours día ${day}: open/close deben ser HH:mm (24 h).`,
      );
    }
    byDay.set(day, { day, closed: false, open, close });
  }

  const days: OpeningHoursDayDto[] = [];
  for (let d = 1; d <= 7; d += 1) {
    days.push(byDay.get(d) ?? { day: d, closed: true, open: null, close: null });
  }
  return { days };
}
