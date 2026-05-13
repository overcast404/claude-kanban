export interface FormattedLine {
  type: 'thinking' | 'text' | 'tool' | 'result' | 'error';
  text: string;
}

export function parseStream(lines: string[]): FormattedLine[] {
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

export function lineClass(type: string) {
  switch (type) {
    case 'thinking': return 'text-warm-text-secondary italic';
    case 'tool': return 'text-warm-brown';
    case 'error': return 'text-warm-danger';
    case 'result': return 'text-emerald-700 font-bold';
    default: return 'text-warm-text';
  }
}
