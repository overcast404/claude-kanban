import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchTaskReviewChanges,
  fetchTaskReviewFile,
  type ReviewChangeFile,
  type ReviewChangesResponse,
  type ReviewFileResponse,
} from '../api';
import { Icon } from './Icon';
import MarkdownContent from './MarkdownContent';

type ViewMode = 'diff' | 'content' | 'preview';

interface Props {
  taskId: string;
  messageId: string;
  active?: boolean;
  onOpenPanel: (target: ReviewChangesTarget) => void;
}

export interface ReviewChangesTarget {
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
  if (mode === 'content' || mode === 'preview') return 'text-warm-text';
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
      <pre className="max-h-[calc(100dvh-260px)] overflow-auto bg-white py-2 font-mono text-[10px] leading-relaxed md:max-h-[calc(100vh-150px)]">
        {lines.map((line, index) => (
          <code key={index} className={`block min-w-max px-3 py-0.5 ${lineClass(line, mode)}`}>
            {line || ' '}
          </code>
        ))}
      </pre>
    </div>
  );
}

function MarkdownViewer({ file }: { file: ReviewFileResponse }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-warm-border bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-warm-border px-3 py-2 text-[10px] text-warm-text-secondary">
        <span className="min-w-0 truncate">{file.source}</span>
        {file.truncated && <span className="shrink-0 text-amber-700">已截断</span>}
      </div>
      <div className="max-h-[calc(100dvh-260px)] overflow-auto px-4 py-3 md:max-h-[calc(100vh-150px)]">
        <MarkdownContent>{file.content || '无内容'}</MarkdownContent>
      </div>
    </div>
  );
}

function isMarkdownPath(filePath: string): boolean {
  return /\.(md|markdown|mdown|mkdn)$/i.test(filePath);
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

export function ReviewChanges({ taskId, messageId, active, onOpenPanel }: Props) {
  const [changes, setChanges] = useState<ReviewChangesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setChanges(null);

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
        aria-expanded={active}
        onClick={() => onOpenPanel({ taskId, messageId })}
        className={`inline-flex min-h-11 max-w-full cursor-pointer items-center gap-2 rounded-lg border px-3 text-[11px] font-semibold text-warm-text transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warm-tan max-md:w-full md:min-h-7 ${
          active
            ? 'border-warm-brown bg-warm-bg'
            : 'border-warm-border bg-white hover:border-warm-tan hover:bg-warm-bg'
        }`}
      >
        <Icon name="git-branch" size={12} className="shrink-0 text-warm-brown" />
        <span className="font-mono text-emerald-700">+{summary.additions}</span>
        <span className="font-mono text-red-600">-{summary.deletions}</span>
        <span className="min-w-0 truncate text-warm-text-secondary">{summary.files} 个文件</span>
        <Icon name="chevron-right" size={12} className="ml-auto shrink-0" />
      </button>
    </div>
  );
}

