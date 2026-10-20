import type { Platform, Tone } from './schemas';

export interface PlatformMeta {
  label: string;
  shortLabel: string;
  /** Hard character limit shown in the live counter. */
  charLimit: number;
  badgeClass: string;
}

export const PLATFORM_META: Record<Platform, PlatformMeta> = {
  linkedin: {
    label: 'LinkedIn',
    shortLabel: 'in',
    charLimit: 3000,
    badgeClass: 'bg-[#0A66C2] text-white',
  },
  x: {
    label: 'X (Twitter)',
    shortLabel: 'X',
    charLimit: 280,
    badgeClass: 'bg-black text-white ring-1 ring-white/20',
  },
  instagram: {
    label: 'Instagram',
    shortLabel: 'IG',
    charLimit: 2200,
    badgeClass: 'bg-gradient-to-br from-[#F58529] via-[#DD2A7B] to-[#8134AF] text-white',
  },
};

export const TONE_META: Record<Tone, { label: string; description: string }> = {
  professional: { label: 'Professional', description: 'Credible and clear' },
  witty: { label: 'Witty', description: 'Playful and clever' },
  urgent: { label: 'Urgent', description: 'Time-sensitive and action-driven' },
};
