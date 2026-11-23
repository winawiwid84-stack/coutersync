import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Bookmark,
  Check,
  Clock,
  Copy,
  FileText,
  Film,
  Hash,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  Upload,
  Video,
  Wrench,
  X,
} from 'lucide-react';
import {
  AgentStepLog,
  AppMode,
  ContentPlatform,
  ContentTone,
  GeneratedContentPackage,
  SavedContentDraft,
  Venue,
} from '../types/courtsync';

interface AIContentStudioProps {
  mode: AppMode;
  venues: Venue[];
  savedDrafts: SavedContentDraft[];
  isSignedIn: boolean;
  onSaveDraft: (params: {
    roleMode: AppMode;
    venueId?: string;
    platform: string;
    tone: string;
    prompt: string;
    mediaType: 'none' | 'image' | 'video';
    mediaFileName?: string;
    content: GeneratedContentPackage;
  }) => Promise<void>;
  onDeleteDraft: (draftId: string) => void;
  onPromptLogin: () => void;
}

const PLATFORMS: ContentPlatform[] = [
  'Instagram Reels',
  'TikTok',
  'Instagram Feed',
  'WhatsApp Broadcast',
];

const TONES: ContentTone[] = [
  'Energik & Sporty',
  'Santai Khas Bandung',
  'Profesional Promo GOR',
  'Hype Kompetitif',
];

const B2C_PRESETS = [
  {
    label: 'Recap Mabar Badminton',
    prompt:
      'Buat konten recap keseruan Mabar Badminton malam ini di Bandung dan ajak teman-teman gabung sesi minggu depan pakai Split Bill CourtSync.',
    platform: 'Instagram Reels' as ContentPlatform,
  },
  {
    label: 'Ajak Mabar Padel Bandung',
    prompt:
      'Buat ajakan Open Play Padel santai untuk level Pemula sampai Menengah di Bandung, highlight suasana seru dan patungan otomatis via QRIS.',
    platform: 'TikTok' as ContentPlatform,
  },
  {
    label: 'Highlight Futsal Komunitas',
    prompt:
      'Dari foto/video pertandingan futsal tim kami, buatkan skrip video singkat yang hype untuk TikTok lengkap dengan hook 3 detik pertama dan ajakan sparring komunitas Bandung.',
    platform: 'TikTok' as ContentPlatform,
  },
];

const B2B_PRESETS = [
  {
    label: 'Promo Off-Peak Siang',
    prompt:
      'Buatkan kampanye promosi diskon jam sepi (Off-Peak) Senin–Jumat siang untuk menarik mahasiswa dan komunitas kantor di Bandung agar booking lapangan langsung di CourtSync.',
    platform: 'Instagram Reels' as ContentPlatform,
  },
  {
    label: 'Tur Fasilitas GOR',
    prompt:
      'Buat naskah dan caption tur fasilitas lapangan premium kami (karpet/rumput standar turnamen, parkir luas, booking instan anti-bentrok) berdasarkan media yang diunggah.',
    platform: 'Instagram Feed' as ContentPlatform,
  },
  {
    label: 'Broadcast Slot Weekend',
    prompt:
      'Susun pesan broadcast WhatsApp dan caption singkat untuk menginformasikan sisa slot prime-time akhir pekan yang masih kosong agar segera dikunci oleh member dan tim Bandung.',
    platform: 'WhatsApp Broadcast' as ContentPlatform,
  },
];

const REFINE_SHORTCUTS = [
  'Buat gaya bahasa lebih santai & akrab khas anak Bandung',
  'Persingkat skrip video jadi 15 detik yang lebih padat',
  'Tonjolkan info diskon jam sepi & patungan Split Bill QRIS',
];

