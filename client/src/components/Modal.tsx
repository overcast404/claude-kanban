import type { ReactNode } from 'react';

interface Props {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}

export function Modal({ title, children, onClose, wide }: Props) {
  return (
    <div
      className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className={`bg-warm-card border border-warm-border rounded-xl p-6 shadow-lg max-h-[85vh] overflow-y-auto ${
          wide ? 'w-[640px]' : 'w-[520px]'
        } max-w-[95vw]`}
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-base font-bold text-warm-text mb-4">{title}</h3>
        {children}
      </div>
    </div>
  );
}
