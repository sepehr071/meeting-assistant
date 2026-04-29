"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Trash2, Send } from "lucide-react";
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
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  clearChatMessages,
  listChatMessages,
  streamChatAsk,
  type ChatMessage,
} from "@/lib/api";
import { dirOf } from "@/lib/rtl";

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

  function handleSend() {
    const text = input.trim();
    if (!text || isSending) return;

    setInput("");
    setPendingUser({ content: text });
    setPendingAssistant("");

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    abortRef.current = streamChatAsk(
      meetingId,
      text,
      (delta) => {
        setPendingAssistant((prev) => (prev ?? "") + delta);
      },
      (_assistantId) => {
        queryClient.invalidateQueries({ queryKey: ["chat", meetingId] });
        setPendingUser(null);
        setPendingAssistant(null);
      },
      (msg) => {
        toast.error(msg);
        setPendingAssistant(null);
        queryClient.invalidateQueries({ queryKey: ["chat", meetingId] }).then(
          () => setPendingUser(null),
        );
      },
    );
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
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
      <Card>
        <CardContent className="py-10 text-center" dir="rtl">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500/15 to-violet-500/15">
            <Sparkles className="size-6 text-indigo-500" />
          </div>
          <p className="text-sm font-semibold text-foreground">چت در دسترس نیست</p>
          <p className="mt-1 text-sm text-muted-foreground">
            ابتدا باید جلسه پردازش شود تا چت در دسترس قرار گیرد.
          </p>
        </CardContent>
      </Card>
    );
  }

  const messages = chatQ.data ?? [];
  const isEmpty = messages.length === 0 && !pendingUser && !pendingAssistant;

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between" dir="rtl">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-sm shadow-indigo-500/25">
            <Sparkles className="size-3.5" />
          </span>
          چت با جلسه
        </h2>
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground hover:text-destructive"
                disabled={clearMut.isPending || (messages.length === 0 && !pendingUser)}
              >
                <Trash2 className="size-3.5" />
                پاک‌سازی تاریخچه
              </Button>
            }
          />
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle>پاک‌سازی تاریخچه چت</AlertDialogTitle>
              <AlertDialogDescription>
                تمام پیام‌های این جلسه حذف خواهند شد. این عمل قابل بازگشت نیست.
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
      </div>

      {/* Messages area */}
      <div
        className="flex flex-col gap-3 overflow-y-auto rounded-xl border border-border/60 bg-gradient-to-b from-muted/30 to-muted/10 p-4 shadow-inner"
        style={{ maxHeight: "65vh", minHeight: "16rem" }}
        dir="rtl"
      >
        {isEmpty ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500/15 to-violet-500/15">
              <Sparkles className="size-6 text-indigo-500" />
            </div>
            <p className="text-sm font-medium text-foreground">
              با محتوای جلسه گفتگو کنید
            </p>
            <p className="text-xs text-muted-foreground">
              مثلاً: «چه تصمیماتی گرفته شد؟» یا «اقدامات سپهر چیست؟»
            </p>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}

            {pendingUser && (
              <UserBubble content={pendingUser.content} />
            )}

            {pendingAssistant !== null && (
              <AssistantBubble content={pendingAssistant} streaming />
            )}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input row */}
      <div
        className="flex items-end gap-2 rounded-xl border border-border/60 bg-card p-2 shadow-sm focus-within:border-indigo-400/60 focus-within:ring-2 focus-within:ring-indigo-400/20"
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
          className="min-h-0 flex-1 resize-none overflow-hidden border-0 bg-transparent py-1.5 shadow-none focus-visible:ring-0 focus-visible:outline-none"
          style={{ height: "auto" }}
        />
        <Button
          onClick={handleSend}
          disabled={!input.trim() || isSending}
          size="sm"
          className="shrink-0 gap-1.5 bg-gradient-to-l from-indigo-500 to-violet-500 text-white shadow-sm shadow-indigo-500/30 hover:from-indigo-600 hover:to-violet-600 disabled:opacity-50"
        >
          <Send className="size-3.5" />
          ارسال
        </Button>
      </div>

      <style>{`
        @keyframes cursor-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        .animate-cursor-blink {
          animation: cursor-blink 0.85s ease-in-out infinite;
          color: rgb(99 102 241);
          font-weight: 600;
        }
        .chat-md p { margin: 0; }
        .chat-md p + p { margin-top: 0.6em; }
        .chat-md ul, .chat-md ol { margin: 0.4em 0; padding-inline-start: 1.4em; }
        .chat-md ul { list-style: disc; }
        .chat-md ol { list-style: decimal; }
        .chat-md li { margin: 0.15em 0; }
        .chat-md li > p { display: inline; }
        .chat-md strong { font-weight: 700; color: hsl(var(--foreground)); }
        .chat-md em { font-style: italic; }
        .chat-md code {
          background: rgba(99, 102, 241, 0.12);
          color: rgb(79, 70, 229);
          padding: 0.1em 0.35em;
          border-radius: 0.3em;
          font-size: 0.88em;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        }
        .dark .chat-md code {
          background: rgba(129, 140, 248, 0.18);
          color: rgb(165, 180, 252);
        }
        .chat-md pre {
          background: rgba(0, 0, 0, 0.04);
          padding: 0.75em;
          border-radius: 0.5em;
          overflow-x: auto;
          margin: 0.5em 0;
        }
        .dark .chat-md pre { background: rgba(255, 255, 255, 0.05); }
        .chat-md pre code { background: transparent; padding: 0; color: inherit; }
        .chat-md blockquote {
          border-inline-start: 3px solid rgb(99, 102, 241);
          padding-inline-start: 0.75em;
          margin: 0.5em 0;
          color: hsl(var(--muted-foreground));
        }
        .chat-md h1, .chat-md h2, .chat-md h3, .chat-md h4 {
          font-weight: 700;
          margin: 0.6em 0 0.3em;
          line-height: 1.4;
        }
        .chat-md h1 { font-size: 1.15em; }
        .chat-md h2 { font-size: 1.08em; }
        .chat-md h3 { font-size: 1.02em; }
        .chat-md a { color: rgb(99, 102, 241); text-decoration: underline; text-underline-offset: 2px; }
        .chat-md table { border-collapse: collapse; margin: 0.5em 0; }
        .chat-md th, .chat-md td { border: 1px solid hsl(var(--border)); padding: 0.3em 0.6em; }
        .chat-md hr { border: 0; border-top: 1px solid hsl(var(--border)); margin: 0.8em 0; }
      `}</style>
    </div>
  );
}

