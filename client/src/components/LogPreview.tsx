interface Props {
  lines: { stream: string; text: string }[];
  onViewFull: () => void;
}

export function LogPreview({ lines, onViewFull }: Props) {
  const recent = lines.slice(-20);

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-[11px] font-bold text-warm-brown">📝 最近日志</h4>
        <button
          onClick={onViewFull}
          className="text-[10px] text-warm-tan hover:text-warm-brown transition-colors"
        >
          查看全部 →
        </button>
      </div>
      <div className="bg-warm-log-bg border border-warm-border rounded-lg p-3 max-h-[260px] overflow-y-auto">
        {recent.length === 0 ? (
          <p className="text-[10px] text-warm-text-secondary">暂无日志</p>
        ) : (
          <pre className="text-[10px] text-warm-text font-mono leading-relaxed whitespace-pre-wrap m-0">
            {recent.map((line, i) => (
              <span key={i} className={line.stream === 'stderr' ? 'text-warm-danger' : ''}>
                {line.text}
              </span>
            ))}
          </pre>
        )}
      </div>
    </div>
  );
}