export function ReviewChangesPanel({ target, onClose }: { target: ReviewChangesTarget; onClose: () => void }) {
  const { taskId, messageId } = target;
  const [panelWidth, setPanelWidth] = useState(() => {
    try {
      const stored = Number(localStorage.getItem('ck_review_panel_width') || '');
      return Number.isFinite(stored) && stored >= 360 ? stored : 680;
    } catch {
      return 680;
    }
  });
  const [changes, setChanges] = useState<ReviewChangesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('diff');
  const [file, setFile] = useState<ReviewFileResponse | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const resizingRef = useRef(false);

  const updatePanelWidth = (clientX: number) => {
    const nextWidth = window.innerWidth - clientX;
    const maxWidth = Math.min(1280, Math.max(520, window.innerWidth - 320));
    setPanelWidth(Math.min(maxWidth, Math.max(360, nextWidth)));
  };

  const beginResize = (clientX: number) => {
    if (window.matchMedia('(max-width: 768px)').matches) return;
    resizingRef.current = true;
    updatePanelWidth(clientX);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    try { localStorage.setItem('ck_review_panel_width', String(panelWidth)); } catch {}
  }, [panelWidth]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!resizingRef.current) return;
      updatePanelWidth(event.clientX);
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (!resizingRef.current) return;
      updatePanelWidth(event.clientX);
    };

    const endResize = () => {
      if (!resizingRef.current) return;
      resizingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', endResize);
    document.addEventListener('pointercancel', endResize);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', endResize);
    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', endResize);
      document.removeEventListener('pointercancel', endResize);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', endResize);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setChanges(null);
    setSelectedPath(null);
    setViewMode('diff');
    setMobileDetailOpen(false);

    fetchTaskReviewChanges(taskId, messageId)
      .then(data => {
        if (!cancelled) {
          setChanges(data);
          setSelectedPath(data.files[0]?.path || null);
        }
      })
      .catch(err => {
        if (!cancelled) setError((err as Error).message || '无法读取变更');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [taskId, messageId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const selectedFile = useMemo(() => {
    return changes?.files.find(item => item.path === selectedPath) || null;
  }, [changes, selectedPath]);

  const selectedIsMarkdown = !!selectedFile && isMarkdownPath(selectedFile.path);

  useEffect(() => {
    if (viewMode === 'preview' && !selectedIsMarkdown) {
      setViewMode('content');
    }
  }, [selectedIsMarkdown, viewMode]);

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

    const fetchMode = viewMode === 'preview' ? 'content' : viewMode;

    fetchTaskReviewFile(taskId, selectedPath, fetchMode, messageId)
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

  const openFile = (path: string) => {
    setSelectedPath(path);
    setViewMode('diff');
    if (window.matchMedia('(max-width: 768px)').matches) {
      setMobileDetailOpen(true);
    }
  };

  return (
    <aside
      className="fixed inset-0 z-40 flex h-dvh w-screen min-h-0 flex-col overflow-hidden border-warm-border bg-warm-log-bg md:relative md:inset-auto md:z-auto md:h-full md:w-[min(var(--review-panel-width),calc(100vw_-_320px))] md:shrink-0 md:border-l"
      style={{ '--review-panel-width': `${panelWidth}px` } as CSSProperties}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        title="拖动调整宽度"
        onPointerDown={(event) => {
          event.preventDefault();
          beginResize(event.clientX);
        }}
        onMouseDown={(event) => {
          event.preventDefault();
          beginResize(event.clientX);
        }}
        className="absolute left-0 top-0 z-20 hidden h-full w-2 -translate-x-1/2 cursor-col-resize touch-none transition-colors duration-200 hover:bg-warm-tan/20 md:block"
      >
        <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-transparent transition-colors duration-200" />
      </div>
      <div className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-warm-border bg-white px-4">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-warm-text">本次任务变更</div>
          <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[11px] text-warm-text-secondary">
            {loading ? (
              <span>变更统计...</span>
            ) : error ? (
              <span className="text-red-600">无法读取变更</span>
            ) : (
              <>
                <span className="font-mono text-emerald-700">+{summary.additions}</span>
                <span className="font-mono text-red-600">-{summary.deletions}</span>
                <span className="truncate">{summary.files} 个文件</span>
              </>
            )}
          </div>
        </div>
        <button
          type="button"
          aria-label="关闭变更面板"
          onClick={onClose}
          className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-warm-text-secondary transition-colors duration-200 hover:bg-warm-bg hover:text-warm-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warm-tan"
        >
          <Icon name="x" size={16} />
        </button>
      </div>

      {loading && (
        <div className="flex flex-1 items-center justify-center px-3 text-[12px] text-warm-text-secondary">
          加载变更...
        </div>
      )}

      {error && (
        <div className="m-3 rounded-lg border border-warm-border bg-white px-3 py-4 text-[11px] text-warm-text-secondary">
          无法读取变更：{error}
        </div>
      )}

      {!loading && !error && changes && (
        changes.files.length > 0 ? (
          <div className="grid min-h-0 flex-1 gap-0 md:grid-cols-[minmax(190px,34%)_minmax(0,1fr)]">
            <div className={`${mobileDetailOpen ? 'hidden' : 'block'} min-h-0 border-b border-warm-border bg-white p-2 md:block md:border-b-0 md:border-r`}>
              <div className="h-full min-w-0 space-y-1.5 overflow-y-auto pr-1">
                {changes.files.map(item => (
                  <FileRow
                    key={`${item.status}:${item.path}`}
                    file={item}
                    selected={item.path === selectedPath}
                    onClick={() => openFile(item.path)}
                  />
                ))}
              </div>
            </div>

            <div className={`${mobileDetailOpen ? 'flex' : 'hidden'} min-h-0 min-w-0 flex-col overflow-hidden p-3 md:flex md:overflow-y-auto`}>
              {selectedFile ? (
                <div className="flex min-h-0 min-w-0 flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => setMobileDetailOpen(false)}
                    className="inline-flex min-h-10 w-fit cursor-pointer items-center gap-1.5 rounded-lg border border-warm-border bg-white px-3 text-[12px] font-medium text-warm-text-secondary transition-colors duration-200 hover:bg-warm-bg hover:text-warm-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warm-tan md:hidden"
                  >
                    <Icon name="arrow-left" size={14} />
                    文件列表
                  </button>
                  <div className="flex min-w-0 flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0 truncate text-[12px] font-semibold text-warm-text" title={selectedFile.path}>
                      {selectedFile.path}
                    </div>
                    <div className={`grid ${selectedIsMarkdown ? 'grid-cols-3' : 'grid-cols-2'} overflow-hidden rounded-lg border border-warm-border bg-white text-[11px] font-semibold md:flex`}>
                      <button
                        type="button"
                        onClick={() => setViewMode('diff')}
                        className={`min-h-10 cursor-pointer px-3 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warm-tan md:min-h-9 ${
                          viewMode === 'diff' ? 'bg-warm-brown text-white' : 'text-warm-text-secondary hover:bg-warm-bg'
                        }`}
                      >
                        对比
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode('content')}
                        className={`min-h-10 cursor-pointer border-l border-warm-border px-3 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warm-tan md:min-h-9 ${
                          viewMode === 'content' ? 'bg-warm-brown text-white' : 'text-warm-text-secondary hover:bg-warm-bg'
                        }`}
                      >
                        文件
                      </button>
                      {selectedIsMarkdown && (
                        <button
                          type="button"
                          onClick={() => setViewMode('preview')}
                          className={`min-h-10 cursor-pointer border-l border-warm-border px-3 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warm-tan md:min-h-9 ${
                            viewMode === 'preview' ? 'bg-warm-brown text-white' : 'text-warm-text-secondary hover:bg-warm-bg'
                          }`}
                        >
                          预览
                        </button>
                      )}
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
                  {file && (
                    viewMode === 'preview' && selectedIsMarkdown
                      ? <MarkdownViewer file={file} />
                      : <CodeViewer file={file} mode={viewMode} />
                  )}
                </div>
              ) : (
                <div className="flex min-h-28 items-center justify-center rounded-lg border border-dashed border-warm-border bg-white px-3 py-6 text-center text-[11px] text-warm-text-secondary">
                  点击文件查看对比或文件内容
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="m-3 rounded-lg border border-dashed border-warm-border bg-white px-3 py-4 text-[11px] text-warm-text-secondary">
            暂无文件变更
          </div>
        )
      )}
    </aside>
  );
}
