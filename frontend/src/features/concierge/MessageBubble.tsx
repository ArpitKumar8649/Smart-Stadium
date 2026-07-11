import { type ChatMessage } from './useConcierge.ts';
import { ToolCallChip } from './ToolCallChip.tsx';

export function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-1.5`}>
        {!isUser && msg.tools && msg.tools.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {msg.tools.map((t) => (
              <ToolCallChip key={t.id} chip={t} />
            ))}
          </div>
        )}
        <div
          className={[
            'rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed',
            isUser
              ? 'bg-primary text-surface-950 rounded-br-md'
              : 'bg-surface-900 text-surface-50 rounded-bl-md',
          ].join(' ')}
        >
          {msg.text || (msg.streaming && (!msg.tools || msg.tools.length === 0) ? <TypingDots /> : null)}
          {msg.text && msg.streaming && <span className="ml-0.5 inline-block animate-pulse">▍</span>}
        </div>
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex gap-1 py-1" aria-label="Concourse is thinking">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-surface-400"
          style={{ animationDelay: `${i * 120}ms` }}
        />
      ))}
    </span>
  );
}
