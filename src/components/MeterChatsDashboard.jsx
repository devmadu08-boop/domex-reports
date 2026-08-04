import {
  ArrowLeft,
  FileText,
  Image,
  KeyRound,
  MapPin,
  MessageCircle,
  Mic,
  RefreshCw,
  Search,
  Send,
  Sticker,
  UserRound,
  Users,
  Video,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchMeterChatMessages,
  fetchMeterChats,
  markMeterChatRead,
  sendMeterChatReply,
} from "../services/meterMonitorApi.js";

const ACCESS_KEY_STORAGE = "domex-meter-chat-access-key";

function messageIcon(type) {
  if (type === "image") return Image;
  if (type === "video") return Video;
  if (type === "document") return FileText;
  if (type === "audio") return Mic;
  if (type === "sticker") return Sticker;
  if (type === "location") return MapPin;
  return MessageCircle;
}

function displayTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return new Intl.DateTimeFormat("en-GB", sameDay
    ? { hour: "2-digit", minute: "2-digit" }
    : { month: "short", day: "2-digit" }).format(date);
}

function ChatAvatar({ chat, large = false }) {
  const Icon = chat?.type === "group" ? Users : UserRound;
  return (
    <span className={`grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-lg shadow-violet-200 ${large ? "h-12 w-12" : "h-11 w-11"}`}>
      <Icon className={large ? "h-6 w-6" : "h-5 w-5"} />
    </span>
  );
}

