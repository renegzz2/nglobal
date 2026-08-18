import React, { useState, useEffect, useRef } from 'react';
import { User } from '../types';
import { MessageCircleIcon, SendIcon, XIcon } from './icons';
import { supabase } from '../lib/supabase';

interface Message {
  id: string;
  sender: string;
  senderId: string;
  content: string;
  timestamp: string;
  role: string;
  toUserId?: string | null;
  toRole?: string | null;
}

interface ChatMessengerProps {
  user: User;
  onClose?: () => void;
}

interface ChatUser {
  userId: string;
  name: string;
  role: string;
}

interface ActiveChat {
  id: string;
  label: string;
  type: 'role' | 'user';
}

const ChatMessenger: React.FC<ChatMessengerProps> = ({ onClose }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<ChatUser[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [activeChat, setActiveChat] = useState<ActiveChat | null>(null);
  const [view, setView] = useState<'contacts' | 'chat'>('contacts');
  const socketRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socketUrl = `${protocol}//${window.location.host}`;

    const connect = () => {
      const socket = new WebSocket(socketUrl);
      socketRef.current = socket;

      socket.onopen = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        const accessToken = session?.access_token;

        if (!accessToken) {
          setIsConnected(false);
          socket.close();
          return;
        }

        socket.send(JSON.stringify({
          type: 'auth',
          accessToken
        }));
      };

      socket.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === 'users') {
          setOnlineUsers(data.users);
          return;
        }

        if (data.type === 'auth_success') {
          setCurrentUserId(data.user?.userId || null);
          setIsConnected(true);
          return;
        }

        if (data.type === 'auth_error') {
          setIsConnected(false);
          socket.close();
          return;
        }

        if (data.type === 'message') {
          setMessages((prev) => {
            if (prev.some(m => m.id === data.id)) return prev;
            return [...prev, data];
          });
        }
      };

      socket.onclose = () => {
        setIsConnected(false);
        setTimeout(connect, 3000);
      };

      socket.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
    };

    connect();

    return () => {
      socketRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, activeChat]);

  const handleSendMessage = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim() || !socketRef.current || socketRef.current.readyState !== WebSocket.OPEN || !activeChat) {
      return;
    }

    const newMessage: Record<string, string> = {
      type: 'message',
      id: Date.now().toString(),
      content: inputValue.trim()
    };

    if (activeChat.type === 'role') {
      newMessage.toRole = activeChat.id;
    } else {
      newMessage.toUserId = activeChat.id;
    }

    socketRef.current.send(JSON.stringify(newMessage));
    setInputValue('');
  };

  const filteredMessages = messages.filter((msg) => {
    if (!activeChat || !currentUserId) return false;

    if (activeChat.type === 'role' && activeChat.id === 'COORDINADOR') {
      return (
        (msg.senderId === currentUserId && msg.toRole === 'COORDINADOR') ||
        (msg.role === 'COORDINADOR' && msg.toUserId === currentUserId)
      );
    }

    return (
      (msg.senderId === activeChat.id && msg.toUserId === currentUserId) ||
      (msg.senderId === currentUserId && msg.toUserId === activeChat.id)
    );
  });

  const handleSelectChat = (chat: ActiveChat) => {
    setActiveChat(chat);
    setView('chat');
  };

  const visibleUsers: ChatUser[] = Array.from(
    new Map<string, ChatUser>(
      onlineUsers
        .filter((u) => u.userId !== currentUserId)
        .map((u) => [u.userId, u])
    ).values()
  );

  return (
    <div className="w-full h-full bg-white flex flex-col border-l border-border">
      <div className="p-4 bg-primary flex items-center justify-between shadow-md pt-[calc(1rem+env(safe-area-inset-top))]">
        <div className="flex items-center gap-3">
          {view === 'chat' ? (
            <button
              onClick={() => setView('contacts')}
              className="p-1 hover:bg-white/10 rounded-lg text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          ) : (
            onClose && (
              <button
                onClick={onClose}
                className="p-1 hover:bg-white/10 rounded-lg text-white transition-colors lg:hidden"
              >
                <XIcon className="w-5 h-5" />
              </button>
            )
          )}
          <div>
            <h4 className="text-xs font-black text-white uppercase tracking-widest">
              {view === 'contacts' ? 'Mensajeria nglobal' : activeChat?.label}
            </h4>
            <div className="flex items-center gap-1">
              <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-success animate-pulse' : 'bg-gray-400'}`}></div>
              <span className="text-[7px] font-bold text-white/70 uppercase">
                {isConnected ? 'En linea' : 'Desconectado'}
              </span>
            </div>
          </div>
        </div>

        {onClose && view === 'chat' && (
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded-lg text-white transition-colors lg:hidden"
          >
            <XIcon className="w-5 h-5" />
          </button>
        )}

        {onClose && view === 'contacts' && (
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded-lg text-white transition-colors"
          >
            <XIcon className="w-5 h-5" />
          </button>
        )}
      </div>

      {view === 'contacts' ? (
        <div className="flex-1 overflow-y-auto bg-surface-secondary/20">
          <div className="p-4">
            <p className="text-[9px] font-black text-text-muted uppercase mb-4 tracking-widest opacity-60">Selecciona un contacto</p>

            <div className="space-y-2">
              <button
                onClick={() => handleSelectChat({ id: 'COORDINADOR', label: 'Coordinador en Turno', type: 'role' })}
                className={`w-full p-4 rounded-2xl flex items-center gap-4 transition-all border ${
                  activeChat?.id === 'COORDINADOR' ? 'bg-primary text-white border-primary shadow-lg' : 'bg-white text-text-primary border-border hover:border-primary/30'
                }`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-xs ${activeChat?.id === 'COORDINADOR' ? 'bg-white/20' : 'bg-primary/10 text-primary'}`}>
                  CO
                </div>
                <div className="text-left">
                  <p className="text-[10px] font-black uppercase">Coordinador en Turno</p>
                  <p className={`text-[8px] font-bold uppercase opacity-60 ${activeChat?.id === 'COORDINADOR' ? 'text-white' : 'text-primary'}`}>Soporte y Reportes</p>
                </div>
              </button>

              <div className="h-px bg-border/50 my-4" />

              {visibleUsers.map((u) => (
                <button
                  key={u.userId}
                  onClick={() => handleSelectChat({ id: u.userId, label: u.name, type: 'user' })}
                  className={`w-full p-4 rounded-2xl flex items-center gap-4 transition-all border ${
                    activeChat?.id === u.userId ? 'bg-primary text-white border-primary shadow-lg' : 'bg-white text-text-primary border-border hover:border-primary/30'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-xs ${activeChat?.id === u.userId ? 'bg-white/20' : 'bg-success/10 text-success'}`}>
                    {u.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="text-left">
                    <p className="text-[10px] font-black uppercase">{u.name}</p>
                    <p className={`text-[8px] font-bold uppercase opacity-60 ${activeChat?.id === u.userId ? 'text-white' : 'text-text-muted'}`}>{u.role}</p>
                  </div>
                </button>
              ))}

              {visibleUsers.length === 0 && (
                <div className="py-12 text-center opacity-30">
                  <p className="text-[9px] font-black uppercase tracking-widest">No hay otros usuarios<br />en linea</p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#f8f9fa] no-scrollbar">
            {filteredMessages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-30">
                <MessageCircleIcon className="w-10 h-10 mb-2" />
                <p className="text-[9px] font-black uppercase tracking-widest">No hay mensajes aun</p>
              </div>
            ) : (
              filteredMessages.map((msg) => {
                const isMe = msg.senderId === currentUserId;
                return (
                  <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    <div
                      className={`max-w-[85%] p-3 rounded-2xl shadow-sm text-xs ${
                        isMe
                          ? 'bg-[#dcf8c6] text-text-primary rounded-tr-none'
                          : 'bg-white text-text-primary rounded-tl-none border border-border/50'
                      }`}
                    >
                      <p className="leading-relaxed font-medium">{msg.content}</p>
                      <div className="flex justify-end mt-1">
                        <span className="text-[7px] opacity-40 font-bold">{msg.timestamp}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSendMessage} className="p-4 bg-white border-t border-border flex items-center gap-2 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Escribe un mensaje..."
              className="flex-1 bg-surface-secondary/50 border border-border rounded-xl px-4 py-2 text-xs font-bold focus:ring-2 focus:ring-primary/10 outline-none transition-all"
            />
            <button
              type="submit"
              disabled={!inputValue.trim() || !isConnected}
              className="p-2 bg-primary text-white rounded-xl hover:bg-primary-focus transition-all disabled:opacity-50 shadow-md"
            >
              <SendIcon className="w-4 h-4" />
            </button>
          </form>
        </>
      )}
    </div>
  );
};

export default ChatMessenger;
