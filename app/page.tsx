"use client";

import { Children, FormEvent, isValidElement, KeyboardEvent, ReactElement, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown, { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import {
  ArrowUp, Check, Copy, Edit3, Menu, MessageSquarePlus, Moon, PanelLeftClose,
  PanelLeftOpen, Search, Sun, Trash2, X, Coffee, SquarePen, Globe, ExternalLink,
  UserRound, Settings, StopCircle, Save, RefreshCw, Code2, Braces, FileCode2, Terminal, Database, FileJson
} from "lucide-react";

type SearchSource = { title: string; url: string; snippet: string };
type Message = { id: string; role: "user" | "assistant"; content: string; sources?: SearchSource[] };
type Chat = { id: string; title: string; messages: Message[]; updatedAt: number };
type Theme = "light" | "dark";
type UserProfile = { name: string; age: number };
type Panel = "onboarding" | "profile" | "settings" | null;
type PopupMenu = { kind: "message" | "chat"; id: string; x: number; y: number } | null;

const STORAGE_KEY = "juvao.chats.v2";
const THEME_KEY = "juvao.theme";
const PROFILE_KEY = "juvao.profile.v1";
const makeId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function normalizeMathDelimiters(value: string): string {
  return value
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, formula: string) => "$$\n" + formula.trim() + "\n$$")
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, formula: string) => "$" + formula.trim() + "$");
}

function getCodeText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(getCodeText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return getCodeText(node.props.children);
  return "";
}

