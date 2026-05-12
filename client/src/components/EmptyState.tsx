import { Icon, type IconName } from './Icon';

interface Props {
  icon: IconName;
  message: string;
}

export function EmptyState({ icon, message }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-warm-text-secondary">
      <Icon name={icon} size={36} className="mb-3 opacity-50" />
      <p className="text-sm">{message}</p>
    </div>
  );
}
