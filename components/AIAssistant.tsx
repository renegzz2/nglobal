import React, { useState, useRef, useEffect } from 'react';
import Card from './ui/Card';
import { Message } from '../types';
import { sendMessage } from '../services/geminiService';

const AIAssistant: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'model',
      text: 'Hola, soy el asistente virtual de nglobal. Puedo ayudarte a localizar envíos, verificar estados o resolver dudas logísticas. ¿En qué puedo ayudarte hoy?',
      timestamp: new Date()
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: inputValue,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      const responseText = await sendMessage(userMessage.text);
      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: responseText,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, botMessage]);
    } catch (error) {
      console.error(error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: "Lo siento, hubo un error al procesar tu solicitud. Intenta de nuevo.",
        timestamp: new Date()
      };
       setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const suggestions = [
    "¿Dónde está el envío NG-849201?",
    "Lista de envíos retrasados",
    "¿Cuál es el ETA del envío a Paris?",
    "Resumen de operaciones de hoy"
  ];

  return (
    <div className="h-[calc(100vh-140px)] animate-fade-in flex flex-col gap-4">
      <Card className="flex-1 flex flex-col p-0 overflow-hidden shadow-lg border-primary/10">
        <div className="bg-primary p-4 border-b border-primary-focus">
            <h2 className="text-white font-semibold flex items-center">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>
                Asistente Operativo nglobal
            </h2>
            <p className="text-primary-content/70 text-sm">Impulsado por Gemini AI</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-5 py-3 shadow-sm ${
                  msg.role === 'user'
                    ? 'bg-primary text-white rounded-br-none'
                    : 'bg-white border border-border text-text-primary rounded-bl-none'
                }`}
              >
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.text}</p>
                <span className={`text-[10px] mt-1 block opacity-70 ${msg.role === 'user' ? 'text-primary-content' : 'text-text-muted'}`}>
                  {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          ))}
          {isLoading && (
             <div className="flex justify-start">
               <div className="bg-white border border-border text-text-primary rounded-2xl rounded-bl-none px-5 py-3 shadow-sm flex items-center space-x-2">
                 <div className="w-2 h-2 bg-primary/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                 <div className="w-2 h-2 bg-primary/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                 <div className="w-2 h-2 bg-primary/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
               </div>
             </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 bg-surface border-t border-border">
            {messages.length < 3 && (
                <div className="mb-4 flex flex-wrap gap-2">
                    {suggestions.map((s, i) => (
                        <button 
                            key={i}
                            onClick={() => { setInputValue(s); }} 
                            className="text-xs bg-secondary hover:bg-secondary-focus text-text-secondary px-3 py-1.5 rounded-full transition-colors border border-border"
                        >
                            {s}
                        </button>
                    ))}
                </div>
            )}
            
          <form onSubmit={handleSend} className="flex gap-2 relative">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Escribe tu consulta sobre logística..."
              className="flex-1 p-3 pr-10 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-background shadow-inner transition-all"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={!inputValue.trim() || isLoading}
              className="p-3 bg-primary text-white rounded-xl hover:bg-primary-focus disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md active:scale-95"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg>
            </button>
          </form>
          <p className="text-center text-xs text-text-muted mt-2">La IA puede cometer errores. Verifica la información importante.</p>
        </div>
      </Card>
    </div>
  );
};

export default AIAssistant;