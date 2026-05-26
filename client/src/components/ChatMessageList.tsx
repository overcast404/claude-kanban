import { useRef, useEffect, useCallback, useMemo, useLayoutEffect, useState } from 'react';
import type { ChatMessage } from '../App';
import { ChatBubble } from './ChatBubble';
import { Icon } from './Icon';

interface Props {
  messages: ChatMessage[];
  runningTaskIds: Set<string>;
  stoppedTaskIds: Set<string>;
  doneTaskIds: Set<string>;
  decidingTaskIds: Set<string>;
  reviewingTaskIds: Set<string>;
  taskWorktrees: Record<string, string | null | undefined>;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => Promise<void> | void;
  onDecisionClick: (msg: ChatMessage, answer: string) => void;
  onApprove: (msg: ChatMessage) => void;
  onReject: (msg: ChatMessage) => void;
  onStopTask: (msg: ChatMessage) => void;
  onQuoteReply: (msg: ChatMessage) => void;
  onRewind: (msg: ChatMessage) => void;
  onFork: (msg: ChatMessage, mode: 'fork' | 'fork-rewind') => void;
  onThreadOpen: (taskId: string) => void;
}

type PendingDirection = 'up' | 'down';

const PENDING_EDGE_OFFSET = 8;

function PendingBubbleNavigator({
  visible,
  aboveCount,
  belowCount,
  loading,
  onNavigate,
}: {
  visible: boolean;
  aboveCount: number;
  belowCount: number;
  loading: boolean;
  onNavigate: (direction: PendingDirection) => void;
}) {
  if (!visible) return null;

  return (
    <div className="absolute bottom-3 right-3 z-20 overflow-hidden rounded-lg border border-warm-border bg-white shadow-lg">
      <button
        type="button"
        aria-label={`上一个待处理气泡，上方还有 ${aboveCount} 个`}
        title={`上一个待处理气泡（上方 ${aboveCount} 个）`}
        disabled={aboveCount === 0 || loading}
        onClick={() => onNavigate('up')}
        className="flex h-11 w-14 cursor-pointer items-center justify-center gap-1 text-[11px] font-semibold text-warm-brown transition-colors duration-200 hover:bg-warm-bg disabled:cursor-default disabled:text-warm-text-secondary disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warm-tan"
      >
        <Icon name="chevron-down" size={14} className="rotate-180" />
        <span>{aboveCount}</span>
      </button>
      <div className="border-t border-warm-border text-center text-[9px] font-medium text-warm-text-secondary leading-5">
        待处理
      </div>
      <button
        type="button"
        aria-label={`下一个待处理气泡，下方还有 ${belowCount} 个`}
        title={`下一个待处理气泡（下方 ${belowCount} 个）`}
        disabled={belowCount === 0 || loading}
        onClick={() => onNavigate('down')}
        className="flex h-11 w-14 cursor-pointer items-center justify-center gap-1 text-[11px] font-semibold text-warm-brown transition-colors duration-200 hover:bg-warm-bg disabled:cursor-default disabled:text-warm-text-secondary disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warm-tan"
      >
        <Icon name="chevron-down" size={14} />
        <span>{belowCount}</span>
      </button>
    </div>
  );
}

