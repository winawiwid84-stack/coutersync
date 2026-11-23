import React, { useEffect, useRef, useState } from 'react';
import {
  Bot,
  Loader2,
  MessageCircle,
  RotateCcw,
  Send,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import { AppMode, ChatbotMessage } from '../types/courtsync';

interface GeminiChatbotDrawerProps {
  mode: AppMode;
  userDisplayName?: string;
}

const B2C_STARTERS = [
  'Rekomendasi GOR Badminton murah jam siang di Bandung?',
  'Bagaimana cara kerja patungan Split Bill QRIS di CourtSync?',
  'Kasih tips pemanasan 10 menit sebelum mabar Padel di Dago!',
];

const B2B_STARTERS = [
  'Strategi Dynamic Pricing jam sepi untuk meningkatkan okupansi GOR?',
  'Bagaimana cara menghindari bentrok antara Walk-In dan booking online?',
  'Ide promo akhir pekan untuk menarik komunitas futsal Bandung',
];

function createWelcomeMessage(mode: AppMode, name?: string): ChatbotMessage {
  const greeting = name ? `Halo ${name}!` : 'Halo Sobat Olahraga Bandung!';
  return {
    id: 'welcome-msg',
    role: 'model',
    text:
      mode === 'B2B'
        ? `${greeting} Saya Coach AI CourtSync. Tanyakan strategi okupansi jam sepi, pengaturan Dynamic Pricing, atau tips mengelola operasional Mitra GOR Anda.`
        : `${greeting} Saya Coach AI CourtSync. Butuh rekomendasi GOR Bandung, cek promo jam sepi, panduan Split Bill patungan, atau tips latihan sebelum mabar? Tanyakan langsung ya!`,
    timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
  };
}

export const GeminiChatbotDrawer: React.FC<GeminiChatbotDrawerProps> = ({
  mode,
  userDisplayName,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [speedMode, setSpeedMode] = useState<'standard' | 'fast'>('standard');
  const [messages, setMessages] = useState<ChatbotMessage[]>(() => [
    createWelcomeMessage(mode, userDisplayName),
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const listEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, isLoading]);

  const sendMessage = async (textOverride?: string) => {
    const cleanText = (textOverride ?? input).trim();
    if (!cleanText || isLoading) return;

    const nowLabel = new Date().toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const userMsg: ChatbotMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: cleanText,
      timestamp: nowLabel,
    };

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    setErrorMsg(null);
    setIsLoading(true);

    try {
      const apiHistory = nextMessages
        .filter((m) => m.id !== 'welcome-msg')
        .map((m) => ({ role: m.role, text: m.text }));

      const res = await fetch('/api/ai-agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: apiHistory,
          roleMode: mode,
          speedMode,
        }),
      });

      const data = await res.json().catch(() => ({ error: 'Gagal memproses respons AI.' }));
      if (!res.ok) {
        throw new Error(data.error || `Request gagal (${res.status})`);
      }

      const replyMsg: ChatbotMessage = {
        id: `model-${Date.now()}`,
        role: 'model',
        text: String(data.reply || 'Maaf, saya belum bisa menjawab pertanyaan itu.'),
        timestamp: new Date().toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit',
        }),
        modelUsed: data.modelUsed ? String(data.modelUsed) : undefined,
      };
      setMessages((prev) => [...prev, replyMsg]);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Gagal menghubungi Coach AI. Coba kirim ulang.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setMessages([createWelcomeMessage(mode, userDisplayName)]);
    setErrorMsg(null);
  };

  const starters = mode === 'B2B' ? B2B_STARTERS : B2C_STARTERS;

  return (
    <>
      {/* Floating Trigger Button (Bottom-Right) */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label="Buka Asisten Coach AI CourtSync"
          className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2.5 px-4 py-3 bg-[#0F172A] hover:bg-slate-800 text-white border border-slate-700 rounded-2xl shadow-xl transition-all hover:-translate-y-0.5 print:hidden"
        >
          <span className="w-7 h-7 rounded-lg bg-emerald-500 text-slate-950 flex items-center justify-center shrink-0">
            <MessageCircle className="w-4 h-4" />
          </span>
          <div className="text-left leading-tight pr-1">
            <p className="font-display font-bold text-xs">Tanya Coach AI</p>
            <p className="text-[10px] text-emerald-400 font-medium">Asisten GOR Bandung</p>
          </div>
        </button>
      )}

      {/* Multi-Turn Slide-Over Chat Drawer */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Asisten Coach AI CourtSync"
          className="fixed bottom-4 right-4 z-50 w-[calc(100vw-2rem)] sm:w-[400px] h-[min(600px,calc(100vh-5rem))] bg-white border border-slate-200 rounded-2xl shadow-2xl flex flex-col overflow-hidden print:hidden"
        >
          {/* Header */}
          <div className="bg-[#0F172A] text-white px-4 py-3.5 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-emerald-500 text-slate-950 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="font-display font-bold text-sm truncate">
                  Coach AI CourtSync
                </h3>
                <p className="text-[11px] text-emerald-400 truncate">
                  {mode === 'B2B' ? 'Konsultan Mitra GOR Bandung' : 'Concierge Booking & Mabar'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={handleReset}
                title="Mulai percakapan baru"
                className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Tutup chat Coach AI"
                className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Model Speed Selector Bar */}
          <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-[11px] shrink-0">
            <span className="text-slate-600 font-medium">Mode Respons Gemini:</span>
            <div className="inline-flex items-center p-0.5 bg-slate-200/80 rounded-lg">
              <button
                type="button"
                onClick={() => setSpeedMode('standard')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold transition-colors ${
                  speedMode === 'standard'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Sparkles className="w-3 h-3 text-emerald-600" />
                <span>Cerdas</span>
              </button>
              <button
                type="button"
                onClick={() => setSpeedMode('fast')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-semibold transition-colors ${
                  speedMode === 'fast'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Zap className="w-3 h-3 text-amber-500" />
                <span>Kilat</span>
              </button>
            </div>
          </div>

          {/* Scrollable Multi-Turn Thread */}
          <div className="flex-1 overflow-y-auto thin-scrollbar p-4 space-y-3 bg-[#F8FAFC]">
            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap ${
                      isUser
                        ? 'bg-[#0F172A] text-white rounded-br-sm'
                        : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm shadow-2xs'
                    }`}
                  >
                    {msg.text}
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1 px-1 tabular-nums">
                    {isUser ? 'Kamu' : 'Coach AI'} · {msg.timestamp}
                  </span>
                </div>
              );
            })}

            {isLoading && (
              <div className="flex items-start">
                <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-xs text-slate-600 inline-flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600" />
                  <span>Menyiapkan jawaban...</span>
                </div>
              </div>
            )}

            {errorMsg && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">
                {errorMsg}
              </div>
            )}

            {/* Quick Starter Chips on fresh thread */}
            {messages.length === 1 && !isLoading && (
              <div className="pt-2 space-y-1.5">
                <p className="text-[11px] font-semibold text-slate-500">Coba tanyakan:</p>
                {starters.map((promptText) => (
                  <button
                    key={promptText}
                    type="button"
                    onClick={() => void sendMessage(promptText)}
                    className="w-full text-left px-3 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 rounded-xl transition-colors"
                  >
                    {promptText}
                  </button>
                ))}
              </div>
            )}
            <div ref={listEndRef} />
          </div>

          {/* Input Composer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendMessage();
            }}
            className="p-3 bg-white border-t border-slate-200 flex items-center gap-2 shrink-0"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isLoading}
              placeholder="Tulis pertanyaanmu di sini..."
              className="flex-1 px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              aria-label="Kirim pesan"
              className="p-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-slate-950 rounded-xl transition-colors shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
};
