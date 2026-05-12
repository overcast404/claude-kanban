import type { SVGProps } from 'react';

export const ICON_NAMES = [
  'inbox', 'zap', 'bell', 'archive', 'folder', 'smartphone',
  'activity', 'clipboard', 'help-circle', 'check-circle', 'flag',
  'edit', 'play', 'square', 'corner-down-left', 'eye',
  'arrow-left', 'chevron-right', 'plus', 'x',
] as const;

export type IconName = (typeof ICON_NAMES)[number];

const PATHS: Record<IconName, string> = {
  'inbox': 'M22 12h-6l-2 3H10l-2-3H2 M5.5 17h13a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-13a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2Z M2 12v5a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5',
  'zap': 'M13 2L3 14h8l-2 8 10-12h-8l2-8z',
  'bell': 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 0 1-3.46 0',
  'archive': 'M21 8v13H3V8 M1 3h22v5H1z M10 12h4',
  'folder': 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z',
  'smartphone': 'M17 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2z M12 18h0',
  'activity': 'M22 12h-4l-3 9L9 3l-3 9H2',
  'clipboard': 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2 M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z M9 13h6 M9 17h6',
  'help-circle': 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3 M12 17h0',
  'check-circle': 'M22 11.08V12a10 10 0 1 1-5.93-9.14 M9 12l2 2 4-4',
  'flag': 'M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z M4 22v-7',
  'edit': 'M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z M15 5l4 4',
  'play': 'M5 3l14 9-14 9V3z',
  'square': 'M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z',
  'corner-down-left': 'M9 10l-5 5 5 5 M20 4v7a4 4 0 0 1-4 4H4',
  'eye': 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  'arrow-left': 'M19 12H5 M12 19l-7-7 7-7',
  'chevron-right': 'M9 18l6-6-6-6',
  'plus': 'M12 5v14 M5 12h14',
  'x': 'M18 6L6 18 M6 6l12 12',
};

interface Props extends SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 20, className = '', ...rest }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
