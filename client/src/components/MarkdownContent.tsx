import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const COMPONENTS = {
  h1: (p: any) => <h1 className="text-[14px] font-bold text-warm-brown mt-3 mb-1" {...p} />,
  h2: (p: any) => <h2 className="text-[13px] font-bold text-warm-brown mt-2.5 mb-1" {...p} />,
  h3: (p: any) => <h3 className="text-[12px] font-bold text-warm-brown mt-2 mb-0.5" {...p} />,
  h4: (p: any) => <h4 className="text-[12px] font-semibold text-warm-brown mt-1.5 mb-0.5" {...p} />,
  h5: (p: any) => <h5 className="text-[11px] font-semibold text-warm-brown mt-1.5 mb-0.5" {...p} />,
  h6: (p: any) => <h6 className="text-[11px] font-medium text-warm-text-secondary mt-1 mb-0.5" {...p} />,
  ul: (p: any) => <ul className="list-disc pl-4 my-1 space-y-0.5" {...p} />,
  ol: (p: any) => <ol className="list-decimal pl-4 my-1 space-y-0.5" {...p} />,
  li: (p: any) => <li className="text-[12px] text-warm-text leading-relaxed" {...p} />,
  p: (p: any) => <p className="text-[12px] text-warm-text leading-relaxed my-1" {...p} />,
  code: (p: any) => {
    const { className, children, ...rest } = p as any;
    const match = /language-(\w+)/.exec(className || '');
    const isInline = !match && !className;
    return isInline
      ? <code className="bg-warm-bg px-1 py-0.5 rounded text-[11px] text-warm-brown font-mono" {...rest}>{children}</code>
      : <code className="block bg-warm-log-bg p-2 rounded text-[11px] text-warm-text font-mono overflow-x-auto my-1" {...rest}>{children}</code>;
  },
  pre: (p: any) => <pre className="bg-warm-log-bg border border-warm-border rounded-lg p-2 overflow-x-auto my-1 text-[11px] text-warm-text font-mono leading-relaxed" {...p} />,
  blockquote: (p: any) => <blockquote className="border-l-2 border-warm-brown/30 pl-3 my-1 italic text-warm-text-secondary" {...p} />,
  a: (p: any) => <a className="text-warm-brown underline" target="_blank" rel="noopener noreferrer" {...p} />,
  table: (p: any) => <table className="w-full border-collapse my-1.5 text-[12px]" {...p} />,
  thead: (p: any) => <thead className="bg-warm-bg" {...p} />,
  tbody: (p: any) => <tbody {...p} />,
  tr: (p: any) => <tr className="border-b border-warm-border" {...p} />,
  th: (p: any) => <th className="border border-warm-border px-2 py-1 text-left font-semibold text-warm-brown" {...p} />,
  td: (p: any) => <td className="border border-warm-border px-2 py-1 text-warm-text" {...p} />,
  hr: (p: any) => <hr className="border-warm-border my-2" {...p} />,
  strong: (p: any) => <strong className="font-semibold text-warm-brown" {...p} />,
  em: (p: any) => <em className="italic" {...p} />,
  img: (p: any) => <img className="max-w-full rounded my-1" {...p} />,
  del: (p: any) => <del className="line-through text-warm-text-secondary" {...p} />,
  input: (p: any) => <input className="mr-1.5 align-middle" disabled {...p} />,
};

interface Props {
  children: string;
  className?: string;
}

export default function MarkdownContent({ children, className = '' }: Props) {
  return (
    <div className={`markdown-body ${className}`}>
      <ReactMarkdown components={COMPONENTS as any} remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
