interface Props {
  icon: string;
  message: string;
}

export function EmptyState({ icon, message }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-warm-text-secondary">
      <div className="text-3xl mb-3">{icon}</div>
      <p className="text-sm">{message}</p>
    </div>
  );
}