export default function MeterChatsDashboard() {
  const [accessKey, setAccessKey] = useState(() => sessionStorage.getItem(ACCESS_KEY_STORAGE) || "");
  const [accessDraft, setAccessDraft] = useState("");
  const [authorized, setAuthorized] = useState(Boolean(accessKey));
  const [chats, setChats] = useState([]);
  const [selectedJid, setSelectedJid] = useState("");
  const [messages, setMessages] = useState([]);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState({ connected: false, connectedNumber: "", accountMode: "separate" });
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [mobileThreadOpen, setMobileThreadOpen] = useState(false);
  const threadEndRef = useRef(null);

  const selectedChat = chats.find((chat) => chat.jid === selectedJid) || null;
  const filteredChats = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return chats;
    return chats.filter((chat) => `${chat.name} ${chat.jid} ${chat.lastMessage || ""}`.toLowerCase().includes(term));
  }, [chats, query]);

  async function loadChats(key = accessKey, showLoader = false) {
    if (!key) return;
    if (showLoader) setLoading(true);
    try {
      const data = await fetchMeterChats(key);
      setAuthorized(true);
      setError("");
      setChats(data.chats || []);
      setStatus(data);
      setSelectedJid((current) => current || data.chats?.[0]?.jid || "");
    } catch (requestError) {
      if (showLoader) {
        setAuthorized(false);
        sessionStorage.removeItem(ACCESS_KEY_STORAGE);
      }
      setError(requestError.message || "Meter Chats could not be loaded.");
    } finally {
      if (showLoader) setLoading(false);
    }
  }

  async function loadMessages(jid = selectedJid) {
    if (!accessKey || !jid || !authorized) return;
    try {
      const data = await fetchMeterChatMessages(accessKey, jid);
      setMessages(data.messages || []);
      await markMeterChatRead(accessKey, jid);
      setChats((current) => current.map((chat) => (chat.jid === jid ? { ...chat, unreadCount: 0 } : chat)));
    } catch (requestError) {
      setError(requestError.message || "Messages could not be loaded.");
    }
  }

  useEffect(() => {
    if (!accessKey || !authorized) return undefined;
    loadChats(accessKey, true);
    const timer = window.setInterval(() => loadChats(accessKey), 4000);
    return () => window.clearInterval(timer);
  }, [accessKey, authorized]);

  useEffect(() => {
    if (!selectedJid || !authorized) {
      setMessages([]);
      return undefined;
    }
    loadMessages(selectedJid);
    const timer = window.setInterval(() => loadMessages(selectedJid), 2500);
    return () => window.clearInterval(timer);
  }, [selectedJid, accessKey, authorized]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, selectedJid]);

  async function unlock(event) {
    event.preventDefault();
    const key = accessDraft.trim();
    if (!key) return;
    setAccessKey(key);
    sessionStorage.setItem(ACCESS_KEY_STORAGE, key);
    await loadChats(key, true);
  }

  function lockDashboard() {
    sessionStorage.removeItem(ACCESS_KEY_STORAGE);
    setAccessKey("");
    setAccessDraft("");
    setAuthorized(false);
    setChats([]);
    setMessages([]);
    setSelectedJid("");
  }

  function openChat(jid) {
    setSelectedJid(jid);
    setMobileThreadOpen(true);
    setError("");
  }

  async function sendMessage(event) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text || !selectedJid || sending || !status.connected) return;
    setSending(true);
    setError("");
    try {
      await sendMeterChatReply(accessKey, selectedJid, text);
      setDraft("");
      await Promise.all([loadMessages(selectedJid), loadChats(accessKey)]);
    } catch (requestError) {
      setError(requestError.message || "Message could not be sent.");
    } finally {
      setSending(false);
    }
  }

  function handleComposerKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  }

  if (!authorized) {
    return (
      <section className="mx-auto grid min-h-[58vh] max-w-xl place-items-center px-2">
        <form onSubmit={unlock} className="glass-panel grid w-full gap-5 p-6 text-center md:p-8">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-[24px] bg-violet-600 text-white shadow-xl shadow-violet-200">
            <KeyRound className="h-8 w-8" />
          </span>
          <div>
            <h2 className="text-2xl font-black text-[#11143b]">Meter Chats</h2>
            <p className="mt-1 text-sm font-bold text-[#726793]">Protected WhatsApp inbox</p>
          </div>
          <input
            type="password"
            value={accessDraft}
            onChange={(event) => setAccessDraft(event.target.value)}
            placeholder="Chat access key"
            autoComplete="current-password"
            className="whatsapp-control h-13 px-4"
          />
          {error && <p className="rounded-2xl bg-rose-100 px-4 py-3 text-sm font-bold text-rose-700">{error}</p>}
          <button type="submit" disabled={!accessDraft.trim() || loading} className="primary-action min-h-12 disabled:opacity-50">
            {loading ? <RefreshCw className="h-5 w-5 animate-spin" /> : <KeyRound className="h-5 w-5" />}
            Open Inbox
          </button>
        </form>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-[28px] border border-violet-100 bg-[#f8f5ff] shadow-[12px_14px_30px_rgba(91,73,145,0.16),-10px_-10px_24px_rgba(255,255,255,0.92)]">
      <div className="grid min-h-[68vh] lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className={`${mobileThreadOpen ? "hidden" : "flex"} min-h-0 flex-col border-r border-violet-100 bg-[#f4efff] lg:flex`}>
          <div className="border-b border-violet-100 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-[#11143b]">Meter Chats</h2>
                <p className={`mt-1 text-xs font-black ${status.connected ? "text-emerald-600" : "text-rose-600"}`}>
                  {status.connected ? `Connected · ${status.connectedNumber}` : "Disconnected"}
                </p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => loadChats(accessKey, true)} title="Refresh chats" className="grid h-10 w-10 place-items-center rounded-2xl bg-white text-violet-700 shadow-md hover:bg-violet-50">
                  <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                </button>
                <button type="button" onClick={lockDashboard} title="Lock inbox" className="grid h-10 w-10 place-items-center rounded-2xl bg-white text-[#6f6597] shadow-md hover:bg-violet-50">
                  <KeyRound className="h-4 w-4" />
                </button>
              </div>
            </div>
            <label className="mt-4 flex h-11 items-center gap-2 rounded-2xl border border-violet-100 bg-white px-3 shadow-inner">
              <Search className="h-4 w-4 text-violet-400" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search chats" className="min-w-0 flex-1 bg-transparent text-sm font-bold outline-none" />
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {filteredChats.map((chat) => {
              const Icon = messageIcon(chat.lastMessageType);
              const active = chat.jid === selectedJid;
              return (
                <button key={chat.jid} type="button" onClick={() => openChat(chat.jid)} className={`mb-1 grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl p-3 text-left transition ${active ? "bg-violet-600 text-white shadow-lg shadow-violet-200" : "hover:bg-white"}`}>
                  <ChatAvatar chat={chat} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-black">{chat.name}</span>
                    <span className={`mt-1 flex items-center gap-1 truncate text-xs font-semibold ${active ? "text-white/75" : "text-[#756b94]"}`}>
                      {chat.lastMessage && <Icon className="h-3.5 w-3.5 shrink-0" />}
                      <span className="truncate">{chat.lastMessage || (chat.type === "group" ? "Group" : "Private chat")}</span>
                    </span>
                  </span>
                  <span className="grid justify-items-end gap-1">
                    <span className={`text-[10px] font-bold ${active ? "text-white/75" : "text-[#8a80a7]"}`}>{displayTime(chat.lastMessageAt)}</span>
                    {chat.unreadCount > 0 && <span className={`grid min-h-5 min-w-5 place-items-center rounded-full px-1 text-[10px] font-black ${active ? "bg-white text-violet-700" : "bg-emerald-500 text-white"}`}>{chat.unreadCount}</span>}
                  </span>
                </button>
              );
            })}
            {!filteredChats.length && <p className="p-8 text-center text-sm font-bold text-[#81779f]">No chats found</p>}
          </div>
        </aside>

        <div className={`${mobileThreadOpen ? "flex" : "hidden"} min-h-0 flex-col bg-[#fffaf7] lg:flex`}>
          {selectedChat ? (
            <>
              <header className="flex min-h-18 items-center gap-3 border-b border-violet-100 bg-[#fff8f4] px-3 py-3 md:px-5">
                <button type="button" onClick={() => setMobileThreadOpen(false)} className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-violet-700 hover:bg-violet-100 lg:hidden">
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <ChatAvatar chat={selectedChat} large />
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-base font-black text-[#11143b]">{selectedChat.name}</h3>
                  <p className="truncate text-xs font-semibold text-[#786e98]">{selectedChat.type === "group" ? "Group" : selectedChat.jid.split("@")[0]}</p>
                </div>
                <span className={`rounded-xl px-3 py-2 text-xs font-black ${status.connected ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                  {status.connected ? "Online" : "Offline"}
                </span>
              </header>

              {error && <p className="mx-3 mt-3 rounded-2xl bg-rose-100 px-4 py-3 text-sm font-bold text-rose-700 md:mx-5">{error}</p>}

              <div className="min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(circle_at_10%_10%,rgba(226,214,255,0.45),transparent_34%),radial-gradient(circle_at_90%_90%,rgba(211,245,235,0.42),transparent_30%)] px-3 py-5 md:px-6">
                <div className="mx-auto grid max-w-4xl gap-2">
                  {messages.map((message) => {
                    const Icon = messageIcon(message.type);
                    return (
                      <div key={message.id} className={`flex ${message.fromMe ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[88%] rounded-[20px] px-4 py-3 shadow-md md:max-w-[72%] ${message.fromMe ? "rounded-br-md bg-violet-600 text-white" : "rounded-bl-md bg-white text-[#16143a]"}`}>
                          {!message.fromMe && selectedChat.type === "group" && message.senderName && <p className="mb-1 text-xs font-black text-emerald-600">{message.senderName}</p>}
                          {message.quotedText && <p className={`mb-2 border-l-4 px-3 py-2 text-xs font-semibold ${message.fromMe ? "border-white/50 bg-white/10" : "border-violet-300 bg-violet-50"}`}>{message.quotedText}</p>}
                          {message.type !== "text" && <p className={`mb-1 flex items-center gap-2 text-xs font-black uppercase ${message.fromMe ? "text-white/75" : "text-violet-600"}`}><Icon className="h-4 w-4" />{message.type}</p>}
                          <p className="whitespace-pre-wrap break-words text-sm font-semibold leading-relaxed">{message.text}</p>
                          <p className={`mt-1 text-right text-[10px] font-bold ${message.fromMe ? "text-white/65" : "text-[#9288ad]"}`}>{displayTime(message.sentAt)}</p>
                        </div>
                      </div>
                    );
                  })}
                  {!messages.length && <p className="py-20 text-center text-sm font-bold text-[#81779f]">No synced messages</p>}
                  <div ref={threadEndRef} />
                </div>
              </div>

              <form onSubmit={sendMessage} className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 border-t border-violet-100 bg-[#fff8f4] p-3 md:p-4">
                <textarea
                  rows="1"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={handleComposerKeyDown}
                  placeholder={status.connected ? "Type a message" : "WhatsApp is disconnected"}
                  disabled={!status.connected}
                  className="max-h-32 min-h-12 resize-none rounded-[20px] border border-violet-100 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-violet-400 disabled:opacity-60"
                />
                <button type="submit" disabled={!draft.trim() || sending || !status.connected} title="Send message" className="grid h-12 w-12 place-items-center rounded-full bg-violet-600 text-white shadow-lg shadow-violet-300 transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-45">
                  {sending ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                </button>
              </form>
            </>
          ) : (
            <div className="grid flex-1 place-items-center p-8 text-center">
              <div>
                <span className="mx-auto grid h-20 w-20 place-items-center rounded-[28px] bg-violet-100 text-violet-600"><MessageCircle className="h-10 w-10" /></span>
                <p className="mt-4 text-lg font-black text-[#11143b]">Select a chat</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
