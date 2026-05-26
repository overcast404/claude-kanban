import { useEffect, useMemo, useState } from 'react';
import {
  fetchTaskReviewChanges,
  fetchTaskReviewFile,
  type ReviewChangeFile,
  type ReviewChangesResponse,
  type ReviewFileResponse,
} from '../api';
import { Icon } from './Icon';

type ViewMode = 'diff' | 'content';

interface Props {
  taskId: string;
  messageId: string;
}

function statusLabel(status: string): string {
  switch (status) {
    case 'A': return '新增';
    case 'D': return '删除';
    case 'M': return '修改';
    case 'R': return '重命名';
    case 'C': return '复制';
    default: return status || '变更';
  }
}

function statusClass(status: string): string {
  switch (status) {
    case 'A': return 'bg-emerald-50 text-emerald-700 border-emerald-100';
    case 'D': return 'bg-red-50 text-red-700 border-red-100';
    case 'R': return 'bg-blue-50 text-blue-700 border-blue-100';
    default: return 'bg-amber-50 text-amber-700 border-amber-100';
  }
}

function lineClass(line: string, mode: ViewMode): string {
  if (mode === 'content') return 'text-warm-text';
  if (line.startsWith('+++') || line.startsWith('---')) return 'text-warm-text-secondary bg-gray-50';
  if (line.startsWith('+')) return 'text-emerald-800 bg-emerald-50';
  if (line.startsWith('-')) return 'text-red-800 bg-red-50';
  if (line.startsWith('@@')) return 'text-blue-800 bg-blue-50';
  if (line.startsWith('diff --git')) return 'text-warm-brown bg-warm-bg';
  return 'text-warm-text';
}

function CodeViewer({ file, mode }: { file: ReviewFileResponse; mode: ViewMode }) {
  const lines = file.content ? file.content.split('\n') : ['无内容'];

  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-warm-border bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-warm-border px-3 py-2 text-[10px] text-warm-text-secondary">
        <span className="min-w-0 truncate">{file.source}</span>
        {file.truncated && <span className="shrink-0 text-amber-700">已截断</span>}
      </div>
      <pre className="max-h-[52vh] overflow-auto bg-white py-2 font-mono text-[10px] leading-relaxed">
        {lines.map((line, index) => (
          <code key={index} className={`block min-w-max px-3 py-0.5 ${lineClass(line, mode)}`}>
            {line || ' '}
          </code>
        ))}
      </pre>
    </div>
  );
}

