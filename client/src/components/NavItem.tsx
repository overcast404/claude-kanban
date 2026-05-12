import { Icon, type IconName } from './Icon';

interface Props {
  icon: IconName;
  label: string;
  count?: number;
  active: boolean;
  dangerBadge?: boolean;
  onClick: () => void;
}

export function NavItem({ icon, label, count, active, dangerBadge, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col items-center gap-0.5 w-full py-2.5 rounded-lg transition-colors ${
        active
          ? 'text-warm-brown font-bold'
          : 'text-warm-text-secondary hover:text-warm-brown'
      }`}
    >
      <span className="relative">
        <Icon name={icon} size={22} />
        {count !== undefined && count > 0 && (
          <span
            className={`absolute -top-1 -right-3 min-w-[16px] h-4 text-[9px] leading-4 rounded-full px-1 text-white text-center ${
              dangerBadge ? 'bg-warm-danger' : 'bg-warm-brown'
            }`}
          >
            {count}
          </span>
        )}
      </span>
      <span className="text-[10px] leading-tight">{label}</span>
    </button>
  );
}