export function ChatMessageList({ messages, runningTaskIds, stoppedTaskIds, doneTaskIds, decidingTaskIds, reviewingTaskIds, taskWorktrees, hasMore, loadingMore, onLoadMore, onDecisionClick, onApprove, onReject, onStopTask, onQuoteReply, onRewind, onFork, onThreadOpen }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);
  const messageRefs = useRef(new Map<string, HTMLDivElement>());
  const previousMessagesRef = useRef<{ firstId?: string; lastId?: string; length: number }>({ length: 0 });
  const prependScrollSnapshotRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
  const requestingMoreRef = useRef(false);
  const pendingNavigationRef = useRef<PendingDirection | null>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [navigationLoading, setNavigationLoading] = useState(false);
  const [pendingCounts, setPendingCounts] = useState({ above: 0, below: 0 });

  // Track the latest ai_review message per task — only the latest one shows "完成"
  const latestReviewMsgIds = useMemo(() => {
    const ids = new Set<string>();
    const lastPerTask = new Map<string, string>(); // taskId -> messageId
    for (const msg of messages) {
      if (msg.type === 'ai_review') {
        lastPerTask.set(msg.taskId, msg.id);
      }
    }
    for (const id of lastPerTask.values()) {
      ids.add(id);
    }
    return ids;
  }, [messages]);

  const latestExecutionMsgIds = useMemo(() => {
    const ids = new Set<string>();
    const lastPerTask = new Map<string, string>();
    for (const msg of messages) {
      if (msg.type === 'ai_execution') {
        lastPerTask.set(msg.taskId, msg.id);
      }
    }
    for (const id of lastPerTask.values()) {
      ids.add(id);
    }
    return ids;
  }, [messages]);

  const latestDecisionMsgIds = useMemo(() => {
    const ids = new Set<string>();
    const lastPerTask = new Map<string, string>();
    for (const msg of messages) {
      if (msg.type === 'ai_decision') {
        lastPerTask.set(msg.taskId, msg.id);
      }
    }
    for (const id of lastPerTask.values()) {
      ids.add(id);
    }
    return ids;
  }, [messages]);

  const actionableMessages = useMemo(() => {
    return messages.filter(msg => {
      if (msg.type === 'ai_decision') {
        return decidingTaskIds.has(msg.taskId) && latestDecisionMsgIds.has(msg.id) && !msg.decision?.answer;
      }
      if (msg.type === 'ai_review') {
        return reviewingTaskIds.has(msg.taskId) && latestReviewMsgIds.has(msg.id) && !doneTaskIds.has(msg.taskId);
      }
      return false;
    });
  }, [messages, decidingTaskIds, reviewingTaskIds, doneTaskIds, latestDecisionMsgIds, latestReviewMsgIds]);

  const loadedActionableTaskIds = useMemo(() => {
    return new Set(actionableMessages.map(msg => msg.taskId));
  }, [actionableMessages]);

  const unloadedPendingAbove = hasMore
    ? Math.max(decidingTaskIds.size + reviewingTaskIds.size - loadedActionableTaskIds.size, 0)
    : 0;
  const hasPendingBubbles = actionableMessages.length + unloadedPendingAbove > 0;

  const requestOlderMessages = useCallback(async () => {
    if (requestingMoreRef.current || loadingMore || !hasMore) return false;

    const el = containerRef.current;
    if (el) {
      prependScrollSnapshotRef.current = {
        scrollHeight: el.scrollHeight,
        scrollTop: el.scrollTop,
      };
    }

    requestingMoreRef.current = true;
    try {
      await onLoadMore();
      return true;
    } catch {
      prependScrollSnapshotRef.current = null;
      return false;
    } finally {
      requestingMoreRef.current = false;
    }
  }, [hasMore, loadingMore, onLoadMore]);

  useLayoutEffect(() => {
    const firstId = messages[0]?.id;
    const lastId = messages[messages.length - 1]?.id;
    const prev = previousMessagesRef.current;
    const snapshot = prependScrollSnapshotRef.current;
    const el = containerRef.current;

    if (messages.length === 0) {
      previousMessagesRef.current = { firstId, lastId, length: 0 };
      return;
    }

    if (!mountedRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'instant' });
      mountedRef.current = true;
    } else if (snapshot && prev.firstId && firstId !== prev.firstId && messages.some(msg => msg.id === prev.firstId)) {
      if (el) {
        el.scrollTop = el.scrollHeight - snapshot.scrollHeight + snapshot.scrollTop;
      }
    } else if (messages.length > prev.length && lastId !== prev.lastId && !pendingNavigationRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }

    prependScrollSnapshotRef.current = null;
    previousMessagesRef.current = { firstId, lastId, length: messages.length };
  }, [messages]);

  const updatePendingCounts = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    const viewportTop = el.scrollTop + PENDING_EDGE_OFFSET;
    const viewportBottom = el.scrollTop + el.clientHeight - PENDING_EDGE_OFFSET;
    let above = unloadedPendingAbove;
    let below = 0;

    for (const msg of actionableMessages) {
      const node = messageRefs.current.get(msg.id);
      if (!node) continue;
      const top = node.offsetTop;
      const bottom = top + node.offsetHeight;

      if (bottom < viewportTop) {
        above += 1;
      } else if (top > viewportBottom) {
        below += 1;
      }
    }

    setPendingCounts(prev => (
      prev.above === above && prev.below === below ? prev : { above, below }
    ));
  }, [actionableMessages, unloadedPendingAbove]);

  useEffect(() => {
    updatePendingCounts();
  }, [messages, updatePendingCounts]);

  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) {
        clearTimeout(highlightTimerRef.current);
      }
    };
  }, []);

  const getNavigationTarget = useCallback((direction: PendingDirection) => {
    const el = containerRef.current;
    if (!el) return null;

    const viewportTop = el.scrollTop + PENDING_EDGE_OFFSET;
    const viewportBottom = el.scrollTop + el.clientHeight - PENDING_EDGE_OFFSET;
    let target: ChatMessage | null = null;
    let targetPosition = direction === 'up' ? -Infinity : Infinity;

    for (const msg of actionableMessages) {
      const node = messageRefs.current.get(msg.id);
      if (!node) continue;
      const top = node.offsetTop;
      const bottom = top + node.offsetHeight;

      if (direction === 'up' && bottom < viewportTop && bottom > targetPosition) {
        target = msg;
        targetPosition = bottom;
      }

      if (direction === 'down' && top > viewportBottom && top < targetPosition) {
        target = msg;
        targetPosition = top;
      }
    }

    return target;
  }, [actionableMessages]);

  const scrollToMessage = useCallback((messageId: string) => {
    const node = messageRefs.current.get(messageId);
    if (!node) return;

    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedMessageId(messageId);
    if (highlightTimerRef.current) {
      clearTimeout(highlightTimerRef.current);
    }
    highlightTimerRef.current = setTimeout(() => {
      setHighlightedMessageId(null);
    }, 1800);
  }, []);

  const navigatePending = useCallback(async (direction: PendingDirection) => {
    const target = getNavigationTarget(direction);
    if (target) {
      scrollToMessage(target.id);
      return;
    }

    if (direction === 'up' && unloadedPendingAbove > 0 && hasMore) {
      pendingNavigationRef.current = direction;
      setNavigationLoading(true);
      const started = await requestOlderMessages();
      if (!started) {
        pendingNavigationRef.current = null;
        setNavigationLoading(false);
      }
    }
  }, [getNavigationTarget, hasMore, requestOlderMessages, scrollToMessage, unloadedPendingAbove]);

  useEffect(() => {
    if (!pendingNavigationRef.current || loadingMore || requestingMoreRef.current) return;

    const direction = pendingNavigationRef.current;
    const target = getNavigationTarget(direction);
    if (target) {
      pendingNavigationRef.current = null;
      setNavigationLoading(false);
      scrollToMessage(target.id);
      return;
    }

    if (direction === 'up' && unloadedPendingAbove > 0 && hasMore) {
      void requestOlderMessages();
      return;
    }

    pendingNavigationRef.current = null;
    setNavigationLoading(false);
  }, [getNavigationTarget, hasMore, loadingMore, messages, requestOlderMessages, scrollToMessage, unloadedPendingAbove]);

  const handleScroll = useCallback(() => {
    updatePendingCounts();

    const el = containerRef.current;
    if (!el || loadingMore || !hasMore) return;
    if (el.scrollTop < 50) {
      void requestOlderMessages();
    }
  }, [loadingMore, hasMore, requestOlderMessages, updatePendingCounts]);

  const getQuotedMessage = (id: string) => messages.find(m => m.id === id);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-warm-text-secondary">
          <div className="text-3xl mb-3">💬</div>
          <div className="text-[13px] font-medium mb-1">欢迎来到群聊</div>
          <div className="text-[11px]">
            输入 <code className="bg-gray-100 px-1 rounded">@成员名 任务描述</code> 开始
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex-1 min-h-0 bg-gray-50/50">
      <div ref={containerRef} onScroll={handleScroll} className="absolute inset-0 overflow-y-auto overflow-x-hidden py-3 flex flex-col gap-2">
        {loadingMore && (
          <div className="text-center text-[10px] text-warm-text-secondary py-1">加载中...</div>
        )}
        {messages.map(msg => (
          <div
            key={msg.id}
            ref={(node) => {
              if (node) {
                messageRefs.current.set(msg.id, node);
              } else {
                messageRefs.current.delete(msg.id);
              }
            }}
            className={`scroll-m-24 rounded-xl transition-shadow duration-300 ${
              highlightedMessageId === msg.id ? 'ring-2 ring-amber-300 ring-offset-2 ring-offset-gray-50' : ''
            }`}
          >
            <ChatBubble
              message={msg}
              getQuotedMessage={getQuotedMessage}
              isTaskRunning={runningTaskIds.has(msg.taskId)}
              isTaskStopped={stoppedTaskIds.has(msg.taskId)}
              isTaskDone={doneTaskIds.has(msg.taskId)}
              isLatestReview={reviewingTaskIds.has(msg.taskId) && latestReviewMsgIds.has(msg.id)}
              isLatestExecution={latestExecutionMsgIds.has(msg.id)}
              worktree={msg.type !== 'user_message' && msg.type !== 'system' ? taskWorktrees[msg.taskId] : undefined}
              onDecisionClick={onDecisionClick}
              onApprove={onApprove}
              onReject={onReject}
              onStopTask={onStopTask}
              onQuoteReply={onQuoteReply}
              onRewind={onRewind}
              onFork={onFork}
              onThreadOpen={onThreadOpen}
            />
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <PendingBubbleNavigator
        visible={hasPendingBubbles}
        aboveCount={pendingCounts.above}
        belowCount={pendingCounts.below}
        loading={navigationLoading}
        onNavigate={navigatePending}
      />
    </div>
  );
}
