import { useMemo } from 'react';
import { parseStream, lineClass } from '../logParser';
import { Icon } from './Icon';

interface Props {
  lines: { stream: string; text: string }[];
  onViewFull: () => void;
}

export function LogPreview({ lines, onViewFull }: Props) {
  const parsed = useMemo(() => {
    const allText = lines.map(l => l.text).join('');
    const all = parseStream(allText.split('\n'));
    return all.slice(-20);
  }, [lines]);

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-[11px] font-bold text-warm-brown inline-flex items-center gap-0.5"><Icon name="clipboard" size={13} /> 最近日志</h4>
        {lines.length > 0 && (
          <button
            onClick={onViewFull}
            className="text-[10px] text-warm-tan hover:text-warm-brown transition-colors"
          >
            查看全部 →
          </button>
        )}
      </div>
      <div className="bg-warm-log-bg border border-warm-border rounded-lg p-3 max-h-[260px] overflow-y-auto">
        {parsed.length === 0 ? (
          <p className="text-[10px] text-warm-text-secondary">暂无日志</p>
        ) : (
          <pre className="text-[10px] font-mono leading-relaxed whitespace-pre-wrap break-all m-0">
            {parsed.map((l, i) => (
              <div key={i} className={lineClass(l.type)}>{l.text}</div>
            ))}
          </pre>
        )}
      </div>
    </div>
  );
}