export const AIContentStudio: React.FC<AIContentStudioProps> = ({
  mode,
  venues,
  savedDrafts,
  isSignedIn,
  onSaveDraft,
  onDeleteDraft,
  onPromptLogin,
}) => {
  const [prompt, setPrompt] = useState('');
  const [platform, setPlatform] = useState<ContentPlatform>('Instagram Reels');
  const [tone, setTone] = useState<ContentTone>(
    mode === 'B2B' ? 'Profesional Promo GOR' : 'Energik & Sporty'
  );
  const [selectedVenueId, setSelectedVenueId] = useState<string>(venues[0]?.id ?? '');

  // Uploaded media state
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Agent execution & output state
  const [isRunning, setIsRunning] = useState(false);
  const [agentSteps, setAgentSteps] = useState<AgentStepLog[]>([]);
  const [generatedContent, setGeneratedContent] = useState<GeneratedContentPackage | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Output UI state
  const [outputTab, setOutputTab] = useState<'caption' | 'storyboard' | 'whatsapp'>('caption');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftSavedNotice, setDraftSavedNotice] = useState(false);

  // Refinement state
  const [refineInput, setRefineInput] = useState('');
  const [isRefining, setIsRefining] = useState(false);

  const presets = useMemo(() => (mode === 'B2B' ? B2B_PRESETS : B2C_PRESETS), [mode]);

  useEffect(() => {
    setTone(mode === 'B2B' ? 'Profesional Promo GOR' : 'Energik & Sporty');
  }, [mode]);

  useEffect(() => {
    return () => {
      if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl);
    };
  }, [mediaPreviewUrl]);

  const handleSelectFile = (file: File | null) => {
    setErrorMessage(null);
    if (!file) {
      if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl);
      setMediaFile(null);
      setMediaPreviewUrl(null);
      return;
    }

    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      setErrorMessage('Format tidak didukung. Pilih file gambar (JPG, PNG, WEBP) atau video (MP4, WEBM, MOV).');
      return;
    }

    if (file.size > 35 * 1024 * 1024) {
      setErrorMessage('Ukuran media melebihi batas 35 MB. Gunakan gambar atau klip video yang lebih ringkas.');
      return;
    }

    if (mediaPreviewUrl) URL.revokeObjectURL(mediaPreviewUrl);
    setMediaFile(file);
    setMediaPreviewUrl(URL.createObjectURL(file));
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) handleSelectFile(dropped);
  };

  const handleCopyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      // Fallback copy if clipboard restricted
    }
  };

  const handleRunAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() && !mediaFile) {
      setErrorMessage('Masukkan prompt ide konten atau unggah gambar/video terlebih dahulu.');
      return;
    }

    setErrorMessage(null);
    setDraftSavedNotice(false);
    setIsRunning(true);
    setAgentSteps([]);
    setGeneratedContent(null);

    try {
      const formData = new FormData();
      formData.append('prompt', prompt.trim());
      formData.append('platform', platform);
      formData.append('tone', tone);
      formData.append('roleMode', mode);
      if (selectedVenueId) formData.append('venueId', selectedVenueId);
      if (mediaFile) formData.append('media', mediaFile);

      const response = await fetch('/api/ai-agent/generate', {
        method: 'POST',
        body: formData,
      });

      const contentType = response.headers.get('content-type') || '';
      if (!response.ok || contentType.includes('application/json')) {
        const errPayload = await response.json().catch(() => ({ error: 'Gagal menghubungi AI Agent.' }));
        throw new Error(errPayload.error || `Request gagal (${response.status})`);
      }

      if (!response.body) {
        throw new Error('Stream respons AI Agent tidak tersedia.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';

        for (const rawBlock of events) {
          if (!rawBlock.trim()) continue;
          const lines = rawBlock.split('\n');
          let eventName = 'message';
          let dataLine = '';

          for (const line of lines) {
            if (line.startsWith('event:')) {
              eventName = line.slice(6).trim();
            } else if (line.startsWith('data:')) {
              dataLine += line.slice(5).trim();
            }
          }

          if (!dataLine) continue;
          const parsed = JSON.parse(dataLine);

          if (eventName === 'agent_step') {
            setAgentSteps((prev) => [...prev, parsed as AgentStepLog]);
          } else if (eventName === 'content_ready') {
            setGeneratedContent(parsed.content as GeneratedContentPackage);
            setOutputTab(platform === 'WhatsApp Broadcast' ? 'whatsapp' : 'caption');
          } else if (eventName === 'agent_error') {
            throw new Error(parsed.error || 'Terjadi kesalahan saat memproses konten.');
          }
        }
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Gagal menjalankan AI Content Agent.'
      );
    } finally {
      setIsRunning(false);
    }
  };

  const handleRefineContent = async (customInstruction?: string) => {
    const instruction = (customInstruction ?? refineInput).trim();
    if (!generatedContent || instruction.length < 2 || isRefining) return;

    setIsRefining(true);
    setErrorMessage(null);
    setDraftSavedNotice(false);

    try {
      const res = await fetch('/api/ai-agent/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentContent: generatedContent,
          instruction,
          roleMode: mode,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gagal merevisi konten.');
      }
      setGeneratedContent(data.content as GeneratedContentPackage);
      setRefineInput('');
      setAgentSteps((prev) => [
        ...prev,
        {
          id: `step-refine-${Date.now()}`,
          phase: 'done',
          title: 'Revisi konten selesai diterapkan',
          detail: `Instruksi: "${instruction}"`,
          timestamp: new Date().toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          }),
        },
      ]);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Gagal merevisi konten.');
    } finally {
      setIsRefining(false);
    }
  };

  const handleSaveCurrentDraft = async () => {
    if (!generatedContent || savingDraft) return;
    setSavingDraft(true);
    try {
      await onSaveDraft({
        roleMode: mode,
        venueId: selectedVenueId || undefined,
        platform,
        tone,
        prompt: prompt.trim() || generatedContent.title,
        mediaType: mediaFile
          ? mediaFile.type.startsWith('video/')
            ? 'video'
            : 'image'
          : 'none',
        mediaFileName: mediaFile?.name,
        content: generatedContent,
      });
      setDraftSavedNotice(true);
    } finally {
      setSavingDraft(false);
    }
  };

  const handleLoadDraft = (draft: SavedContentDraft) => {
    setGeneratedContent(draft.content);
    setPrompt(draft.prompt);
    if (PLATFORMS.includes(draft.platform as ContentPlatform)) {
      setPlatform(draft.platform as ContentPlatform);
    }
    if (TONES.includes(draft.tone as ContentTone)) {
      setTone(draft.tone as ContentTone);
    }
    if (draft.venueId) setSelectedVenueId(draft.venueId);
    setDraftSavedNotice(false);
    setErrorMessage(null);
    setOutputTab('caption');
  };

  const mediaIsVideo = mediaFile?.type.startsWith('video/') ?? false;
  const fullCaptionWithTags = generatedContent
    ? `${generatedContent.hook}\n\n${generatedContent.caption}\n\n${generatedContent.cta}\n\n${generatedContent.hashtags.join(' ')}`
    : '';

  return (
    <div className="space-y-8 pb-12">
      {/* Studio Header */}
      <section className="bg-[#0F172A] text-white rounded-2xl p-6 sm:p-8 flex flex-col lg:flex-row lg:items-end justify-between gap-6">
        <div className="space-y-2 max-w-2xl">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-400">
            <Sparkles className="w-4 h-4" />
            <span>
              AI Content Studio · {mode === 'B2B' ? 'Mode Mitra GOR (B2B)' : 'Mode Pemain & Komunitas (B2C)'}
            </span>
          </div>
          <h1 className="font-display font-extrabold text-2xl sm:text-3xl tracking-tight text-balance">
            Buat konten otomatis dari prompt, foto, atau video dengan AI Agent
          </h1>
          <p className="text-sm text-slate-300 leading-relaxed">
            Unggah dokumentasi foto/video lapangan atau tulis ide singkat. AI Agent akan menganalisis visual media, mengecek data tarif &amp; promo GOR Bandung, lalu menyusun caption, storyboard Reels/TikTok, dan broadcast WhatsApp siap pakai.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300 border-t lg:border-t-0 lg:border-l border-slate-700/80 pt-4 lg:pt-0 lg:pl-6 shrink-0">
          <div>
            <p className="text-[11px] text-slate-400">Input Didukung</p>
            <p className="font-semibold text-white">Prompt + Gambar / Video</p>
          </div>
          <div className="w-px h-7 bg-slate-700 hidden sm:block" />
          <div>
            <p className="text-[11px] text-slate-400">Riwayat Tersimpan</p>
            <p className="font-mono font-bold text-emerald-400 tabular-nums">
              {savedDrafts.length} Draft
            </p>
          </div>
        </div>
      </section>

      {/* Main 12-Column Studio Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (5 cols): Prompt Brief & Multimodal Media Upload */}
        <form
          onSubmit={handleRunAgent}
          className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display font-bold text-base text-slate-900">
              1. Brief &amp; Upload Media
            </h2>
            <span className="text-xs font-medium text-slate-500">
              Maks. 35 MB
            </span>
          </div>

          {/* Quick Presets */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700">
              Template Prompt Cepat ({mode === 'B2B' ? 'Mitra GOR' : 'Komunitas Pemain'})
            </label>
            <div className="flex flex-wrap gap-2">
              {presets.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    setPrompt(preset.prompt);
                    setPlatform(preset.platform);
                    setErrorMessage(null);
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 transition-colors text-left"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Drag-and-Drop Image or Video Upload Zone */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700">
              Unggah Gambar atau Video (Opsional)
            </label>

            {mediaFile && mediaPreviewUrl ? (
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-950">
                <div className="relative aspect-video bg-slate-950 flex items-center justify-center overflow-hidden">
                  {mediaIsVideo ? (
                    <video
                      src={mediaPreviewUrl}
                      controls
                      playsInline
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <img
                      src={mediaPreviewUrl}
                      alt="Pratinjau media yang diunggah"
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
                <div className="bg-white px-3.5 py-2.5 flex items-center justify-between gap-2 border-t border-slate-200">
                  <div className="flex items-center gap-2 min-w-0">
                    {mediaIsVideo ? (
                      <Video className="w-4 h-4 text-amber-600 shrink-0" />
                    ) : (
                      <ImageIcon className="w-4 h-4 text-emerald-600 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900 truncate">
                        {mediaFile.name}
                      </p>
                      <p className="text-[11px] font-mono text-slate-500 tabular-nums">
                        {(mediaFile.size / (1024 * 1024)).toFixed(2)} MB ·{' '}
                        {mediaIsVideo ? 'Video' : 'Gambar'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSelectFile(null)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors shrink-0"
                    title="Hapus media"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
                }}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
                  isDragging
                    ? 'border-emerald-500 bg-emerald-50/70'
                    : 'border-slate-300 hover:border-slate-400 bg-slate-50/70'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
                  onChange={(e) => handleSelectFile(e.target.files?.[0] ?? null)}
                  className="hidden"
                />
                <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center mx-auto mb-3 text-slate-700">
                  <Upload className="w-5 h-5" />
                </div>
                <p className="text-sm font-semibold text-slate-900">
                  Tarik &amp; lepas foto/video di sini, atau klik untuk pilih
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Mendukung JPG, PNG, WEBP, MP4, WEBM, MOV (hingga 35 MB)
                </p>
              </div>
            )}
          </div>

          {/* Prompt Textarea */}
          <div className="space-y-1.5">
            <label htmlFor="ai-prompt-input" className="block text-xs font-semibold text-slate-700">
              Prompt &amp; Arahan Konten
            </label>
            <textarea
              id="ai-prompt-input"
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Contoh: Buatkan konten Reels 20 detik dari video smash badminton ini untuk ajak Mabar di Bandung Jumat malam..."
              className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y"
            />
          </div>

          {/* Platform & Tone Selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="ai-platform-select" className="block text-xs font-semibold text-slate-700">
                Platform Target
              </label>
              <select
                id="ai-platform-select"
                value={platform}
                onChange={(e) => setPlatform(e.target.value as ContentPlatform)}
                className="w-full px-3 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="ai-tone-select" className="block text-xs font-semibold text-slate-700">
                Gaya Bahasa (Tone)
              </label>
              <select
                id="ai-tone-select"
                value={tone}
                onChange={(e) => setTone(e.target.value as ContentTone)}
                className="w-full px-3 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {TONES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Bandung Venue Reference Selector */}
          <div className="space-y-1.5">
            <label htmlFor="ai-venue-select" className="block text-xs font-semibold text-slate-700">
              Referensi GOR Bandung (untuk data tarif &amp; promo otomatis)
            </label>
            <select
              id="ai-venue-select"
              value={selectedVenueId}
              onChange={(e) => setSelectedVenueId(e.target.value)}
              className="w-full px-3 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">Otomatis deteksi oleh AI Agent</option>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.sport} · {v.area})
                </option>
              ))}
            </select>
          </div>

          {errorMessage && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start justify-between gap-3 text-xs text-red-800">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{errorMessage}</span>
              </div>
              <button
                type="button"
                disabled={isRunning}
                onClick={(e) => {
                  void handleRunAgent(e as unknown as React.FormEvent);
                }}
                className="px-2.5 py-1 rounded-md bg-red-600 hover:bg-red-700 text-white font-semibold whitespace-nowrap shrink-0 disabled:opacity-50"
              >
                Coba Lagi
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={isRunning}
            className="w-full py-3.5 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-slate-950 font-display font-bold text-sm transition-colors inline-flex items-center justify-center gap-2"
          >
            {isRunning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>AI Agent sedang bekerja...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Jalankan AI Content Agent</span>
              </>
            )}
          </button>
        </form>

        {/* Right Column (7 cols): Live Agent Execution Log + Generated Content Package */}
        <div className="lg:col-span-7 space-y-6">
          {/* Live Agent Steps / Proof of Work */}
          {(isRunning || agentSteps.length > 0) && (
            <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-emerald-600" />
                  <h3 className="font-display font-bold text-sm text-slate-900">
                    Aktivitas AI Content Agent
                  </h3>
                </div>
                {isRunning && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Memproses...
                  </span>
                )}
              </div>

              <ol className="space-y-2.5">
                {agentSteps.map((step) => (
                  <li
                    key={step.id}
                    className="flex items-start justify-between gap-3 text-xs border-l-2 border-slate-200 pl-3 py-0.5"
                  >
                    <div className="space-y-0.5 min-w-0">
                      <p className="font-semibold text-slate-900 flex items-center gap-1.5">
                        {step.phase === 'done' ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        ) : (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                        )}
                        <span>{step.title}</span>
                      </p>
                      <p className="text-slate-600 leading-snug">{step.detail}</p>
                    </div>
                    <span className="font-mono text-[11px] text-slate-400 tabular-nums shrink-0">
                      {step.timestamp}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {/* Generated Content Output Card */}
          {generatedContent ? (
            <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
              {/* Top Output Header */}
              <div className="p-5 sm:p-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-semibold text-emerald-700">
                      {generatedContent.platform}
                    </span>
                    <span>·</span>
                    <span>{generatedContent.contentGoal}</span>
                  </div>
                  <h2 className="font-display font-extrabold text-lg sm:text-xl text-slate-900 tracking-tight">
                    {generatedContent.title}
                  </h2>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleCopyText('all', fullCaptionWithTags)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
                  >
                    {copiedKey === 'all' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Tersalin</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Salin Semua</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveCurrentDraft}
                    disabled={savingDraft || draftSavedNotice}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-[#0F172A] hover:bg-slate-800 text-white disabled:opacity-60 transition-colors whitespace-nowrap"
                  >
                    {savingDraft ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : draftSavedNotice ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Bookmark className="w-3.5 h-3.5" />
                    )}
                    <span>{draftSavedNotice ? 'Tersimpan' : 'Simpan Draft'}</span>
                  </button>
                </div>
              </div>

              {/* Output Format Tabs */}
              <div className="px-5 sm:px-6 border-b border-slate-200 flex items-center gap-6 overflow-x-auto no-scrollbar text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setOutputTab('caption')}
                  className={`py-3 border-b-2 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                    outputTab === 'caption'
                      ? 'border-emerald-500 text-slate-900'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  Caption &amp; Hook
                </button>
                <button
                  type="button"
                  onClick={() => setOutputTab('storyboard')}
                  className={`py-3 border-b-2 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                    outputTab === 'storyboard'
                      ? 'border-emerald-500 text-slate-900'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Film className="w-3.5 h-3.5" />
                  Storyboard Video ({generatedContent.videoScript?.length ?? 0})
                </button>
                <button
                  type="button"
                  onClick={() => setOutputTab('whatsapp')}
                  className={`py-3 border-b-2 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                    outputTab === 'whatsapp'
                      ? 'border-emerald-500 text-slate-900'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  WhatsApp Broadcast
                </button>
              </div>

              {/* Tab Content Body */}
              <div className="p-5 sm:p-6 space-y-5">
                {/* Media Analysis Box (Always visible as concise summary) */}
                {generatedContent.mediaAnalysis && (
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Analisis Visual &amp; Arahan Media
                    </p>
                    <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                      {generatedContent.mediaAnalysis}
                    </p>
                  </div>
                )}

                {outputTab === 'caption' && (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-1">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                        Hook 3 Detik Pertama
                      </p>
                      <p className="font-display font-bold text-sm sm:text-base text-slate-900">
                        {generatedContent.hook}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-slate-700">Caption Siap Posting</p>
                        <button
                          type="button"
                          onClick={() => handleCopyText('caption', generatedContent.caption)}
                          className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 inline-flex items-center gap-1"
                        >
                          {copiedKey === 'caption' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          {copiedKey === 'caption' ? 'Tersalin' : 'Salin'}
                        </button>
                      </div>
                      <div className="p-4 rounded-xl bg-white border border-slate-200 text-sm text-slate-800 whitespace-pre-line leading-relaxed">
                        {generatedContent.caption}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="p-3.5 rounded-xl border border-slate-200 space-y-1">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                          Call-to-Action
                        </p>
                        <p className="text-xs sm:text-sm font-medium text-slate-900">
                          {generatedContent.cta}
                        </p>
                      </div>
                      <div className="p-3.5 rounded-xl border border-slate-200 space-y-1">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-amber-600" />
                          Rekomendasi Jam Tayang
                        </p>
                        <p className="text-xs sm:text-sm text-slate-700">
                          {generatedContent.bestPostingTime}
                        </p>
                      </div>
                    </div>

                    {/* Hashtags */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-slate-700 flex items-center gap-1">
                          <Hash className="w-3.5 h-3.5 text-slate-400" />
                          Hashtag Komunitas Bandung
                        </p>
                        <button
                          type="button"
                          onClick={() =>
                            handleCopyText('tags', generatedContent.hashtags.join(' '))
                          }
                          className="text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                        >
                          {copiedKey === 'tags' ? 'Tersalin' : 'Salin Tagar'}
                        </button>
                      </div>
                      <p className="font-mono text-xs text-slate-600 leading-relaxed">
                        {generatedContent.hashtags.join('  ')}
                      </p>
                    </div>
                  </div>
                )}

                {outputTab === 'storyboard' && (
                  <div className="space-y-5">
                    <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
                      {(generatedContent.videoScript || []).map((scene, idx) => (
                        <div
                          key={`${scene.timecode}-${idx}`}
                          className="p-4 bg-white grid grid-cols-1 sm:grid-cols-12 gap-3 text-xs sm:text-sm"
                        >
                          <div className="sm:col-span-3 space-y-1">
                            <span className="font-mono font-bold text-xs text-emerald-700 tabular-nums">
                              {scene.timecode}
                            </span>
                            <p className="font-display font-bold text-xs text-slate-900">
                              Teks Layar: &ldquo;{scene.onScreenText}&rdquo;
                            </p>
                          </div>
                          <div className="sm:col-span-9 space-y-1.5">
                            <p className="text-slate-800">
                              <strong className="text-slate-900">Visual:</strong> {scene.visual}
                            </p>
                            <p className="text-slate-600">
                              <strong className="text-slate-800">Voiceover / Audio:</strong>{' '}
                              {scene.voiceover}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {generatedContent.visualTips?.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-bold text-slate-700">
                          Saran Editing &amp; Visual dari AI Agent
                        </p>
                        <ul className="space-y-1.5 text-xs sm:text-sm text-slate-700 list-disc pl-5">
                          {generatedContent.visualTips.map((tip, i) => (
                            <li key={i}>{tip}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {outputTab === 'whatsapp' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-slate-700">
                        Siap Kirim ke Grup WhatsApp Komunitas / Pelanggan
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopyText('wa', generatedContent.whatsappBroadcast)
                        }
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
                      >
                        {copiedKey === 'wa' ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            Tersalin
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            Salin Pesan WA
                          </>
                        )}
                      </button>
                    </div>
                    <div className="p-4 sm:p-5 rounded-xl bg-emerald-50/50 border border-emerald-200 text-sm text-slate-800 whitespace-pre-line leading-relaxed font-sans">
                      {generatedContent.whatsappBroadcast}
                    </div>
                  </div>
                )}

                {/* Interactive Follow-Up Agent Refinement Bar */}
                <div className="pt-4 border-t border-slate-200 space-y-3">
                  <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5 text-emerald-600" />
                    Revisi Cepat dengan AI Agent
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {REFINE_SHORTCUTS.map((short) => (
                      <button
                        key={short}
                        type="button"
                        disabled={isRefining}
                        onClick={() => handleRefineContent(short)}
                        className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors disabled:opacity-50"
                      >
                        {short}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={refineInput}
                      onChange={(e) => setRefineInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleRefineContent();
                        }
                      }}
                      placeholder="Tulis instruksi revisi, mis. 'Tambahkan info gratis parkir & ubah ke gaya santai'..."
                      className="flex-1 px-3.5 py-2 text-xs sm:text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <button
                      type="button"
                      disabled={isRefining || refineInput.trim().length < 2}
                      onClick={() => handleRefineContent()}
                      className="px-4 py-2 rounded-lg bg-[#0F172A] hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5 shrink-0"
                    >
                      {isRefining ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Send className="w-3.5 h-3.5" />
                      )}
                      <span>Revisi</span>
                    </button>
                  </div>
                </div>
              </div>
            </section>
          ) : (
            !isRunning && (
              <section className="bg-white border border-slate-200 rounded-2xl p-8 sm:p-10 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center mx-auto">
                  <Sparkles className="w-6 h-6 text-emerald-600" />
                </div>
                <h3 className="font-display font-bold text-base text-slate-900">
                  Hasil Paket Konten AI Agent akan tampil di sini
                </h3>
                <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
                  Tulis prompt di sebelah kiri atau unggah foto/video aktivitas lapangan untuk membuat Hook, Caption, Storyboard Video Reels/TikTok, dan WhatsApp Broadcast secara otomatis.
                </p>
              </section>
            )
          )}

          {/* Saved Drafts History */}
          <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-display font-bold text-sm text-slate-900">
                  Riwayat Draft Konten ({savedDrafts.length})
                </h3>
                <p className="text-xs text-slate-500">
                  {isSignedIn
                    ? 'Tersinkronisasi otomatis ke akun Firestore milikmu.'
                    : 'Masuk akun untuk menyimpan riwayat draft konten secara permanen di cloud.'}
                </p>
              </div>
              {!isSignedIn && (
                <button
                  type="button"
                  onClick={onPromptLogin}
                  className="text-xs font-semibold text-emerald-700 hover:underline whitespace-nowrap shrink-0"
                >
                  Masuk Akun
                </button>
              )}
            </div>

            {savedDrafts.length === 0 ? (
              <p className="text-xs text-slate-500 py-3 border-t border-slate-100">
                Belum ada draft yang disimpan. Setelah AI Agent selesai membuat konten, klik tombol <strong>Simpan Draft</strong>.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 border-t border-slate-100">
                {savedDrafts.map((draft) => (
                  <div
                    key={draft.id}
                    className="py-3 flex items-center justify-between gap-3"
                  >
                    <button
                      type="button"
                      onClick={() => handleLoadDraft(draft)}
                      className="text-left min-w-0 flex-1 group"
                    >
                      <p className="text-sm font-semibold text-slate-900 group-hover:text-emerald-700 truncate transition-colors">
                        {draft.content.title}
                      </p>
                      <p className="text-xs text-slate-500 truncate mt-0.5">
                        {draft.platform} · {draft.tone}
                        {draft.mediaFileName ? ` · ${draft.mediaFileName}` : ''} · {draft.createdAtLabel}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteDraft(draft.id)}
                      title="Hapus draft"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
