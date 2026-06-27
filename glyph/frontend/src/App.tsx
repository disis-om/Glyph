import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { ArrowLeft, CheckCheck, Heart, MessageCircle, MoreHorizontal, Search, Send, Sparkles } from 'lucide-react';

type ChatUser = {
  id: string;
  name: string;
  avatarHue: number;
  status: 'online';
  joinedAt: string;
  lastSeenAt: string;
};

type DirectMessage = {
  id: string;
  threadId: string;
  from: string;
  to: string;
  author: string;
  text: string;
  createdAt: string;
  delivered: boolean;
};

type JoinResponse = {
  ok: boolean;
  user: ChatUser;
  users: ChatUser[];
};

const DEFAULT_SERVER_URL = 'https://dm-chat-api.shares.zrok.io';
const storedName = localStorage.getItem('dm-name') || '';
const storedHue = Number(localStorage.getItem('dm-avatar-hue') || Math.floor(Math.random() * 360));

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

function timeLabel(value?: string) {
  if (!value) return 'now';
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function threadKey(a: string, b: string) {
  return [a, b].sort().join(':');
}

export default function App() {
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER_URL);
  const [name, setName] = useState(storedName);
  const [draftName, setDraftName] = useState(storedName || '');
  const [avatarHue] = useState(storedHue);
  const [me, setMe] = useState<ChatUser | null>(null);
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [messages, setMessages] = useState<Record<string, DirectMessage[]>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [connected, setConnected] = useState(false);
  const [setupOpen, setSetupOpen] = useState(!storedName);
  const [typingFrom, setTypingFrom] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const typingTimer = useRef<number | null>(null);

  const peers = useMemo(() => users.filter((user) => user.id !== me?.id), [me?.id, users]);
  const filteredPeers = useMemo(() => {
    const cleanQuery = query.trim().toLowerCase();
    if (!cleanQuery) return peers;
    return peers.filter((user) => user.name.toLowerCase().includes(cleanQuery));
  }, [peers, query]);
  const activePeer = peers.find((user) => user.id === activeId) || null;
  const activeThread = me && activeId ? messages[threadKey(me.id, activeId)] || [] : [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeThread.length, activeId]);

  useEffect(() => {
    if (!name || !serverUrl) return;

    const socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      reconnectionDelayMax: 3500,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('user:join', { name, avatarHue }, (response: JoinResponse) => {
        if (!response?.ok) return;
        setMe(response.user);
        setUsers(response.users);
      });
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('users:update', (nextUsers: ChatUser[]) => {
      setUsers(nextUsers);
      setActiveId((current) => {
        if (current && nextUsers.some((user) => user.id === current)) return current;
        return nextUsers.find((user) => user.id !== socket.id)?.id || null;
      });
    });

    socket.on('message:new', (message: DirectMessage) => {
      setMessages((current) => ({
        ...current,
        [message.threadId]: [...(current[message.threadId] || []), message],
      }));
    });

    socket.on('typing', (payload: { from: string; name: string; isTyping: boolean }) => {
      setTypingFrom(payload.isTyping ? payload.from : null);
      window.setTimeout(() => setTypingFrom((current) => (current === payload.from ? null : current)), 1800);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [avatarHue, name, serverUrl]);

  useEffect(() => {
    if (!activeId || !socketRef.current || !connected) return;
    socketRef.current.emit('thread:open', activeId, (response: { ok: boolean; messages: DirectMessage[] }) => {
      if (!response?.ok || !me) return;
      setMessages((current) => ({
        ...current,
        [threadKey(me.id, activeId)]: response.messages,
      }));
    });
  }, [activeId, connected, me]);

  function saveSetup(event: FormEvent) {
    event.preventDefault();
    const nextName = draftName.trim().slice(0, 28);
    if (!nextName) return;

    localStorage.setItem('dm-name', nextName);
    localStorage.setItem('dm-server-url', DEFAULT_SERVER_URL);
    localStorage.setItem('dm-avatar-hue', String(avatarHue));
    setName(nextName);
    setServerUrl(DEFAULT_SERVER_URL);
    setMessages({});
    setSetupOpen(false);
  }

  function openDm(userId: string) {
    setActiveId(userId);
    setTypingFrom(null);
  }

  function updateDraft(value: string) {
    setDraft(value);
    if (activeId) {
      socketRef.current?.emit('typing', { to: activeId, isTyping: Boolean(value.trim()) });
      if (typingTimer.current) window.clearTimeout(typingTimer.current);
      typingTimer.current = window.setTimeout(() => {
        socketRef.current?.emit('typing', { to: activeId, isTyping: false });
      }, 800);
    }
  }

  function sendMessage(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !activeId || !connected) return;
    socketRef.current?.emit('message:send', { to: activeId, text });
    socketRef.current?.emit('typing', { to: activeId, isTyping: false });
    setDraft('');
  }

  function latestFor(peerId: string) {
    if (!me) return undefined;
    const thread = messages[threadKey(me.id, peerId)] || [];
    return thread[thread.length - 1];
  }

  return (
    <main className="dm-shell">
      <section className="phone-frame" aria-label="Direct Messages">
        <aside className={`inbox ${activePeer ? 'dim-on-mobile' : ''}`}>
          <header className="profile-bar">
            <button className="avatar-button" onClick={() => setSetupOpen(true)} type="button">
              <span style={{ '--hue': avatarHue } as React.CSSProperties}>{initials(name || 'Me')}</span>
            </button>
            <div>
              <p>{name || 'Set profile'}</p>
              <strong>{connected ? 'Active now' : 'Connecting...'}</strong>
            </div>
            <button className="icon-button" onClick={() => setSetupOpen(true)} type="button" aria-label="Settings">
              <MoreHorizontal size={20} />
            </button>
          </header>

          <div className="story-strip" aria-label="Online users">
            {peers.length === 0 ? (
              <div className="story ghost-story">
                <span>
                  <Sparkles size={18} />
                </span>
                <small>Waiting</small>
              </div>
            ) : (
              peers.map((user) => (
                <button className="story" key={user.id} onClick={() => openDm(user.id)} type="button">
                  <span style={{ '--hue': user.avatarHue } as React.CSSProperties}>{initials(user.name)}</span>
                  <small>{user.name}</small>
                </button>
              ))
            )}
          </div>

          <label className="search-box">
            <Search size={18} />
            <input placeholder="Search messages" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>

          <div className="section-title">
            <h1>Messages</h1>
            <span>{peers.length} online</span>
          </div>

          <nav className="dm-list" aria-label="DM list">
            {filteredPeers.length === 0 ? (
              <div className="empty-inbox">
                <MessageCircle size={30} />
                <p>No active people yet.</p>
              </div>
            ) : (
              filteredPeers.map((user) => {
                const latest = latestFor(user.id);
                const isActive = activeId === user.id;
                return (
                  <button className={isActive ? 'dm-row active' : 'dm-row'} key={user.id} onClick={() => openDm(user.id)} type="button">
                    <span className="avatar" style={{ '--hue': user.avatarHue } as React.CSSProperties}>
                      {initials(user.name)}
                    </span>
                    <span className="dm-copy">
                      <strong>{user.name}</strong>
                      <small>{latest ? latest.text : 'Tap to start a DM'}</small>
                    </span>
                    <time>{timeLabel(latest?.createdAt)}</time>
                  </button>
                );
              })
            )}
          </nav>
        </aside>

        <section className={`conversation ${activePeer ? 'open' : ''}`}>
          {activePeer ? (
            <>
              <header className="conversation-header">
                <button className="icon-button back-button" onClick={() => setActiveId(null)} type="button" aria-label="Back">
                  <ArrowLeft size={20} />
                </button>
                <span className="avatar" style={{ '--hue': activePeer.avatarHue } as React.CSSProperties}>
                  {initials(activePeer.name)}
                </span>
                <div>
                  <h2>{activePeer.name}</h2>
                  <p>{connected ? 'Active now' : 'Connecting...'}</p>
                </div>
                <button className="icon-button" type="button" aria-label="Favorite">
                  <Heart size={20} />
                </button>
              </header>

              <div className="chat-scroll">
                {activeThread.length === 0 ? (
                  <div className="dm-empty">
                    <span className="avatar hero-avatar" style={{ '--hue': activePeer.avatarHue } as React.CSSProperties}>
                      {initials(activePeer.name)}
                    </span>
                    <h3>{activePeer.name}</h3>
                    <p>Say hi and start the conversation.</p>
                  </div>
                ) : (
                  activeThread.map((message) => {
                    const mine = message.from === me?.id;
                    return (
                      <article className={mine ? 'bubble mine' : 'bubble'} key={message.id}>
                        <p>{message.text}</p>
                        <span>
                          {timeLabel(message.createdAt)}
                          {mine && <CheckCheck size={13} />}
                        </span>
                      </article>
                    );
                  })
                )}
                {typingFrom === activePeer.id && (
                  <div className="typing-bubble" aria-live="polite">
                    <span className="typing-dots" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                    </span>
                    <p>{activePeer.name} is typing…</p>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              <form className="composer" onSubmit={sendMessage}>
                <input
                  disabled={!connected}
                  onChange={(event) => updateDraft(event.target.value)}
                  placeholder="Message..."
                  value={draft}
                />
                <button disabled={!draft.trim() || !connected} type="submit" aria-label="Send">
                  <Send size={19} />
                </button>
              </form>
            </>
          ) : (
            <div className="select-state">
              <MessageCircle size={42} />
              <h2>Your messages</h2>
              <p>Pick someone online and start a private chat.</p>
            </div>
          )}
        </section>
      </section>

      {setupOpen && (
        <div className="setup-backdrop">
          <form className="setup-card" onSubmit={saveSetup}>
            <p className="mini-label">Profile</p>
            <h2>What should we call you?</h2>
            <label>
              Name
              <input autoFocus maxLength={28} placeholder="Enter your name" value={draftName} onChange={(event) => setDraftName(event.target.value)} />
            </label>
            <div className="setup-actions">
              {name && (
                <button className="quiet" onClick={() => setSetupOpen(false)} type="button">
                  Cancel
                </button>
              )}
              <button type="submit">Continue</button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
