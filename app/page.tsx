"use client";

import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Command,
  Copy,
  Menu,
  MessageSquarePlus,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings2,
  Sparkles,
  SquarePen,
  Trash2,
  X,
  Zap,
} from "lucide-react";

type Message = { id: string; role: "user" | "assistant"; content: string };
type Chat = { id: string; title: string; messages: Message[]; updatedAt: number };

const STORAGE_KEY = "juvao.chats.v1";
const makeId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const starterPrompts = [
  { icon: "✦", title: "Explain something", text: "Explain a difficult topic in a simple way." },
  { icon: "⌘", title: "Write with me", text: "Help me write something clear and engaging." },
  { icon: "↗", title: "Build an idea", text: "Help me turn an idea into a practical plan." },
];

export default function Home() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeId, setActiveId] = useState("");
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [copiedId, setCopiedId] = useState("");
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Chat[];
        if (Array.isArray(parsed) && parsed.length) {
          setChats(parsed);
          setActiveId(parsed[0].id);
          return;
        }
      }
    } catch {}
    const first: Chat = { id: makeId(), title: "New conversation", messages: [], updatedAt: Date.now() };
    setChats([first]);
    setActiveId(first.id);
  }, []);

  useEffect(() => {
    if (chats.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(chats));
  }, [chats]);

  const activeChat = chats.find((chat) => chat.id === activeId) ?? chats[0];
  const messages = activeChat?.messages ?? [];
  const filteredChats = useMemo(
    () => chats.filter((chat) => chat.title.toLowerCase().includes(searchTerm.toLowerCase())),
    [chats, searchTerm]
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: streaming ? "smooth" : "auto", block: "end" });
  }, [messages, streaming]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [input]);

  function newChat() {
    if (streaming) return;
    const chat: Chat = { id: makeId(), title: "New conversation", messages: [], updatedAt: Date.now() };
    setChats((prev) => [chat, ...prev]);
    setActiveId(chat.id);
    setInput("");
    setError("");
    setMobileSidebar(false);
    textareaRef.current?.focus();
  }

  function deleteChat(id: string) {
    if (streaming) return;
    const next = chats.filter((chat) => chat.id !== id);
    if (!next.length) {
      const fresh: Chat = { id: makeId(), title: "New conversation", messages: [], updatedAt: Date.now() };
      setChats([fresh]);
      setActiveId(fresh.id);
    } else {
      setChats(next);
      if (activeId === id) setActiveId(next[0].id);
    }
  }

  async function sendMessage(value?: string) {
    const text = (value ?? input).trim();
    if (!text || streaming || !activeChat) return;
    setError("");
    setInput("");

    const userMessage: Message = { id: makeId(), role: "user", content: text };
    const assistantMessage: Message = { id: makeId(), role: "assistant", content: "" };
    const nextMessages = [...activeChat.messages, userMessage, assistantMessage];
    const title = activeChat.messages.length === 0
      ? text.slice(0, 42) + (text.length > 42 ? "…" : "")
      : activeChat.title;

    setChats((prev) =>
      prev.map((chat) =>
        chat.id === activeChat.id
          ? { ...chat, title, messages: nextMessages, updatedAt: Date.now() }
          : chat
      )
    );
    setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...activeChat.messages, userMessage].map(({ role, content }) => ({ role, content })),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${response.status})`);
      }
      if (!response.body) throw new Error("Streaming is not available in this browser.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";

      while (true) {
        const { value: chunk, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(chunk, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const event of events) {
          const line = event.split("\n").find((part) => part.startsWith("data:"));
          if (!line) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const data = JSON.parse(payload);
            const token = data.choices?.[0]?.delta?.content;
            if (typeof token === "string" && token) {
              fullText += token;
              setChats((prev) =>
                prev.map((chat) =>
                  chat.id === activeChat.id
                    ? {
                        ...chat,
                        messages: chat.messages.map((message) =>
                          message.id === assistantMessage.id ? { ...message, content: fullText } : message
                        ),
                        updatedAt: Date.now(),
                      }
                    : chat
                )
              );
            }
          } catch {}
        }
      }

      if (!fullText) throw new Error("JUVAO did not return a text response. Please try again.");
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setChats((prev) =>
          prev.map((chat) =>
            chat.id === activeChat.id
              ? { ...chat, messages: chat.messages.filter((message) => message.id !== assistantMessage.id) }
              : chat
          )
        );
      } else {
        const message = err instanceof Error ? err.message : "Something went wrong.";
        setError(message);
        setChats((prev) =>
          prev.map((chat) =>
            chat.id === activeChat.id
              ? {
                  ...chat,
                  messages: chat.messages.map((item) =>
                    item.id === assistantMessage.id
                      ? { ...item, content: "I couldn't complete that request. Please try again." }
                      : item
                  ),
                }
              : chat
          )
        );
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
      textareaRef.current?.focus();
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    sendMessage();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  }

  async function copyMessage(message: Message) {
    await navigator.clipboard.writeText(message.content);
    setCopiedId(message.id);
    window.setTimeout(() => setCopiedId(""), 1600);
  }

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : "sidebar-collapsed"} ${mobileSidebar ? "mobile-visible" : ""}`}>
        <div className="sidebar-top">
          <a className="brand" href="#" onClick={(event) => event.preventDefault()}>
            <span className="brand-mark"><Sparkles size={17} strokeWidth={2.2} /></span>
            {sidebarOpen && <span className="brand-name">juvao<span>.</span></span>}
          </a>
          <button className="icon-button sidebar-toggle" onClick={() => setSidebarOpen((value) => !value)} aria-label="Toggle sidebar">
            {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
          </button>
          <button className="icon-button mobile-close" onClick={() => setMobileSidebar(false)} aria-label="Close sidebar"><X size={18} /></button>
        </div>

        <button className="new-chat-button" onClick={newChat} disabled={streaming}>
          <SquarePen size={17} />
          {sidebarOpen && <><span>New chat</span><kbd>⌘ K</kbd></>}
        </button>

        {sidebarOpen && (
          <>
            <div className="sidebar-section-label">WORKSPACE</div>
            <div className="search-wrap">
              <Search size={15} />
              <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search chats" />
              <kbd>/</kbd>
            </div>
            <div className="history-label">RECENTS</div>
            <div className="chat-list">
              {filteredChats.map((chat) => (
                <div className={`chat-item ${chat.id === activeId ? "active" : ""}`} key={chat.id}>
                  <button className="chat-select" onClick={() => { setActiveId(chat.id); setMobileSidebar(false); }}>
                    <MessageSquarePlus size={15} />
                    <span>{chat.title}</span>
                  </button>
                  <button className="chat-delete" onClick={() => deleteChat(chat.id)} aria-label="Delete chat"><Trash2 size={14} /></button>
                </div>
              ))}
              {filteredChats.length === 0 && <p className="empty-search">No matching chats</p>}
            </div>
          </>
        )}

        <div className="sidebar-bottom">
          <div className="plan-card">
            <div className="plan-icon"><Zap size={15} /></div>
            {sidebarOpen && <div className="plan-copy"><strong>Powered by Groq</strong><span>Fast, focused intelligence</span></div>}
            {sidebarOpen && <span className="online-dot" />}
          </div>
          <button className="profile-button" onClick={() => setSettingsOpen(true)}>
            <span className="avatar">J</span>
            {sidebarOpen && <><span className="profile-name">JUVAO workspace</span><MoreHorizontal size={18} /></>}
          </button>
        </div>
      </aside>

      {mobileSidebar && <button className="mobile-scrim" onClick={() => setMobileSidebar(false)} aria-label="Close menu" />}

      <section className="main-panel">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button mobile-menu" onClick={() => setMobileSidebar(true)} aria-label="Open menu"><Menu size={19} /></button>
            <div className="model-picker">
              <span className="model-spark"><Sparkles size={15} /></span>
              <span>JUVAO</span>
              <span className="model-version">GPT-OSS 120B</span>
              <ChevronDown size={14} className="muted-icon" />
            </div>
          </div>
          <div className="topbar-right">
            <div className="status-pill"><span className="status-dot" /> Groq connected</div>
            <button className="icon-button" onClick={() => setSettingsOpen(true)} aria-label="Settings"><Settings2 size={18} /></button>
          </div>
        </header>

        <div className="conversation-scroll">
          <div className={`conversation ${messages.length === 0 ? "conversation-empty" : ""}`}>
            {messages.length === 0 ? (
              <div className="welcome">
                <div className="welcome-orb"><div className="orb-core"><Sparkles size={27} /></div></div>
                <div className="eyebrow"><span /> YOUR SPACE TO THINK</div>
                <h1>What’s on your <span>mind?</span></h1>
                <p className="welcome-subtitle">A little curiosity can take you a long way.<br />Let’s figure it out together.</p>
                <div className="prompt-grid">
                  {starterPrompts.map((prompt) => (
                    <button className="prompt-card" key={prompt.title} onClick={() => sendMessage(prompt.text)}>
                      <span className="prompt-icon">{prompt.icon}</span>
                      <strong>{prompt.title}</strong>
                      <span>{prompt.text}</span>
                      <ArrowUp size={15} className="prompt-arrow" />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="message-stack">
                {messages.map((message, index) => (
                  <article className={`message-row ${message.role === "user" ? "user-row" : "assistant-row"}`} key={message.id}>
                    {message.role === "assistant" && <div className="assistant-avatar"><Sparkles size={15} /></div>}
                    <div className="message-content-wrap">
                      {message.role === "assistant" && <div className="message-author">JUVAO <span>·</span> <span className="model-label">GPT-OSS 120B</span></div>}
                      <div className={`message-bubble ${message.role === "user" ? "user-bubble" : "assistant-bubble"}`}>
                        {message.role === "assistant" && !message.content && streaming ? (
                          <div className="thinking"><span /><span /><span /><em>Thinking</em></div>
                        ) : (
                          <div className="markdown-body">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                            {streaming && index === messages.length - 1 && message.role === "assistant" && <span className="typing-cursor" />}
                          </div>
                        )}
                      </div>
                      {message.role === "assistant" && message.content && (
                        <div className="message-actions">
                          <button onClick={() => copyMessage(message)} aria-label="Copy response">
                            {copiedId === message.id ? <Check size={14} /> : <Copy size={14} />}
                            {copiedId === message.id ? "Copied" : "Copy"}
                          </button>
                        </div>
                      )}
                    </div>
                  </article>
                ))}
                <div ref={bottomRef} />
              </div>
            )}
          </div>
        </div>

        <div className="composer-area">
          {error && <div className="error-banner"><span>{error}</span><button onClick={() => setError("")}><X size={14} /></button></div>}
          <form className="composer" onSubmit={onSubmit}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Message JUVAO..."
              rows={1}
              disabled={streaming}
              aria-label="Message JUVAO"
            />
            <div className="composer-footer">
              <div className="composer-hint"><span className="sparkle-mini">✳</span><span>Thoughtful answers, powered by Groq</span><span className="hint-divider">·</span><kbd>↵</kbd><span>to send</span></div>
              <button className="send-button" type="submit" disabled={!input.trim() || streaming} aria-label="Send message">
                {streaming ? <span className="send-loader" /> : <ArrowUp size={18} />}
              </button>
            </div>
          </form>
          <p className="disclaimer">JUVAO can make mistakes. Check important information.</p>
        </div>
      </section>

      {settingsOpen && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }}>
          <section className="settings-modal">
            <div className="modal-heading"><div><span className="modal-kicker">PREFERENCES</span><h2>Workspace settings</h2></div><button className="icon-button" onClick={() => setSettingsOpen(false)}><X size={18} /></button></div>
            <div className="setting-row"><div><strong>AI provider</strong><span>Your conversations are processed by Groq.</span></div><span className="setting-value"><span className="status-dot" /> Groq</span></div>
            <div className="setting-row"><div><strong>Model</strong><span>Open-weight reasoning model</span></div><span className="setting-value">GPT-OSS 120B</span></div>
            <div className="setting-row"><div><strong>API key</strong><span>Stored securely on the server, never in this browser.</span></div><span className="setting-value">Environment variable</span></div>
            <div className="settings-note"><Sparkles size={16} /> Add <code>GROQ_API_KEY</code> in your deployment environment to activate chat.</div>
            <button className="modal-done" onClick={() => setSettingsOpen(false)}>Done</button>
          </section>
        </div>
      )}
    </main>
  );
}