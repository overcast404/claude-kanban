import type { Project } from '../../../src/types';
import type { ChatMessage } from '../App';
import { ChatSidebar } from './ChatSidebar';
import { ChatMessageList } from './ChatMessageList';
import { ChatInput } from './ChatInput';

interface ProjectWithCounts extends Project {
  count_pending: number;
  count_running: number;
  count_deciding: number;
  count_reviewing: number;
  count_done?: number;
}

interface Props {
  projects: ProjectWithCounts[];
  messages: ChatMessage[];
  doneTaskIds: Set<string>;
  quoteTarget: ChatMessage | null;
  onCancelQuote: () => void;
  onSend: (text: string, quoteMessageId?: string) => void;
  onDecisionClick: (msg: ChatMessage, answer: string) => void;
  onApprove: (msg: ChatMessage) => void;
  onReject: (msg: ChatMessage) => void;
  onQuoteReply: (msg: ChatMessage) => void;
  onThreadOpen: (taskId: string) => void;
  onProjectClick: (projectName: string) => void;
  mentionPrefill: { name: string; n: number } | null;
  gitStatuses: Record<string, { changedFiles: number }>;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
}

export function ChatPanel(props: Props) {
  return (
    <div className="flex-1 flex min-w-0">
      <ChatSidebar
        projects={props.projects}
        onProjectClick={props.onProjectClick}
        gitStatuses={props.gitStatuses}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <ChatMessageList
          messages={props.messages}
          doneTaskIds={props.doneTaskIds}
          hasMore={props.hasMore}
          loadingMore={props.loadingMore}
          onLoadMore={props.onLoadMore}
          onDecisionClick={props.onDecisionClick}
          onApprove={props.onApprove}
          onReject={props.onReject}
          onQuoteReply={props.onQuoteReply}
          onThreadOpen={props.onThreadOpen}
        />
        <ChatInput
          projects={props.projects.map(p => ({ id: p.id, name: p.name }))}
          quoteTarget={props.quoteTarget}
          onCancelQuote={props.onCancelQuote}
          onSend={props.onSend}
          mentionPrefill={props.mentionPrefill}
        />
      </div>
    </div>
  );
}