function CodeBlock({ children }: { children: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const codeNode = Children.toArray(children).find((child) => isValidElement(child)) as ReactElement<{ className?: string; children?: ReactNode }> | undefined;
  const codeClass = codeNode?.props.className ?? "";
  const rawLanguage = codeClass.match(/language-([\\w+#.-]+)/i)?.[1]?.toLowerCase() ?? "";
  const languageNames: Record<string, string> = {
    js: "JavaScript", jsx: "JSX", ts: "TypeScript", tsx: "TSX", py: "Python",
    html: "HTML", css: "CSS", json: "JSON", bash: "Bash", sh: "Shell",
    shell: "Shell", sql: "SQL", java: "Java", c: "C", cpp: "C++",
    cs: "C#", go: "Go", rs: "Rust", php: "PHP", rb: "Ruby",
    swift: "Swift", kt: "Kotlin", yaml: "YAML", yml: "YAML",
    md: "Markdown", markdown: "Markdown", xml: "XML", toml: "TOML",
  };
  const language = languageNames[rawLanguage] ?? (rawLanguage ? rawLanguage.toUpperCase() : "Code");
  const LanguageIcon = ["js", "jsx", "ts", "tsx", "json"].includes(rawLanguage)
    ? Braces
    : ["bash", "sh", "shell"].includes(rawLanguage)
      ? Terminal
      : rawLanguage === "sql"
        ? Database
        : rawLanguage === "html" || rawLanguage === "css" || rawLanguage === "py"
          ? FileCode2
          : rawLanguage === "yaml" || rawLanguage === "yml"
            ? FileJson
            : Code2;

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(getCodeText(codeNode?.props.children ?? children));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {}
  }

  return (
    <div className="code-block">
      <div className="code-block-header">
        <span className="code-language"><LanguageIcon size={14} strokeWidth={1.9} />{language}</span>
        <button className="code-copy-button" type="button" onClick={copyCode} aria-label="Copy code">
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="code-block-pre">{children}</pre>
    </div>
  );
}

const markdownComponents: Components = {
  table: ({ children }) => <div className="table-scroll" role="region" aria-label="Scrollable table" tabIndex={0}><table>{children}</table></div>,
  a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>,
  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
};

const suggestions = [
  { title: "Explain a concept", description: "Make a difficult topic easy to understand.", prompt: "Explain a difficult topic in a simple, clear way." },
  { title: "Help me write", description: "Shape an idea into thoughtful writing.", prompt: "Help me write something clear and engaging." },
  { title: "Plan something", description: "Turn a goal into practical next steps.", prompt: "Help me turn an idea into a practical plan." },
];

export default function Home() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeId, setActiveId] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [theme, setTheme] = useState<Theme>("light");
  const [copiedId, setCopiedId] = useState("");
  const [error, setError] = useState("");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileName, setProfileName] = useState("");
  const [profileAge, setProfileAge] = useState("");
  const [panel, setPanel] = useState<Panel>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [popupMenu, setPopupMenu] = useState<PopupMenu>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const popupMenuRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const stopTypingRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!popupMenu) return;
    const closeOnOutsidePointer = (event: globalThis.PointerEvent) => {
      if (!popupMenuRef.current?.contains(event.target as Node)) setPopupMenu(null);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [popupMenu]);

  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem(THEME_KEY);
      if (savedTheme === "light" || savedTheme === "dark") setTheme(savedTheme);
      const savedProfile = localStorage.getItem(PROFILE_KEY);
      if (savedProfile) {
        const parsedProfile = JSON.parse(savedProfile) as UserProfile;
        if (parsedProfile && typeof parsedProfile.name === "string" && Number.isFinite(parsedProfile.age)) {
          setProfile(parsedProfile);
          setProfileName(parsedProfile.name);
          setProfileAge(String(parsedProfile.age));
        } else {
          setPanel("onboarding");
        }
      } else {
        setPanel("onboarding");
      }
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
    const first: Chat = { id: makeId(), title: "New chat", messages: [], updatedAt: Date.now() };
    setChats([first]);
    setActiveId(first.id);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

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
    const onShortcut = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (!streaming) newChat();
      }
      if (event.key === "/" && !typing) {
        event.preventDefault();
        document.querySelector<HTMLInputElement>(".search-input")?.focus();
      }
      if (event.key === "Escape") {
        setMobileSidebar(false);
        setPopupMenu(null);
      }
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, [streaming, chats, activeId]);

  function saveProfile() {
    const name = profileName.trim().slice(0, 40);
    const age = Number(profileAge);
    if (!name || !Number.isInteger(age) || age < 1 || age > 120) {
      setError("Ismni kiriting va yoshni 1–120 oralig‘ida belgilang.");
      return;
    }
    const next = { name, age };
    setProfile(next);
    localStorage.setItem(PROFILE_KEY, JSON.stringify(next));
    setPanel(null);
    setError("");
  }

  function openProfile() {
    setProfileName(profile?.name ?? "");
    setProfileAge(profile ? String(profile.age) : "");
    setPanel("profile");
  }

  function stopGeneration() {
    stopTypingRef.current?.();
    abortRef.current?.abort();
  }

  function newChat() {
    if (streaming) return;
    const chat: Chat = { id: makeId(), title: "New chat", messages: [], updatedAt: Date.now() };
    setChats((prev) => [chat, ...prev]);
    setActiveId(chat.id);
    if (textareaRef.current) { textareaRef.current.value = ""; textareaRef.current.style.height = "auto"; textareaRef.current.style.overflowY = "hidden"; }
    setError("");
    setMobileSidebar(false);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function deleteChat(id: string) {
    if (streaming) return;
    const next = chats.filter((chat) => chat.id !== id);
    if (!next.length) {
      const fresh: Chat = { id: makeId(), title: "New chat", messages: [], updatedAt: Date.now() };
      setChats([fresh]);
      setActiveId(fresh.id);
    } else {
      setChats(next);
      if (activeId === id) setActiveId(next[0].id);
    }
  }

  async function sendMessage(value?: string, editMessageId?: string) {
    const text = (value ?? textareaRef.current?.value ?? "").trim();
    if (!text || streaming || !activeChat) return;
    setError("");
    if (textareaRef.current) { textareaRef.current.value = ""; textareaRef.current.style.height = "auto"; textareaRef.current.style.overflowY = "hidden"; }

    const autoSearch = /\b(latest|today|current|currently|recent|news|price|weather|2026|internet|internetdan|web|search|duckduckgo|google|qidiruv|qidir|izla|manba|source|yangilik|bugun|hozir|narx|kurs)\b/i.test(text);
    const useWebSearch = autoSearch;
    const editIndex = editMessageId ? activeChat.messages.findIndex((message) => message.id === editMessageId && message.role === "user") : -1;
    if (editMessageId && editIndex < 0) return;
    const previousMessages = editIndex >= 0 ? activeChat.messages.slice(0, editIndex) : activeChat.messages;
    const userMessage: Message = editIndex >= 0
      ? { ...activeChat.messages[editIndex], content: text }
      : { id: makeId(), role: "user", content: text };
    const assistantMessage: Message = { id: makeId(), role: "assistant", content: "" };
    const title = activeChat.title;

    setChats((prev) => prev.map((chat) => chat.id === activeChat.id
      ? { ...chat, title, messages: [...previousMessages, userMessage, assistantMessage], updatedAt: Date.now() }
      : chat
    ));
    setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;
    let typingTimer: number | undefined;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...previousMessages, userMessage].map(({ role, content }) => ({ role, content })),
          webSearch: useWebSearch,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Something went wrong. Please try again.");
      }
      if (!response.body) throw new Error("Your browser does not support streaming.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let receivedText = "";
      let displayedText = "";
      let pendingText = "";
      typingTimer = window.setInterval(() => {
        if (!pendingText.length) return;
        const next = pendingText.slice(0, 24);
        pendingText = pendingText.slice(24);
        displayedText += next;
        setChats((prev) => prev.map((chat) => chat.id === activeChat.id
          ? {
              ...chat,
              messages: chat.messages.map((message) =>
                message.id === assistantMessage.id ? { ...message, content: displayedText } : message
              ),
              updatedAt: Date.now(),
            }
          : chat
        ));
      }, 8);
      stopTypingRef.current = () => {
        pendingText = "";
        if (typingTimer !== undefined) window.clearInterval(typingTimer);
      };

      const consumeEvent = (event: string) => {
        for (const line of event.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const data = JSON.parse(payload);
            if (Array.isArray(data.sources)) {
              setChats((prev) => prev.map((chat) => chat.id === activeChat.id
                ? { ...chat, messages: chat.messages.map((message) => message.id === assistantMessage.id ? { ...message, sources: data.sources } : message) }
                : chat
              ));
            }
            const token = data.choices?.[0]?.delta?.content;
            if (typeof token === "string" && token) {
              receivedText += token;
              pendingText += token;
            }
          } catch {}
        }
      };

      while (true) {
        const { value: chunk, done } = await reader.read();
        buffer += decoder.decode(chunk, { stream: !done });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        events.forEach(consumeEvent);
        if (done) break;
      }
      if (buffer.trim()) consumeEvent(buffer);
      while (pendingText.length && !controller.signal.aborted) await new Promise((resolve) => window.setTimeout(resolve, 8));
      window.clearInterval(typingTimer);
      if (!receivedText) throw new Error("No response was received. Please try again.");

      // Ask JUVAO to create a concise title for a brand-new conversation.
      if (previousMessages.length === 0) {
        void fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            task: "title",
            messages: [
              { role: "user", content: text },
              { role: "assistant", content: receivedText.slice(0, 1200) },
            ],
          }),
        })
          .then(async (result) => result.ok ? result.json() : null)
          .then((data) => {
            const generatedTitle = typeof data?.title === "string" ? data.title.trim().slice(0, 48) : "";
            if (!generatedTitle) return;
            setChats((prev) => prev.map((chat) =>
              chat.id === activeChat.id && chat.title === "New chat"
                ? { ...chat, title: generatedTitle }
                : chat
            ));
          })
          .catch(() => {});
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setChats((prev) => prev.map((chat) => chat.id === activeChat.id
          ? {
              ...chat,
              messages: chat.messages.filter((message) =>
                message.id !== assistantMessage.id || Boolean(message.content.trim())
              ),
            }
          : chat
        ));
      } else {
        const message = err instanceof Error ? err.message : "Something went wrong.";
        setError(message);
        setChats((prev) => prev.map((chat) => chat.id === activeChat.id
          ? {
              ...chat,
              messages: chat.messages.map((item) =>
                item.id === assistantMessage.id
                  ? { ...item, content: "I couldn't finish that response. Please try again." }
                  : item
              ),
            }
          : chat
        ));
      }
    } finally {
      if (typingTimer !== undefined) window.clearInterval(typingTimer);
      setStreaming(false);
      abortRef.current = null;
      stopTypingRef.current = null;
      textareaRef.current?.focus();
    }
  }

  function regenerateResponse(message: Message) {
    if (streaming || !activeChat) return;
    const messageIndex = activeChat.messages.findIndex((item) => item.id === message.id);
    if (messageIndex < 0 || message.role !== "assistant") return;
    let userIndex = messageIndex - 1;
    while (userIndex >= 0 && activeChat.messages[userIndex].role !== "user") userIndex--;
    if (userIndex < 0) return;
    const userMessage = activeChat.messages[userIndex];
    void sendMessage(userMessage.content, userMessage.id);
  }

  function beginEdit(message: Message) {
    if (streaming) return;
    setEditingMessageId(message.id);
    setEditDraft(message.content);
  }

  function cancelEdit() {
    setEditingMessageId(null);
    setEditDraft("");
  }

  function saveEdit(messageId: string) {
    const revised = editDraft.trim();
    if (!revised || streaming) return;
    setEditingMessageId(null);
    setEditDraft("");
    void sendMessage(revised, messageId);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    sendMessage();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      sendMessage();
    }
  }

  function clearLongPress() {
    if (longPressTimerRef.current !== null) window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  }

  function selectMessageText(id: string) {
    const element = document.getElementById("message-text-" + id);
    if (!element) return;
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(element);
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  async function copyMessage(message: Message) {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedId(message.id);
      window.setTimeout(() => setCopiedId(""), 1500);
    } catch {
      setError("Could not copy this message.");
    }
  }

  return (
    <main className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : "sidebar-collapsed"} ${mobileSidebar ? "mobile-visible" : ""}`}>
        <div className="sidebar-header">
          <a className="brand" href="/" aria-label="JUVAO home">
            <span className="brand-mark"><Coffee size={20} strokeWidth={1.8} /></span>
            {sidebarOpen && <span className="brand-name">juvao<span>.</span></span>}
          </a>
          <button className="icon-button sidebar-toggle" onClick={() => setSidebarOpen((value) => !value)} aria-label="Toggle sidebar">
            {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
          </button>
          <button className="icon-button mobile-close" onClick={() => setMobileSidebar(false)} aria-label="Close sidebar"><X size={18} /></button>
        </div>

        <button className="new-chat-button" onClick={newChat} disabled={streaming}>
          <SquarePen size={17} />
          {sidebarOpen && <><span>New chat</span><kbd>Ctrl K</kbd></>}
        </button>

        {sidebarOpen && <>
          <div className="section-label">YOUR CHATS</div>
          <div className="search-wrap">
            <Search size={15} />
            <input className="search-input" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search conversations" />
            <kbd>/</kbd>
          </div>
          <div className="history-label">RECENTS</div>
          <div className="chat-list">
            {filteredChats.map((chat) => (
              <div
                className={`chat-item ${chat.id === activeId ? "active" : ""}`}
                key={chat.id}
                onContextMenu={(event) => { event.preventDefault(); setPopupMenu({ kind: "chat", id: chat.id, x: event.clientX, y: event.clientY }); }}
                onTouchStart={(event) => {
                  const touch = event.touches[0];
                  const x = touch.clientX;
                  const y = touch.clientY;
                  longPressTriggeredRef.current = false;
                  clearLongPress();
                  longPressTimerRef.current = window.setTimeout(() => {
                    longPressTriggeredRef.current = true;
                    setPopupMenu({ kind: "chat", id: chat.id, x, y });
                  }, 480);
                }}
                onTouchEnd={clearLongPress}
                onTouchCancel={clearLongPress}
                onTouchMove={clearLongPress}
              >
                <button className="chat-select" onClick={(event) => { if (longPressTriggeredRef.current) { event.preventDefault(); longPressTriggeredRef.current = false; return; } setPopupMenu(null); setActiveId(chat.id); setMobileSidebar(false); }}>
                  <MessageSquarePlus size={15} />
                  <span>{chat.title}</span>
                </button>
              </div>
            ))}
            {filteredChats.length === 0 && <p className="empty-search">No conversations found</p>}
          </div>
        </>}

        <div className="sidebar-bottom">
          {sidebarOpen && <div className="sidebar-footnote">A little space for big ideas.</div>}
          <button className="theme-row" onClick={openProfile}>
            <UserRound size={16} />
            {sidebarOpen && <><span>Profile</span><span className="theme-state">{profile?.name || "Set up"}</span></>}
          </button>
          <button className="theme-row" onClick={() => setPanel("settings")}>
            <Settings size={16} />
            {sidebarOpen && <span>Settings</span>}
          </button>
          <button className="theme-row" onClick={() => setTheme((value) => value === "light" ? "dark" : "light")}>
            <span className="theme-icon">{theme === "light" ? <Moon size={16} /> : <Sun size={16} />}</span>
            {sidebarOpen && <><span>{theme === "light" ? "Dark appearance" : "Light appearance"}</span><span className="theme-state">{theme === "light" ? "Off" : "On"}</span></>}
          </button>
        </div>
      </aside>

      {mobileSidebar && <button className="mobile-scrim" onClick={() => setMobileSidebar(false)} aria-label="Close menu" />}

      <section className="main-panel">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button mobile-menu" onClick={() => setMobileSidebar(true)} aria-label="Open menu"><Menu size={19} /></button>
            <div className="topbar-brand"><span className="topbar-coffee"><Coffee size={17} /></span><span>JUVAO</span></div>
          </div>
          <button className="icon-button top-theme" onClick={() => setTheme((value) => value === "light" ? "dark" : "light")} aria-label="Toggle appearance">
            {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
          </button>
        </header>

        <div className="conversation-scroll">
          <div className={`conversation ${messages.length === 0 ? "conversation-empty" : ""}`}>
            {messages.length === 0 ? (
              <div className="welcome">
                <div className="welcome-logo"><Coffee size={29} strokeWidth={1.65} /></div>
                <p className="welcome-overline">A CLEAR SPACE TO THINK</p>
                <h1>What can I help<br className="mobile-break" /> you with?</h1>
                <p className="welcome-subtitle">Ask anything. Explore an idea. Make something meaningful.</p>
                <div className="suggestion-grid">
                  {suggestions.map((item) => (
                    <button className="suggestion-card" key={item.title} onClick={() => sendMessage(item.prompt)}>
                      <strong>{item.title}</strong>
                      <span>{item.description}</span>
                      <ArrowUp size={15} className="suggestion-arrow" />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="message-stack">
                {messages.map((message) => (
                  <article
                    className={`message-row ${message.role === "user" ? "user-row" : "assistant-row"}`}
                    key={message.id}
                    onContextMenu={(event) => { event.preventDefault(); setPopupMenu({ kind: "message", id: message.id, x: event.clientX, y: event.clientY }); }}
                    onTouchStart={(event) => {
                      const touch = event.touches[0];
                      const x = touch.clientX;
                      const y = touch.clientY;
                      longPressTriggeredRef.current = false;
                      clearLongPress();
                      longPressTimerRef.current = window.setTimeout(() => {
                        longPressTriggeredRef.current = true;
                        setPopupMenu({ kind: "message", id: message.id, x, y });
                      }, 480);
                    }}
                    onTouchEnd={clearLongPress}
                    onTouchCancel={clearLongPress}
                    onTouchMove={clearLongPress}
                  >
                    <div className="message-content-wrap">
                      {message.role === "assistant" && <div className="message-author">JUVAO</div>}
                      <div className={`message-bubble ${message.role === "user" ? "user-bubble" : "assistant-bubble"}`}>
                        {message.role === "assistant" && !message.content && streaming ? (
                          <div className="thinking"><span /><span /><span /><em>Thinking</em></div>
                        ) : message.role === "user" && editingMessageId === message.id ? (
                          <textarea
                            className="edit-message-input"
                            value={editDraft}
                            onChange={(event) => setEditDraft(event.target.value)}
                            rows={Math.min(8, Math.max(2, editDraft.split("\n").length))}
                            autoFocus
                          />
                        ) : (
                          <div className="markdown-body" id={"message-text-" + message.id}>
                            <ReactMarkdown
                              remarkPlugins={[remarkMath, remarkGfm]}
                              rehypePlugins={[rehypeKatex, rehypeHighlight]}
                              components={markdownComponents}
                            >{normalizeMathDelimiters(message.content)}</ReactMarkdown>
                            {streaming && message.role === "assistant" && message === messages[messages.length - 1] && <span className="typing-cursor" />}
                          </div>
                        )}
                      </div>
                      {message.role === "user" && !streaming && editingMessageId === message.id && (
                        <div className="message-actions user-message-actions">
                          <button onClick={() => saveEdit(message.id)} disabled={!editDraft.trim()}><Check size={14} /> Save & resend</button>
                          <button onClick={cancelEdit}><X size={14} /> Cancel</button>
                        </div>
                      )}
                      {message.role === "assistant" && message.content && (
                        <div className="message-actions">
                          <button onClick={() => copyMessage(message)} aria-label="Copy response">
                            {copiedId === message.id ? <Check size={14} /> : <Copy size={14} />}
                            {copiedId === message.id ? "Copied" : "Copy"}
                          </button>
                          {message === messages[messages.length - 1] && !streaming && (
                            <button onClick={() => regenerateResponse(message)} aria-label="Regenerate response" title="Regenerate response">
                              <RefreshCw size={14} /> Regenerate
                            </button>
                          )}
                        </div>
                      )}
                      {message.role === "assistant" && message.sources && message.sources.length > 0 && (
                        <div className="source-list">
                          <div className="source-heading"><Globe size={13} /> Sources</div>
                          <div className="source-items">
                            {message.sources.map((source, index) => (
                              <a className="source-item" href={source.url} target="_blank" rel="noreferrer" key={source.url}>
                                <span className="source-number">{index + 1}</span>
                                <span className="source-text"><strong>{source.title}</strong><small>{new URL(source.url).hostname}</small></span>
                                <ExternalLink size={12} />
                              </a>
                            ))}
                          </div>
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
          {error && <div className="error-banner"><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss error"><X size={14} /></button></div>}
          <form className="composer" onSubmit={onSubmit}>
            <textarea
              ref={textareaRef}
              onChange={(event) => {
                const element = event.currentTarget;
                element.style.height = "auto";
                const nextHeight = Math.min(element.scrollHeight, 120);
                element.style.height = `${nextHeight}px`;
                element.style.overflowY = element.scrollHeight > 120 ? "auto" : "hidden";
              }}
              onKeyDown={onKeyDown}
              placeholder="Message JUVAO..."
              rows={1}
              aria-label="Message JUVAO"
            />
            <div className="composer-footer">
              {streaming ? (
                <button className="send-button stop-button" type="button" onClick={stopGeneration} aria-label="Stop generating" title="Stop generating">
                  <StopCircle size={18} />
                </button>
              ) : (
                <button className="send-button" type="submit" aria-label="Send message">
                  <ArrowUp size={18} />
                </button>
              )}
            </div>
          </form>
          <p className="disclaimer">JUVAO may make mistakes. Check important information.</p>
        </div>
      </section>
      {popupMenu && (
        <div ref={popupMenuRef} className="selection-popup" role="menu"
          style={{
            left: `clamp(12px, ${popupMenu.x}px, calc(100vw - 172px))`,
            top: `clamp(12px, ${popupMenu.y}px, calc(100dvh - ${popupMenu.kind === "message" ? "150px" : "58px"}))`,
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}>
          {popupMenu.kind === "message" ? (
            <>
              <button role="menuitem" onClick={() => {
                const message = messages.find((item) => item.id === popupMenu.id);
                if (message) void copyMessage(message);
                setPopupMenu(null);
              }}><Copy size={14} /> Copy</button>
              {messages.find((item) => item.id === popupMenu.id)?.role === "user" && (
                <>
                  <span className="selection-divider" />
                  <button role="menuitem" disabled={streaming} onClick={() => {
                    const message = messages.find((item) => item.id === popupMenu.id);
                    if (message) beginEdit(message);
                    setPopupMenu(null);
                  }}><Edit3 size={14} /> Edit</button>
                </>
              )}
              <span className="selection-divider" />
              <button role="menuitem" onClick={() => {
                selectMessageText(popupMenu.id);
                setPopupMenu(null);
              }}><Check size={14} /> Select text</button>
            </>
          ) : (
            <button role="menuitem" disabled={streaming} onClick={() => {
              deleteChat(popupMenu.id);
              longPressTriggeredRef.current = false;
              setPopupMenu(null);
            }}><Trash2 size={14} /> Delete chat</button>
          )}
        </div>
      )}
      {panel && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && panel !== "onboarding") setPanel(null);
        }}>
          <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="panel-title">
            <div className="modal-header">
              <div>
                <p className="modal-eyebrow">JUVAO ACCOUNT</p>
                <h2 id="panel-title">{panel === "onboarding" ? "Welcome to JUVAO" : panel === "profile" ? "Your profile" : "Settings"}</h2>
              </div>
              {panel !== "onboarding" && <button className="icon-button" onClick={() => setPanel(null)} aria-label="Close"><X size={18} /></button>}
            </div>
            {panel === "onboarding" || panel === "profile" ? (
              <form className="profile-form" onSubmit={(event) => { event.preventDefault(); saveProfile(); }}>
                {panel === "onboarding" && <p className="modal-description">Boshlash uchun ismingiz va yoshingizni kiriting. Bu ma’lumotlar faqat ushbu brauzer qurilmasida saqlanadi.</p>}
                <label htmlFor="profile-name">Name</label>
                <input id="profile-name" value={profileName} onChange={(event) => setProfileName(event.target.value)} placeholder="Ismingiz" maxLength={40} autoComplete="name" required />
                <label htmlFor="profile-age">Age</label>
                <input id="profile-age" type="number" min="1" max="120" step="1" value={profileAge} onChange={(event) => setProfileAge(event.target.value)} placeholder="Yoshingiz" required />
                <button className="modal-primary" type="submit"><Save size={16} /> {panel === "onboarding" ? "Continue" : "Save profile"}</button>
              </form>
            ) : (
              <div className="settings-content">
                <div className="settings-row">
                  <div><strong>Appearance</strong><small>JUVAO ko‘rinishini tanlang</small></div>
                  <button className="settings-choice" onClick={() => setTheme((value) => value === "light" ? "dark" : "light")}>{theme === "light" ? "Light" : "Dark"}</button>
                </div>
                
                <div className="settings-row">
                  <div><strong>Profile</strong><small>{profile ? `${profile.name} · ${profile.age} yosh` : "Hali sozlanmagan"}</small></div>
                  <button className="settings-choice" onClick={openProfile}>Edit</button>
                </div>
                <p className="settings-note">Profil ma’lumotlari hozircha faqat shu qurilmaning brauzerida saqlanadi; hisoblararo sinxronlash mavjud emas.</p>
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