interface MessageBubbleProps {
  message: ChatMessage;
}

function MessageBubble({ message }: MessageBubbleProps) {
  if (message.role === "user") {
    return <UserBubble content={message.content} />;
  }
  return <AssistantBubble content={message.content} />;
}

function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-start">
      <div
        className="max-w-[85%] rounded-2xl rounded-tr-sm bg-gradient-to-br from-indigo-500 to-violet-600 px-4 py-2.5 text-white shadow-sm shadow-indigo-500/20"
        style={{
          contentVisibility: "auto",
          containIntrinsicSize: "auto 56px",
        }}
      >
        <p
          dir={dirOf(content) || "rtl"}
          className="text-sm leading-7 whitespace-pre-wrap"
        >
          {content}
        </p>
      </div>
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
    <div className="flex justify-end gap-2 items-start">
      <span className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500/15 to-violet-500/15 text-indigo-500">
        <Sparkles className="size-3.5" />
      </span>
      <div
        className="max-w-[85%] rounded-2xl rounded-tl-sm border border-border/60 bg-card px-4 py-2.5 shadow-sm"
        style={{
          contentVisibility: "auto",
          containIntrinsicSize: "auto 56px",
        }}
      >
        <div
          dir="rtl"
          className="chat-md text-sm leading-7 text-foreground"
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {content || "​"}
          </ReactMarkdown>
          {streaming && (
            <span className="animate-cursor-blink">▍</span>
          )}
        </div>
      </div>
    </div>
  );
}
