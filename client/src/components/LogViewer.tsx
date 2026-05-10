import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

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

interface FormattedLine {
  type: 'thinking' | 'text' | 'tool' | 'result' | 'error';
  text: string;
}

function parseStream(lines: string[]): FormattedLine[] {
  const result: FormattedLine[] = [];
  let currentBlock: { type: FormattedLine['type']; buf: string } | null = null;

  function flush() {
    if (currentBlock && currentBlock.buf.trim()) {
      result.push({ type: currentBlock.type, text: currentBlock.buf.trimEnd() });
    }
    currentBlock = null;
  }

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);

      if (obj.type === 'stream_event') {
        const ev = obj.event;
        if (!ev) continue;

        if (ev.type === 'content_block_start') {
          flush();
          const cb = ev.content_block;
          if (cb?.type === 'thinking') currentBlock = { type: 'thinking', buf: '' };
          else if (cb?.type === 'text') currentBlock = { type: 'text', buf: '' };
          else if (cb?.type === 'tool_use') currentBlock = { type: 'tool', buf: `[工具: ${cb.name}]\n` };
        } else if (ev.type === 'content_block_delta') {
          const d = ev.delta;
          if (d?.type === 'thinking_delta' && d.thinking) {
            if (!currentBlock || currentBlock.type !== 'thinking') { flush(); currentBlock = { type: 'thinking', buf: '' }; }
            currentBlock.buf += d.thinking;
          } else if (d?.type === 'text_delta' && d.text) {
            if (!currentBlock || currentBlock.type !== 'text') { flush(); currentBlock = { type: 'text', buf: '' }; }
            currentBlock.buf += d.text;
          } else if (d?.type === 'input_json_delta' && d.partial_json) {
            if (!currentBlock || currentBlock.type !== 'tool') { flush(); currentBlock = { type: 'tool', buf: '[工具参数]\n' }; }
            currentBlock.buf += d.partial_json;
          }
        } else if (ev.type === 'content_block_stop') {
          flush();
        }
        continue;
      }

      if (obj.type === 'system') continue;

      if (obj.type === 'assistant') {
        flush();
        const contents = obj.message?.content || [];
        for (const c of contents) {
          if (c.type === 'text' && c.text) {
            result.push({ type: 'text', text: c.text });
          } else if (c.type === 'tool_use') {
            result.push({ type: 'tool', text: `[调用工具: ${c.name}]\n${JSON.stringify(c.input, null, 2)}` });
          } else if (c.type === 'thinking' && c.thinking) {
            result.push({ type: 'thinking', text: c.thinking });
          }
        }
        continue;
      }

      if (obj.type === 'user') {
        flush();
        const contents = obj.message?.content || [];
        for (const c of contents) {
          if (c.type === 'tool_result') {
            const content = typeof c.content === 'string' ? c.content : JSON.stringify(c.content);
            const preview = content.length > 1000 ? content.slice(0, 1000) + '...' : content;
            result.push({ type: 'tool', text: `[工具返回]\n${preview}` });
          }
        }
        continue;
      }

      if (obj.type === 'result') {
        flush();
        if (obj.result && obj.subtype !== 'error_during_execution') {
          result.push({ type: 'result', text: `[完成] ${obj.result}` });
        }
        continue;
      }
    } catch {
      flush();
      const trimmed = line.trim();
      if (!trimmed.startsWith('Warning: no stdin') && !trimmed.startsWith('Warning: proceeding without')) {
        result.push({ type: 'error', text: trimmed });
      }
    }
  }
  flush();
  return result;
}

export function LogViewer({ taskId, taskTitle, taskStatus, liveOutputs, onClose }: Props) {
  const [autoScroll, setAutoScroll] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  const formattedLines = useMemo(() => {
    const allText = liveOutputs.map(e => e.text).join('');
    return parseStream(allText.split('\n'));
  }, [liveOutputs]);

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

  const lineClass = (type: string) => {
    switch (type) {
      case 'thinking': return 'text-warm-text-secondary italic';
      case 'tool': return 'text-warm-brown';
      case 'error': return 'text-warm-danger';
      case 'result': return 'text-emerald-700 font-bold';
      default: return 'text-warm-text';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-warm-card border border-warm-border rounded-xl shadow-lg flex flex-col"
        style={{ width: '70vw', maxWidth: '900px', height: '80vh' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-warm-border flex-shrink-0">
          <h3 className="text-sm font-bold text-warm-text truncate">📋 日志 — {taskTitle}</h3>
          <div className="flex items-center gap-4 flex-shrink-0">
            <label className="flex items-center gap-1.5 text-[11px] text-warm-text-secondary cursor-pointer">
              <input type="checkbox" checked={autoScroll} onChange={e => setAutoScroll(e.target.checked)} />
              自动滚动
            </label>
            <button onClick={onClose} className="px-3 py-1 border border-warm-border rounded-lg text-[11px] text-warm-text-secondary">关闭</button>
          </div>
        </div>

        <div ref={containerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto min-h-0 bg-warm-log-bg rounded-b-xl">
          {formattedLines.length === 0 ? (
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