function FileRow({
  file,
  selected,
  onClick,
}: {
  file: ReviewChangeFile;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={file.path}
      className={`flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warm-tan md:min-h-9 ${
        selected
          ? 'border-warm-brown bg-warm-bg'
          : 'border-warm-border bg-white hover:border-warm-tan'
      }`}
    >
      <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-semibold ${statusClass(file.status)}`}>
        {statusLabel(file.status)}
      </span>
      <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-warm-text">
        {file.path}
      </span>
      <span className="shrink-0 whitespace-nowrap font-mono text-[10px]">
        <span className="text-emerald-700">+{file.additions}</span>
        <span className="mx-1 text-warm-text-secondary">/</span>
        <span className="text-red-600">-{file.deletions}</span>
      </span>
    </button>
  );
}

export function ReviewChanges({ taskId, messageId }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [changes, setChanges] = useState<ReviewChangesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('diff');
  const [file, setFile] = useState<ReviewFileResponse | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setChanges(null);
    setSelectedPath(null);
    setViewMode('diff');

    fetchTaskReviewChanges(taskId, messageId)
      .then(data => {
        if (!cancelled) setChanges(data);
      })
      .catch(err => {
        if (!cancelled) setError((err as Error).message || '无法读取变更');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [taskId, messageId]);

  const selectedFile = useMemo(() => {
    return changes?.files.find(item => item.path === selectedPath) || null;
  }, [changes, selectedPath]);

  useEffect(() => {
    if (!selectedPath) {
      setFile(null);
      setFileError(null);
      return;
    }

    let cancelled = false;
    setFileLoading(true);
    setFileError(null);
    setFile(null);

    fetchTaskReviewFile(taskId, selectedPath, viewMode, messageId)
      .then(data => {
        if (!cancelled) setFile(data);
      })
      .catch(err => {
        if (!cancelled) setFileError((err as Error).message || '无法读取文件');
      })
      .finally(() => {
        if (!cancelled) setFileLoading(false);
      });

    return () => { cancelled = true; };
  }, [taskId, messageId, selectedPath, viewMode]);

  const summary = changes?.summary || { files: 0, additions: 0, deletions: 0 };

  if (loading) {
    return (
      <div className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-lg border border-warm-border bg-white px-3 text-[11px] text-warm-text-secondary md:min-h-7">
        <Icon name="git-branch" size={12} />
        变更统计...
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-2 rounded-lg border border-warm-border bg-white px-3 py-2 text-[11px] text-warm-text-secondary">
        无法读取变更：{error}
      </div>
    );
  }

  return (
    <div className="mt-2 min-w-0">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded(value => !value)}
        className="inline-flex min-h-11 max-w-full cursor-pointer items-center gap-2 rounded-lg border border-warm-border bg-white px-3 text-[11px] font-semibold text-warm-text transition-colors duration-200 hover:border-warm-tan hover:bg-warm-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warm-tan max-md:w-full md:min-h-7"
      >
        <Icon name="git-branch" size={12} className="shrink-0 text-warm-brown" />
        <span className="font-mono text-emerald-700">+{summary.additions}</span>
        <span className="font-mono text-red-600">-{summary.deletions}</span>
        <span className="min-w-0 truncate text-warm-text-secondary">{summary.files} 个文件</span>
        <Icon name="chevron-down" size={12} className={`ml-auto shrink-0 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {expanded && (
        <div className="mt-2 max-h-[72vh] min-w-0 overflow-y-auto rounded-xl border border-warm-border bg-warm-log-bg p-2">
          {changes && changes.files.length > 0 ? (
            <div className="grid min-w-0 gap-2 md:grid-cols-[minmax(210px,280px)_minmax(0,1fr)]">
              <div className="min-w-0 space-y-1.5">
                {changes.files.map(item => (
                  <FileRow
                    key={`${item.status}:${item.path}`}
                    file={item}
                    selected={item.path === selectedPath}
                    onClick={() => {
                      setSelectedPath(item.path);
                      setViewMode('diff');
                    }}
                  />
                ))}
              </div>

              <div className="min-w-0">
                {selectedFile ? (
                  <div className="min-w-0 space-y-2">
                    <div className="flex min-w-0 flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0 truncate text-[11px] font-semibold text-warm-text" title={selectedFile.path}>
                        {selectedFile.path}
                      </div>
                      <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-warm-border bg-white text-[11px] font-semibold md:flex">
                        <button
                          type="button"
                          onClick={() => setViewMode('diff')}
                          className={`min-h-9 px-3 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warm-tan ${
                            viewMode === 'diff' ? 'bg-warm-brown text-white' : 'text-warm-text-secondary hover:bg-warm-bg'
                          }`}
                        >
                          对比
                        </button>
                        <button
                          type="button"
                          onClick={() => setViewMode('content')}
                          className={`min-h-9 border-l border-warm-border px-3 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warm-tan ${
                            viewMode === 'content' ? 'bg-warm-brown text-white' : 'text-warm-text-secondary hover:bg-warm-bg'
                          }`}
                        >
                          文件
                        </button>
                      </div>
                    </div>

                    {fileLoading && (
                      <div className="rounded-lg border border-warm-border bg-white px-3 py-8 text-center text-[11px] text-warm-text-secondary">
                        加载文件...
                      </div>
                    )}
                    {fileError && (
                      <div className="rounded-lg border border-warm-border bg-white px-3 py-4 text-[11px] text-warm-text-secondary">
                        {fileError}
                      </div>
                    )}
                    {file && <CodeViewer file={file} mode={viewMode} />}
                  </div>
                ) : (
                  <div className="flex min-h-32 items-center justify-center rounded-lg border border-dashed border-warm-border bg-white px-3 py-6 text-center text-[11px] text-warm-text-secondary">
                    点击左侧文件查看对比或文件内容
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-warm-border bg-white px-3 py-4 text-[11px] text-warm-text-secondary">
              暂无文件变更
            </div>
          )}
        </div>
      )}
    </div>
  );
}
