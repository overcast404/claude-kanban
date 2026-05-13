export interface ChunkParser {
  feed(text: string): string | null;
}

function pickParam(input: Record<string, unknown> | undefined): string | null {
  if (!input) return null;
  // Pick the first meaningful string value from tool input
  const prefer = ['file_path', 'command', 'description', 'url', 'query', 'pattern', 'filePath', 'old_string'];
  for (const key of prefer) {
    const v = input[key];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  // Fallback: first short string value
  for (const [, v] of Object.entries(input)) {
    if (typeof v === 'string' && v.length > 0 && v.length < 500) return v;
  }
  return null;
}

export function createChunkParser(): ChunkParser {
  let toolName: string | null = null;
  let toolParams = '';

  function flushTool(): string | null {
    if (!toolName) return null;
    const name = toolName;
    const params = toolParams;
    toolName = null;
    toolParams = '';
    try {
      const obj = JSON.parse(params);
      const val = pickParam(obj);
      if (val) return `${name}: ${val}`;
    } catch {
      // partial JSON
    }
    return `${name}`;
  }

  function feed(text: string): string | null {
    const lines = text.split('\n');
    let latest: string | null = null;

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);

        if (obj.type === 'stream_event') {
          const ev = obj.event;
          if (!ev) continue;

          if (ev.type === 'content_block_start') {
            const flushed = flushTool();
            if (flushed) latest = flushed;

            if (ev.content_block?.type === 'tool_use') {
              toolName = ev.content_block.name;
              toolParams = '';
            } else if (ev.content_block?.type === 'thinking') {
              latest = '思考中...';
            }
          } else if (ev.type === 'content_block_delta') {
            const d = ev.delta;
            if (d?.type === 'input_json_delta' && d.partial_json) {
              if (toolName) {
                if (toolParams.endsWith('}')) {
                  toolParams = toolParams.slice(0, -1);
                }
                toolParams += d.partial_json;
              }
            } else if (d?.type === 'text_delta' && d.text) {
              latest = d.text;
            }
          } else if (ev.type === 'content_block_stop') {
            const flushed = flushTool();
            if (flushed) latest = flushed;
          }
          continue;
        }

        if (obj.type === 'assistant') {
          const contents = obj.message?.content || [];
          for (const c of contents) {
            if (c.type === 'tool_use') {
              const val = pickParam(c.input);
              latest = val ? `${c.name}: ${val}` : `${c.name}`;
            } else if (c.type === 'thinking') {
              latest = '思考中...';
            } else if (c.type === 'text' && c.text) {
              latest = c.text;
            }
          }
          continue;
        }

        if (obj.type === 'user') {
          continue;
        }

        if (obj.type === 'result') {
          latest = obj.subtype === 'error_during_execution' ? '执行出错' : '已完成';
        }
      } catch {
        // skip unparseable lines
      }
    }

    // flush any pending tool
    const flushed = flushTool();
    if (flushed) latest = flushed;

    return latest;
  }

  return { feed };
}

/** Stateless parse for one-shot use. */
export function parseJsonStream(text: string): string | null {
  const parser = createChunkParser();
  return parser.feed(text);
}
