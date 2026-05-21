import { useRef, useEffect } from 'react';
import type { ChatMessage } from '../App';
import { ChatBubble } from './ChatBubble';

interface Props {
  messages: ChatMessage[];
  onDecisionClick: (msg: ChatMessage, answer: string) => void;
  onApprove: (msg: ChatMessage) => void;
  onReject: (msg: ChatMessage) => void;
  onQuoteReply: (msg: ChatMessage) => void;
}

export function ChatMessageList({ messages, onDecisionClick, onApprove, onReject, onQuoteReply }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, messages[messages.length - 1]?.content.length]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-warm-text-secondary">
          <div className="text-3xl mb-3">💬</div>
          <div className="text-[13px] font-medium mb-1">欢迎来到群聊</div>
          <div className="text-[11px]">
            输入 <code className="bg-gray-100 px-1 rounded">@项目名 任务描述</code> 开始
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto py-3 flex flex-col gap-2 bg-gray-50/50">
      {messages.map(msg => (
        <ChatBubble
          key={msg.id}
          message={msg}
          onDecisionClick={onDecisionClick}
          onApprove={onApprove}
          onReject={onReject}
          onQuoteReply={onQuoteReply}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
