"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Send, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { PanelHeader } from "@/components/panel-header";
import { Textarea } from "@/components/ui/textarea";
import {
  clearChatMessages,
  listChatMessages,
  streamChatAsk,
  type ChatMessage,
} from "@/lib/api";
import { dirOf } from "@/lib/rtl";

const SUGGESTIONS = [
  "چه تصمیماتی گرفته شد؟",
  "اقدامات مهم چیست؟",
  "بلاکر اصلی چه بود؟",
  "مسائل بازِ پیگیری",
];

interface ChatViewProps {
  meetingId: string;
  ready: boolean;
}

interface PendingUserBubble {
  content: string;
}

export function ChatView({ meetingId, ready }: ChatViewProps) {
  const queryClient = useQueryClient();

  const chatQ = useQuery<ChatMessage[]>({
    queryKey: ["chat", meetingId],
    queryFn: () => listChatMessages(meetingId),
    enabled: ready,
  });

  const clearMut = useMutation({
    mutationFn: () => clearChatMessages(meetingId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat", meetingId] });
      toast.success("تاریخچه پاک شد");
    },
    onError: (err) => {
      toast.error(`پاک‌سازی ناموفق: ${err instanceof Error ? err.message : "خطا"}`);
    },
  });

  const [input, setInput] = useState("");
  const [pendingUser, setPendingUser] = useState<PendingUserBubble | null>(null);
  const [pendingAssistant, setPendingAssistant] = useState<string | null>(null);
  const abortRef = useRef<(() => void) | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatQ.data, pendingAssistant]);

  useEffect(() => {
    return () => {
      abortRef.current?.();
    };
  }, []);

  const isSending = pendingAssistant !== null;

  function send(text: string) {
    const t = text.trim();
    if (!t || isSending) return;

    setInput("");
    setPendingUser({ content: t });
    setPendingAssistant("");

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    abortRef.current = streamChatAsk(
      meetingId,
      t,
      (delta) => {
        setPendingAssistant((prev) => (prev ?? "") + delta);
      },
      () => {
        queryClient.invalidateQueries({ queryKey: ["chat", meetingId] });
        setPendingUser(null);
        setPendingAssistant(null);
      },
      (msg) => {
        toast.error(msg);
        setPendingAssistant(null);
        queryClient
          .invalidateQueries({ queryKey: ["chat", meetingId] })
          .then(() => setPendingUser(null));
      },
    );
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    const maxRows = 5;
    const lineHeight = parseInt(getComputedStyle(el).lineHeight, 10) || 22;
    const maxHeight = lineHeight * maxRows + 16;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }

  if (!ready) {
    return (
      <>
        <PanelHeader kicker="چت" title="چت در دسترس نیست" />
        <div className="rounded-2xl border border-line bg-surface px-6 py-10 text-center">
          <div
            className="mx-auto mb-3 grid size-12 place-items-center rounded-full"
            style={{
              background:
                "linear-gradient(135deg, var(--brand-soft), oklch(0.95 0.04 285))",
            }}
          >
            <Sparkles className="size-6 text-brand" />
          </div>
          <p className="text-sm font-semibold text-ink">
            ابتدا باید جلسه پردازش شود
          </p>
          <p className="mt-1 text-sm text-ink-3">
            پس از آماده شدن خلاصه، اینجا می‌توانید با جلسه گفتگو کنید.
          </p>
        </div>
      </>
    );
  }

  const messages = chatQ.data ?? [];
  const isEmpty = messages.length === 0 && !pendingUser && !pendingAssistant;

  return (
    <div className="flex h-full flex-col">
      <PanelHeader
        kicker="چت"
        title="با این جلسه گفتگو کنید"
        subtitle="هر سؤالی درباره محتوا، تصمیم‌ها یا مسئولیت‌ها بپرسید — پاسخ از روی رونوشت کامل تولید می‌شود."
        actions={
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-ink-3 hover:text-destructive"
                  disabled={
                    clearMut.isPending ||
                    (messages.length === 0 && !pendingUser)
                  }
                >
                  <Trash2 className="size-3.5" />
                  پاک‌سازی
                </Button>
              }
            />
            <AlertDialogContent dir="rtl">
              <AlertDialogHeader>
                <AlertDialogTitle>پاک‌سازی تاریخچه چت</AlertDialogTitle>
                <AlertDialogDescription>
                  تمام پیام‌های این جلسه حذف خواهند شد. این عمل قابل بازگشت
                  نیست.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogClose render={<Button variant="outline">انصراف</Button>} />
                <AlertDialogClose
                  render={
                    <Button
                      variant="destructive"
                      onClick={() => clearMut.mutate()}
                      disabled={clearMut.isPending}
                    >
                      حذف
                    </Button>
                  }
                />
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        }
      />

      {isEmpty && (
        <div className="mb-5 flex flex-wrap gap-2" dir="rtl">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => send(s)}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 py-1.5 text-xs text-ink-2 transition-colors hover:border-brand hover:text-brand"
            >
              <Sparkles className="size-3 text-brand" />
              {s}
            </button>
          ))}
        </div>
      )}

      <div
        className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-surface"
        style={{ minHeight: 480 }}
      >
        <div
          className="flex flex-1 flex-col gap-4 overflow-y-auto p-6 scroll-thin"
          dir="rtl"
        >
          {isEmpty ? (
            <div className="m-auto flex flex-col items-center gap-2 text-center">
              <div
                className="grid size-12 place-items-center rounded-full"
                style={{
                  background:
                    "linear-gradient(135deg, var(--brand-soft), oklch(0.95 0.04 285))",
                }}
              >
                <Sparkles className="size-6 text-brand" />
              </div>
              <p className="text-sm font-medium text-ink">
                با محتوای جلسه گفتگو کنید
              </p>
              <p className="text-xs text-ink-3">
                از پیشنهادهای بالا استفاده کنید یا سؤال خود را بنویسید.
              </p>
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
              {pendingUser && <UserBubble content={pendingUser.content} />}
              {pendingAssistant !== null && (
                <AssistantBubble content={pendingAssistant} streaming />
              )}
            </>
          )}
          <div ref={bottomRef} />
        </div>

        <div
          className="flex items-end gap-2.5 border-t border-line bg-bg-soft p-3"
          dir="rtl"
        >
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="پیام خود را بنویسید…"
            dir={dirOf(input) || "rtl"}
            disabled={isSending}
            rows={1}
            className="min-h-0 flex-1 resize-none overflow-hidden border-line bg-surface py-2 shadow-none focus-visible:ring-1 focus-visible:ring-brand/30"
            style={{ height: "auto" }}
          />
          <Button
            onClick={() => send(input)}
            disabled={!input.trim() || isSending}
            size="sm"
            className="shrink-0 gap-1.5 text-white"
            style={{
              background:
                "linear-gradient(135deg, var(--brand) 0%, var(--brand-2) 100%)",
            }}
          >
            <Send className="size-3.5" />
            ارسال
          </Button>
        </div>
      </div>

      <style>{`
        @keyframes cursor-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        .animate-cursor-blink {
          animation: cursor-blink 0.85s ease-in-out infinite;
          color: var(--brand);
          font-weight: 600;
        }
        .chat-md p { margin: 0; }
        .chat-md p + p { margin-top: 0.6em; }
        .chat-md ul, .chat-md ol { margin: 0.4em 0; padding-inline-start: 1.4em; }
        .chat-md ul { list-style: disc; }
        .chat-md ol { list-style: decimal; }
        .chat-md li { margin: 0.15em 0; }
        .chat-md li > p { display: inline; }
        .chat-md strong { font-weight: 700; color: var(--ink); }
        .chat-md em { font-style: italic; }
        .chat-md code {
          background: var(--brand-soft);
          color: var(--brand-ink);
          padding: 0.1em 0.35em;
          border-radius: 0.3em;
          font-size: 0.88em;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        }
        .chat-md pre {
          background: var(--bg-soft);
          padding: 0.75em;
          border-radius: 0.5em;
          overflow-x: auto;
          margin: 0.5em 0;
        }
        .chat-md pre code { background: transparent; padding: 0; color: inherit; }
        .chat-md blockquote {
          border-inline-start: 3px solid var(--brand);
          padding-inline-start: 0.75em;
          margin: 0.5em 0;
          color: var(--ink-3);
        }
        .chat-md h1, .chat-md h2, .chat-md h3, .chat-md h4 {
          font-weight: 700;
          margin: 0.6em 0 0.3em;
          line-height: 1.4;
        }
        .chat-md h1 { font-size: 1.15em; }
        .chat-md h2 { font-size: 1.08em; }
        .chat-md h3 { font-size: 1.02em; }
        .chat-md a { color: var(--brand); text-decoration: underline; text-underline-offset: 2px; }
        .chat-md table { border-collapse: collapse; margin: 0.5em 0; }
        .chat-md th, .chat-md td { border: 1px solid var(--line); padding: 0.3em 0.6em; }
        .chat-md hr { border: 0; border-top: 1px solid var(--line); margin: 0.8em 0; }
      `}</style>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return <UserBubble content={message.content} />;
  }
  return <AssistantBubble content={message.content} />;
}

