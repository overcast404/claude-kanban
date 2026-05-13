import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { fetchTaskLogs } from '../api';
import { parseStream, lineClass } from '../logParser';
import { Icon } from './Icon';

interface OutputEntry {
  stream: string;
  text: string;
}

interface Props {
  taskId: string;
  taskTitle: string;
  taskStatus: string;
  liveOutputs: OutputEntry[];
  onClose: () => void;
}

async function loadAllLogs(taskId: string): Promise<string> {
  let offset = 0;
  let allText = '';
  while (true) {
    const res = await fetchTaskLogs(taskId, offset);
    allText += res.text;
    if (res.eof) break;
    offset = res.offset;
  }
  return allText;
}

export function LogViewer({ taskId, taskTitle, taskStatus, liveOutputs, onClose }: Props) {
  const [autoScroll, setAutoScroll] = useState(true);
  const [historicalText, setHistoricalText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (liveOutputs.length === 0) {
      setLoading(true);
      loadAllLogs(taskId).then(setHistoricalText).finally(() => setLoading(false));
    }
  }, [taskId, liveOutputs.length]);

  const formattedLines = useMemo(() => {
    const liveText = liveOutputs.map(e => e.text).join('');
    const combined = (historicalText || '') + liveText;
    return parseStream(combined.split('\n'));
  }, [historicalText, liveOutputs]);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [formattedLines, autoScroll]);

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 30;
    if (!atBottom && autoScroll) setAutoScroll(false);
    if (atBottom && !autoScroll) setAutoScroll(true);
  }, [autoScroll]);

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-warm-card border border-warm-border rounded-xl shadow-lg flex flex-col"
        style={{ width: '70vw', maxWidth: '900px', height: '80vh' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-warm-border flex-shrink-0">
          <h3 className="text-sm font-bold text-warm-text truncate inline-flex items-center gap-1"><Icon name="clipboard" size={15} /> 日志 — {taskTitle}</h3>
          <div className="flex items-center gap-4 flex-shrink-0">
            <label className="flex items-center gap-1.5 text-[11px] text-warm-text-secondary cursor-pointer">
              <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)} />
              自动滚动
            </label>
            <button onClick={onClose} className="px-3 py-1 border border-warm-border rounded-lg text-[11px] text-warm-text-secondary">关闭</button>
          </div>
        </div>

        <div ref={containerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto min-h-0 bg-warm-log-bg rounded-b-xl">
          {loading ? (
            <div className="flex items-center justify-center h-full text-[13px] text-warm-text-secondary">
              加载日志...
            </div>
          ) : formattedLines.length === 0 ? (
            <div className="flex items-center justify-center h-full text-[13px] text-warm-text-secondary">
              {taskStatus === 'running' ? '等待输出...' : '暂无输出日志'}
            </div>
          ) : (
            <pre className="m-0 p-4 font-mono text-[11px] leading-relaxed text-warm-text whitespace-pre-wrap break-all">
              {formattedLines.map((l, i) => (
                <div key={i} className={`${lineClass(l.type)}`}>{l.text}</div>
              ))}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
