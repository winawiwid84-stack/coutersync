import React, { useEffect, useRef, useState } from 'react';
import { Calendar, Clock, MapPin, Send, Users, X } from 'lucide-react';
import { LobbyChatMessage, OpenPlaySession, Venue } from '../types/courtsync';
import { formatDateIndo, formatHourRange } from '../utils/format';

interface LobbyChatDrawerProps {
  session: OpenPlaySession | null;
  venue: Venue | null;
  messages: LobbyChatMessage[];
  onClose: () => void;
  onSendMessage: (sessionId: string, text: string) => void;
}

const QUICK_REPLIES = [
  'Otw lapangan ya!',
  'Bawa shuttlecock / bola tambahan aman',
  'Titik kumpul di depan kasir ya',
];

export const LobbyChatDrawer: React.FC<LobbyChatDrawerProps> = ({
  session,
  venue,
  messages,
  onClose,
  onSendMessage,
}) => {
  const [draft, setDraft] = useState('');
  const [showMembers, setShowMembers] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, session?.id]);

  if (!session || !venue) return null;

  const court = venue.courts.find((c) => c.id === session.courtId);
  const sessionMessages = messages.filter((m) => m.sessionId === session.id);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed) return;
    onSendMessage(session.id, trimmed);
    setDraft('');
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/45 backdrop-blur-[2px]">
      <div
        className="w-full max-w-md bg-white h-full flex flex-col border-l border-slate-200 shadow-2xl"
        role="dialog"
        aria-label={`Chat Lobi ${session.title}`}
      >
        {/* Header */}
        <div className="bg-[#0F172A] text-white px-5 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-amber-400">Chat Lobi Sementara · {session.sport}</p>
            <h3 className="font-display font-bold text-base leading-snug mt-0.5 truncate">
              {session.title}
            </h3>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-300 mt-1.5">
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                {venue.name}
              </span>
              <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                {formatHourRange(session.hours)}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup chat lobi"
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Subbar: Info + Members toggle */}
        <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-slate-600 min-w-0 truncate">
            <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="truncate">
              {formatDateIndo(session.date)} · {court?.name ?? 'Lapangan Terkunci'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowMembers((v) => !v)}
            className="inline-flex items-center gap-1 font-semibold text-slate-800 hover:text-emerald-700 whitespace-nowrap shrink-0"
          >
            <Users className="w-3.5 h-3.5" />
            {session.currentPlayers}/{session.maxPlayers} Pemain
          </button>
        </div>

        {/* Expandable Participant List */}
        {showMembers && (
          <div className="px-5 py-3 bg-white border-b border-slate-200 text-xs">
            <p className="font-semibold text-slate-700 mb-2">Pemain Terkonfirmasi</p>
            <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-slate-600">
              {session.participants.map((name, idx) => (
                <span key={`${name}-${idx}`} className="inline-flex items-center gap-1">
                  <span className="font-medium text-slate-800">{name}</span>
                  {idx === 0 && <span className="text-amber-700">(Host)</span>}
                  {idx < session.participants.length - 1 && <span className="text-slate-300">·</span>}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Message List */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 bg-[#F8FAFC] thin-scrollbar">
          {sessionMessages.length === 0 ? (
            <div className="text-center py-10 text-xs text-slate-500">
              Belum ada pesan di lobi ini. Mulai koordinasi dengan rekan main kamu!
            </div>
          ) : (
            sessionMessages.map((msg) => {
              if (msg.isSystem) {
                return (
                  <div key={msg.id} className="text-center px-3 py-2 bg-slate-100 rounded-lg text-[11px] text-slate-600">
                    {msg.text}
                  </div>
                );
              }
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${msg.isCurrentUser ? 'items-end' : 'items-start'}`}
                >
                  <div className="flex items-center gap-2 mb-1 text-[11px] text-slate-500">
                    <span className="font-semibold text-slate-700">{msg.sender}</span>
                    <span className="font-mono tabular-nums">{msg.timestamp}</span>
                  </div>
                  <div
                    className={`max-w-[85%] px-3.5 py-2.5 rounded-xl text-sm leading-relaxed ${
                      msg.isCurrentUser
                        ? 'bg-[#0F172A] text-white rounded-tr-sm'
                        : 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm'
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              );
            })
          )}
          <div ref={endRef} />
        </div>

        {/* Quick Replies */}
        <div className="px-4 pt-2.5 pb-1 bg-white border-t border-slate-200 flex items-center gap-2 overflow-x-auto no-scrollbar">
          {QUICK_REPLIES.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => onSendMessage(session.id, q)}
              className="px-2.5 py-1 text-[11px] font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              {q}
            </button>
          ))}
        </div>

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="p-4 bg-white flex items-center gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Tulis pesan koordinasi ke lobi..."
            className="flex-1 px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            aria-label="Kirim pesan"
            className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-200 disabled:text-slate-400 text-slate-950 font-semibold rounded-lg transition-colors inline-flex items-center justify-center shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
