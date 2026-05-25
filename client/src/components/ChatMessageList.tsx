import { useRef, useEffect, useCallback, useMemo } from 'react';
import type { ChatMessage } from '../App';
import { ChatBubble } from './ChatBubble';

interface Props {
  messages: ChatMessage[];
  runningTaskIds: Set<string>;
  stoppedTaskIds: Set<string>;
  doneTaskIds: Set<string>;
  reviewingTaskIds: Set<string>;
  taskWorktrees: Record<string, string | null | undefined>;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onDecisionClick: (msg: ChatMessage, answer: string) => void;
  onApprove: (msg: ChatMessage) => void;
  onReject: (msg: ChatMessage) => void;
  onStopTask: (msg: ChatMessage) => void;
  onQuoteReply: (msg: ChatMessage) => void;
  onRewind: (msg: ChatMessage) => void;
  onFork: (msg: ChatMessage, mode: 'fork' | 'fork-rewind') => void;
  onThreadOpen: (taskId: string) => void;
}

export function ChatMessageList({ messages, runningTaskIds, stoppedTaskIds, doneTaskIds, reviewingTaskIds, taskWorktrees, hasMore, loadingMore, onLoadMore, onDecisionClick, onApprove, onReject, onStopTask, onQuoteReply, onRewind, onFork, onThreadOpen }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);

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

  useEffect(() => {
    if (!mountedRef.current) {
      // Initial load — scroll to bottom (newest messages)
      bottomRef.current?.scrollIntoView({ behavior: 'instant' });
      mountedRef.current = true;
    } else {
      // New message arrived — smooth scroll
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length]);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el || loadingMore || !hasMore) return;
    if (el.scrollTop < 50) {
      onLoadMore();
    }
  }, [loadingMore, hasMore, onLoadMore]);

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
    <div ref={containerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto overflow-x-hidden py-3 flex flex-col gap-2 bg-gray-50/50">
      {loadingMore && (
        <div className="text-center text-[10px] text-warm-text-secondary py-1">加载中...</div>
      )}
      {messages.map(msg => (
        <ChatBubble
          key={msg.id}
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
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
