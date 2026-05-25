import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import type { Project } from '../../../src/types';
import type { ChatMessage } from '../App';
import { Icon } from './Icon';

interface Props {
  projects: { id: string; name: string }[];
  quoteTarget: ChatMessage | null;
  onCancelQuote: () => void;
  onSend: (text: string, quoteMessageId?: string, useWorktree?: boolean) => void;
  mentionPrefill: { name: string; n: number } | null;
}

export function ChatInput({ projects, quoteTarget, onCancelQuote, onSend, mentionPrefill }: Props) {
  const [text, setText] = useState('');
  const [showMention, setShowMention] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [useWorktree, setUseWorktree] = useState(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const isReply = quoteTarget?.type === 'ai_review' || quoteTarget?.type === 'ai_decision';

  const filteredProjects = projects.filter(p =>
    p.name.toLowerCase().includes(mentionFilter.toLowerCase())
  );

  useEffect(() => {
    const atMatch = text.match(/@(\S*)$/);
    if (atMatch) {
      setShowMention(true);
      setMentionFilter(atMatch[1]);
    } else {
      setShowMention(false);
    }
    setMentionIndex(0);
  }, [text]);

  // Prefill @mention when project clicked in sidebar
  useEffect(() => {
    if (mentionPrefill) {
      setText(`@${mentionPrefill.name} `);
      inputRef.current?.focus();
    }
  }, [mentionPrefill]);

  // Auto-focus when quote reply is initiated
  useEffect(() => {
    if (quoteTarget) {
      inputRef.current?.focus();
    }
  }, [quoteTarget]);

  // Auto-resize textarea
  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = el.scrollHeight + 'px';
    }
  }, [text]);

  const insertMention = (projectName: string) => {
    const newText = text.replace(/@\S*$/, `@${projectName} `);
    setText(newText);
    setShowMention(false);
    inputRef.current?.focus();
  };

  const safeIndex = Math.min(mentionIndex, Math.max(0, filteredProjects.length - 1));

  const isComposing = useRef(false);

  const handleKeyDown = (e: KeyboardEvent) => {
    // Don't send while IME is composing (e.g. Chinese pinyin → Enter to confirm)
    if (isComposing.current || e.nativeEvent.isComposing) return;

    if (showMention) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowMention(false);
        return;
      }
      if (filteredProjects.length === 0) {
        if (e.key === 'Enter') {
          e.preventDefault(); // block send when mention has no match
        }
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(i => Math.min(i + 1, filteredProjects.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(filteredProjects[safeIndex].name);
      }
      return;
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (text.trim()) {
        onSend(text.trim(), quoteTarget?.id, useWorktree);
        setText('');
      }
    }
  };

  const handleSendClick = () => {
    if (text.trim()) {
      onSend(text.trim(), quoteTarget?.id, useWorktree);
      setText('');
    }
  };

  return (
    <div className="border-t border-warm-border bg-white px-3 py-2.5">
      {/* Quote preview */}
      {quoteTarget && (
        <div className="flex items-center gap-2 mb-2 px-2 py-1.5 bg-gray-50 rounded-md text-[11px] text-warm-text-secondary">
          <Icon name="corner-down-left" size={12} />
          <span className="flex-1 truncate">
            引用：{quoteTarget.content.slice(0, 60)}{quoteTarget.content.length > 60 ? '...' : ''}
          </span>
          <button onClick={onCancelQuote} className="hover:text-warm-brown">
            <Icon name="x" size={12} />
          </button>
        </div>
      )}

      {/* Mention dropdown */}
      {showMention && filteredProjects.length > 0 && (
        <div className="mb-2 border border-warm-border rounded-md bg-white shadow-sm max-h-32 overflow-y-auto">
          {filteredProjects.map((p, i) => (
            <button
              key={p.id}
              className={`w-full text-left px-3 py-1.5 text-[12px] hover:bg-gray-50 flex items-center gap-2 ${
                i === safeIndex ? 'bg-gray-50' : ''
              }`}
              onMouseDown={(e) => {
                e.preventDefault(); // prevent input blur
                insertMention(p.name);
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-warm-brown/50 shrink-0" />
              {p.name}
            </button>
          ))}
        </div>
      )}

      {/* Input row */}
      <div className="flex items-center gap-2">
        <textarea
          ref={inputRef}
          value={text}
          rows={1}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => { isComposing.current = true; }}
          onCompositionEnd={() => { isComposing.current = false; }}
          onBlur={() => setTimeout(() => setShowMention(false), 150)}
          placeholder="@成员名 描述你要做的事情..."
          className="flex-1 px-3 py-2 border border-warm-border rounded-lg text-[13px] outline-none focus:border-warm-brown transition-colors placeholder:text-gray-300 resize-none overflow-hidden"
        />
        <button
          onClick={handleSendClick}
          disabled={!text.trim()}
          className="p-2 rounded-lg bg-warm-brown text-white disabled:opacity-40 hover:bg-warm-brown/90 transition-colors shrink-0"
        >
          <Icon name="send" size={18} />
        </button>
      </div>

      {/* Worktree toggle — only for new tasks, not AI replies */}
      {!isReply && (
        <div className="flex items-center gap-2 mt-1.5 px-1">
          <span className="text-[10px] text-warm-text-secondary shrink-0">运行环境</span>
          <div className="flex rounded-md border border-warm-border overflow-hidden text-[11px]">
            <button
              onClick={() => setUseWorktree(false)}
              className={`px-2.5 py-0.5 transition-colors ${!useWorktree ? 'bg-warm-brown text-white' : 'bg-white text-warm-text-secondary hover:bg-gray-50'}`}
            >
              本地
            </button>
            <button
              onClick={() => setUseWorktree(true)}
              className={`px-2.5 py-0.5 transition-colors ${useWorktree ? 'bg-warm-brown text-white' : 'bg-white text-warm-text-secondary hover:bg-gray-50'}`}
            >
              新worktree
            </button>
          </div>
        </div>
      )}

      <div className="text-[10px] text-warm-text-secondary mt-1.5 px-1">
        💡 @成员名 创建新任务 | Shift+Enter 换行 | 右键/悬停消息引用回复 | 点击 AI 消息按钮决策
      </div>
    </div>
  );
}
