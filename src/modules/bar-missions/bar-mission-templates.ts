import { BarMissionTemplate } from '@prisma/client';

export type BarMissionTemplateDef = {
  template: BarMissionTemplate;
  title: string;
  description: string;
  targetCount: number;
};

/** Plantillas fijas y sanas (sin consumo excesivo). */
export const BAR_MISSION_TEMPLATES: Record<BarMissionTemplate, BarMissionTemplateDef> =
  {
    [BarMissionTemplate.SCAN_ONCE]: {
      template: BarMissionTemplate.SCAN_ONCE,
      title: 'Primera visita',
      description: 'Desbloquea una bebida con QR en este bar.',
      targetCount: 1,
    },
    [BarMissionTemplate.SCAN_TWO_DAYS]: {
      template: BarMissionTemplate.SCAN_TWO_DAYS,
      title: 'Vuelve otro día',
      description:
        'Desbloquea una bebida un día y vuelve otro día distinto a desbloquear otra en este bar.',
      targetCount: 2,
    },
    [BarMissionTemplate.SCAN_TWO_DRINKS]: {
      template: BarMissionTemplate.SCAN_TWO_DRINKS,
      title: 'Dos sabores',
      description: 'Desbloquea dos bebidas distintas en este bar.',
      targetCount: 2,
    },
    [BarMissionTemplate.RESERVE_PARTY_OF_TWO]: {
      template: BarMissionTemplate.RESERVE_PARTY_OF_TWO,
      title: 'Mesa para dos',
      description:
        'Reserva una mesa para al menos 2 personas en este bar (sin depósito). El local debe confirmarla.',
      targetCount: 1,
    },
  };

/** Palabras/frases prohibidas en títulos personalizados de temporada/medalla. */
const BANNED_PATTERNS: RegExp[] = [
  /\bemborrach/i,
  /\bborracho/i,
  /\btomar\s+en\s+exceso/i,
  /\bshot\s*s?\b/i,
  /\btrago\s*s?\s+seguid/i,
  /\bbeber\s+hasta/i,
  /\bintoxic/i,
  /\balcoholismo/i,
  /\bchupe/i,
  /\bped[ai]/i,
];

export function assertHealthyMissionCopy(text: string, fieldLabel: string) {
  const value = text.trim();
  for (const pattern of BANNED_PATTERNS) {
    if (pattern.test(value)) {
      throw new Error(
        `${fieldLabel} no cumple las políticas: las misiones del bar no pueden promover consumo excesivo.`,
      );
    }
  }
}

export function resolveTemplate(template: BarMissionTemplate): BarMissionTemplateDef {
  return BAR_MISSION_TEMPLATES[template];
}