function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex items-start justify-start gap-2.5">
      <div
        className="max-w-[78%] rounded-2xl rounded-tr-sm bg-ink px-4 py-2.5 text-white"
        style={{
          contentVisibility: "auto",
          containIntrinsicSize: "auto 56px",
        }}
      >
        <p
          dir={dirOf(content) || "rtl"}
          className="whitespace-pre-wrap text-sm leading-7"
        >
          {content}
        </p>
      </div>
      <span
        className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-white"
        style={{
          background:
            "linear-gradient(135deg, oklch(0.7 0.10 270), oklch(0.55 0.14 285))",
        }}
        aria-hidden="true"
      >
        س
      </span>
    </div>
  );
}

function AssistantBubble({
  content,
  streaming = false,
}: {
  content: string;
  streaming?: boolean;
}) {
  return (
    <div className="flex items-start justify-end gap-2.5">
      <span
        className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg text-white"
        style={{
          background:
            "linear-gradient(135deg, var(--brand) 0%, var(--brand-2) 100%)",
        }}
        aria-hidden="true"
      >
        <Sparkles className="size-3.5" />
      </span>
      <div
        className="max-w-[78%] rounded-2xl rounded-tl-sm bg-bg-soft px-4 py-2.5"
        style={{
          contentVisibility: "auto",
          containIntrinsicSize: "auto 56px",
        }}
      >
        <div dir="rtl" className="chat-md text-sm leading-7 text-ink">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {content || "​"}
          </ReactMarkdown>
          {streaming && <span className="animate-cursor-blink">▍</span>}
        </div>
      </div>
    </div>
  );
}
