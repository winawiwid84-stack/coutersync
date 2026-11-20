import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  Content,
  FunctionDeclaration,
  GoogleGenAI,
  Part,
  Type,
  createPartFromUri,
} from '@google/genai';
import {
  BANDUNG_VENUES,
  INITIAL_DYNAMIC_PRICING,
  createInitialData,
} from '../../data/mockBandungData.ts';
import type {
  AgentStepLog,
  AppMode,
  GeneratedContentPackage,
} from '../../types/courtsync.ts';

const PRIMARY_MODEL = 'gemini-4-hydrogen';
const STANDBY_MODEL = 'gemini-3.1-flash-lite';
const INLINE_MEDIA_MAX_BYTES = 16 * 1024 * 1024; // 16 MB inline; >16 MB uses Files API

function isTransientOverloadError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes('503') ||
    msg.includes('unavailable') ||
    msg.includes('high demand') ||
    msg.includes('overloaded') ||
    msg.includes('deadline_exceeded') ||
    msg.includes('internal')
  );
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateWithResilience(
  ai: GoogleGenAI,
  params: Omit<Parameters<GoogleGenAI['models']['generateContent']>[0], 'model'>,
  onNotice?: (title: string, detail: string) => void
) {
  const attempts: Array<{ model: string; delayBeforeMs: number; label: string }> = [
    { model: PRIMARY_MODEL, delayBeforeMs: 0, label: PRIMARY_MODEL },
    { model: PRIMARY_MODEL, delayBeforeMs: 1500, label: `${PRIMARY_MODEL} (percobaan ulang 1)` },
    { model: PRIMARY_MODEL, delayBeforeMs: 3000, label: `${PRIMARY_MODEL} (percobaan ulang 2)` },
    { model: STANDBY_MODEL, delayBeforeMs: 800, label: `${STANDBY_MODEL} (model cadangan cepat)` },
  ];

  let lastError: unknown;
  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i];
    if (attempt.delayBeforeMs > 0) {
      await sleep(attempt.delayBeforeMs);
    }
    try {
      return await ai.models.generateContent({
        model: attempt.model,
        ...params,
      });
    } catch (err) {
      lastError = err;
      if (!isTransientOverloadError(err) || i === attempts.length - 1) {
        throw err;
      }
      const nextAttempt = attempts[i + 1];
      onNotice?.(
        'Server AI sedang padat (503) — mencoba ulang otomatis',
        `Mengalihkan permintaan ke ${nextAttempt.label} agar proses tetap berjalan.`
      );
    }
  }
  throw lastError;
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY belum terkonfigurasi di server. Pastikan API key sudah aktif di panel Settings > Secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function nowTimeLabel(): string {
  return new Date().toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

const agentToolDeclarations: FunctionDeclaration[] = [
  {
    name: 'get_bandung_venue_details',
    description:
      'Mengambil data lengkap GOR/venue olahraga CourtSync di Bandung (alamat, fasilitas, tarif lapangan, dan aturan promo diskon off-peak aktif).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        venueId: {
          type: Type.STRING,
          description:
            'ID venue spesifik (gor-cikutra, futsal-buahbatu, padel-dago, minisoccer-cihampelas) atau kosongkan untuk melihat semua venue.',
        },
        sport: {
          type: Type.STRING,
          description: 'Filter cabang olahraga: Badminton, Futsal, Mini Soccer, atau Padel.',
        },
      },
    },
  },
  {
    name: 'get_bandung_mabar_rooms',
    description:
      'Mengambil daftar sesi Open Play (Mabar) aktif di Bandung beserta sisa slot pemain, level skill, dan biaya patungan per orang.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        sport: {
          type: Type.STRING,
          description: 'Opsional: filter olahraga (Badminton, Futsal, Mini Soccer, Padel).',
        },
      },
    },
  },
  {
    name: 'get_optimal_posting_strategy',
    description:
      'Mengambil panduan strategi jadwal tayang terbaik, formula hook 3 detik, dan struktur konten untuk audiens komunitas olahraga Bandung berdasarkan platform.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        platform: {
          type: Type.STRING,
          description: 'Platform target: Instagram Reels, TikTok, Instagram Feed, atau WhatsApp Broadcast.',
        },
        roleMode: {
          type: Type.STRING,
          description: 'B2C (Pemain/Komunitas) atau B2B (Mitra Pemilik GOR).',
        },
      },
      required: ['platform'],
    },
  },
];

function executeAgentTool(
  name: string,
  args: Record<string, unknown>
): { summary: string; data: Record<string, unknown> } {
  if (name === 'get_bandung_venue_details') {
    const venueId = typeof args.venueId === 'string' ? args.venueId.trim() : '';
    const sport = typeof args.sport === 'string' ? args.sport.trim().toLowerCase() : '';

    let matched = BANDUNG_VENUES;
    if (venueId) {
      matched = matched.filter((v) => v.id === venueId);
    }
    if (sport) {
      matched = matched.filter((v) => v.sport.toLowerCase() === sport);
    }
    if (matched.length === 0) matched = BANDUNG_VENUES;

    const payload = matched.map((v) => {
      const promo = INITIAL_DYNAMIC_PRICING[v.id];
      const minPrice = Math.min(...v.courts.map((c) => c.basePricePerHour));
      return {
        id: v.id,
        name: v.name,
        sport: v.sport,
        area: v.area,
        address: v.address,
        rating: v.rating,
        facilities: v.facilities,
        startingPricePerHour: minPrice,
        courts: v.courts.map((c) => ({
          name: c.name,
          surface: c.surface,
          basePricePerHour: c.basePricePerHour,
        })),
        activePromo: promo?.enabled
          ? {
              label: promo.label,
              discountPercent: promo.discountPercent,
              hours: `${String(promo.startHour).padStart(2, '0')}:00 - ${String(promo.endHour).padStart(2, '0')}:00 WIB`,
            }
          : null,
      };
    });

    return {
      summary: `Mengambil data ${payload.length} GOR Bandung beserta tarif & promo off-peak aktif.`,
      data: { venues: payload },
    };
  }

  if (name === 'get_bandung_mabar_rooms') {
    const sport = typeof args.sport === 'string' ? args.sport.trim().toLowerCase() : '';
    const seed = createInitialData();
    let rooms = seed.openPlays;
    if (sport) {
      rooms = rooms.filter((r) => r.sport.toLowerCase() === sport);
    }

    const payload = rooms.map((r) => {
      const venue = BANDUNG_VENUES.find((v) => v.id === r.venueId);
      return {
        title: r.title,
        sport: r.sport,
        venueName: venue?.name ?? r.venueId,
        area: venue?.area ?? 'Bandung',
        skillLevel: r.skillLevel,
        remainingSlots: Math.max(0, r.maxPlayers - r.currentPlayers),
        maxPlayers: r.maxPlayers,
        costPerPerson: r.costPerPerson,
        date: r.date,
      };
    });

    return {
      summary: `Menemukan ${payload.length} sesi Mabar aktif di Bandung untuk referensi ajakan komunitas.`,
      data: { openPlays: payload },
    };
  }

  if (name === 'get_optimal_posting_strategy') {
    const platform = String(args.platform || 'Instagram Reels');
    const roleMode = String(args.roleMode || 'B2C');

    const strategies: Record<string, Record<string, unknown>> = {
      'Instagram Reels': {
        bestWindows: ['Selasa–Kamis 17:30–19:30 WIB (pulang kerja/kuliah Bandung)', 'Jumat 12:00–13:30 WIB (rencana mabar weekend)'],
        idealDuration: '15–30 detik ritme cepat dengan cut tiap 2–3 detik',
        hookPattern: 'Mulai langsung dari aksi olahraga/bola masuk + teks tebal masalah/penawaran di 2 detik awal',
      },
      TikTok: {
        bestWindows: ['Senin–Jumat 18:30–21:00 WIB', 'Sabtu 09:00–11:00 WIB'],
        idealDuration: '12–25 detik dengan audio trending energik dan POV natural',
        hookPattern: 'Gunakan POV lokal Bandung (contoh: "POV cari lapangan di Bandung tanpa ribet chat admin...")',
      },
      'Instagram Feed': {
        bestWindows: ['Rabu & Jumat 11:30–13:00 WIB', 'Minggu 19:00–20:30 WIB'],
        idealDuration: 'Carousel 4–5 slide atau foto hero kontras tinggi dengan caption terstruktur',
        hookPattern: 'Baris pertama wajib ringkas <= 90 karakter sebelum tombol Selengkapnya',
      },
      'WhatsApp Broadcast': {
        bestWindows: ['H-2 atau pagi hari H pukul 08:30–10:00 WIB'],
        idealDuration: 'Maksimal 8–12 baris dengan bullet jadwal, lokasi, patungan per orang, dan link booking',
        hookPattern: 'Buka dengan sapaan akrab komunitas & sisa slot/diskon yang jelas',
      },
    };

    return {
      summary: `Menyusun strategi jam tayang & pola hook ${platform} untuk mode ${roleMode}.`,
      data: {
        platform,
        roleMode,
        strategy: strategies[platform] ?? strategies['Instagram Reels'],
      },
    };
  }

  return {
    summary: `Tool ${name} selesai dijalankan.`,
    data: { status: 'ok' },
  };
}

const contentPackageResponseSchema = {
  type: Type.OBJECT,
  properties: {
    title: {
      type: Type.STRING,
      description: 'Judul kampanye atau konsep konten yang menarik (maks 120 karakter).',
    },
    platform: {
      type: Type.STRING,
      description: 'Nama platform target konten.',
    },
    contentGoal: {
      type: Type.STRING,
      description: 'Tujuan utama konten (mis. Isi Slot Off-Peak, Ajakan Mabar, Recap Komunitas).',
    },
    mediaAnalysis: {
      type: Type.STRING,
      description:
        'Analisis detail dari gambar atau video yang diunggah (aksi, suasana lapangan, pencahayaan, momen kunci untuk klip/thumbnail). Jika tidak ada media diunggah, berikan arahan visual konkret yang disarankan.',
    },
    hook: {
      type: Type.STRING,
      description: 'Kalimat hook pembuka 3 detik pertama / baris pertama yang menghentikan scroll.',
    },
    caption: {
      type: Type.STRING,
      description:
        'Caption lengkap siap posting dalam Bahasa Indonesia natural khas komunitas olahraga Bandung, lengkap dengan detail relevan dan paragraf rapi.',
    },
    videoScript: {
      type: Type.ARRAY,
      description: 'Storyboard 3 sampai 5 adegan untuk Reels/TikTok/Shorts atau urutan slide carousel.',
      items: {
        type: Type.OBJECT,
        properties: {
          timecode: { type: Type.STRING, description: 'Contoh: 00:00 - 00:03 atau Slide 1' },
          visual: { type: Type.STRING, description: 'Arahan visual atau klip dari video/foto yang digunakan.' },
          voiceover: { type: Type.STRING, description: 'Naskah suara / narasi singkat yang dibacakan.' },
          onScreenText: { type: Type.STRING, description: 'Teks overlay tebal di layar.' },
        },
        required: ['timecode', 'visual', 'voiceover', 'onScreenText'],
      },
    },
    whatsappBroadcast: {
      type: Type.STRING,
      description: 'Versi pesan ringkas siap kirim ke grup WhatsApp komunitas Mabar atau pelanggan GOR.',
    },
    cta: {
      type: Type.STRING,
      description: 'Call-to-Action spesifik (mis. booking di CourtSync, patungan Split Bill, atau kunci slot Mabar).',
    },
    hashtags: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '6 sampai 10 hashtag relevan lokal Bandung & cabang olahraga (diawali tanda #).',
    },
    bestPostingTime: {
      type: Type.STRING,
      description: 'Rekomendasi hari & jam tayang terbaik beserta alasan singkat.',
    },
    visualTips: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '3 tips praktis untuk editing video, framing foto, atau pemilihan musik latar.',
    },
  },
  required: [
    'title',
    'platform',
    'contentGoal',
    'mediaAnalysis',
    'hook',
    'caption',
    'videoScript',
    'whatsappBroadcast',
    'cta',
    'hashtags',
    'bestPostingTime',
    'visualTips',
  ],
};

export interface GenerateContentAgentInput {
  prompt: string;
  platform: string;
  tone: string;
  roleMode: AppMode;
  venueId?: string;
  mediaFile?: {
    buffer: Buffer;
    mimetype: string;
    originalname: string;
    size: number;
  };
  onStep: (step: AgentStepLog) => void;
}

async function prepareMediaPart(
  ai: GoogleGenAI,
  mediaFile: NonNullable<GenerateContentAgentInput['mediaFile']>,
  onStep: (step: AgentStepLog) => void
): Promise<{ part: Part; uploadedFileName?: string }> {
  const isVideo = mediaFile.mimetype.startsWith('video/');
  const sizeMb = (mediaFile.size / (1024 * 1024)).toFixed(1);

  if (mediaFile.size <= INLINE_MEDIA_MAX_BYTES) {
    onStep({
      id: `step-media-${Date.now()}`,
      phase: 'media',
      title: isVideo ? 'Memuat klip video untuk analisis multimodal' : 'Memuat gambar untuk analisis visual',
      detail: `${mediaFile.originalname} (${sizeMb} MB · ${mediaFile.mimetype}) siap dibaca langsung oleh AI Agent.`,
      timestamp: nowTimeLabel(),
    });

    return {
      part: {
        inlineData: {
          mimeType: mediaFile.mimetype,
          data: mediaFile.buffer.toString('base64'),
        },
      },
    };
  }

  // Larger videos (>16MB): upload via Gemini Files API and poll until ACTIVE
  onStep({
    id: `step-upload-${Date.now()}`,
    phase: 'media',
    title: 'Mengunggah video berukuran besar ke Gemini Files API',
    detail: `Memproses ${mediaFile.originalname} (${sizeMb} MB) agar AI Agent dapat menganalisis frame & audio video.`,
    timestamp: nowTimeLabel(),
  });

  const safeExt = path.extname(mediaFile.originalname) || (isVideo ? '.mp4' : '.jpg');
  const tmpPath = path.join(os.tmpdir(), `courtsync-media-${Date.now()}${safeExt}`);
  await fs.writeFile(tmpPath, mediaFile.buffer);

  try {
    let uploaded = await ai.files.upload({
      file: tmpPath,
      config: { mimeType: mediaFile.mimetype },
    });

    let attempts = 0;
    while (uploaded.state === 'PROCESSING' && attempts < 20) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      if (uploaded.name) {
        uploaded = await ai.files.get({ name: uploaded.name });
      }
      attempts++;
    }

    if (uploaded.state === 'FAILED' || !uploaded.uri) {
      throw new Error('Gemini gagal memproses file video yang diunggah. Coba format MP4/WebM berdurasi lebih pendek.');
    }

    return {
      part: createPartFromUri(uploaded.uri, uploaded.mimeType || mediaFile.mimetype),
      uploadedFileName: uploaded.name,
    };
  } finally {
    await fs.unlink(tmpPath).catch(() => {});
  }
}

export async function runContentCreatorAgent(
  input: GenerateContentAgentInput
): Promise<GeneratedContentPackage> {
  const ai = getGeminiClient();
  let uploadedFileName: string | undefined;

  try {
    const userParts: Part[] = [];

    if (input.mediaFile) {
      const mediaPrepared = await prepareMediaPart(ai, input.mediaFile, input.onStep);
      userParts.push(mediaPrepared.part);
      uploadedFileName = mediaPrepared.uploadedFileName;
    }

    const selectedVenue = input.venueId
      ? BANDUNG_VENUES.find((v) => v.id === input.venueId)
      : undefined;

    const briefText = [
      `PERAN PENGGUNA: ${input.roleMode === 'B2B' ? 'Mitra Pemilik GOR (B2B) di Bandung' : 'Pemain / Host Komunitas Olahraga (B2C) di Bandung'}`,
      `PLATFORM TARGET: ${input.platform}`,
      `GAYA BAHASA / TONE: ${input.tone}`,
      selectedVenue
        ? `VENUE TERPILIH: ${selectedVenue.name} (ID: ${selectedVenue.id}, Cabang: ${selectedVenue.sport}, Area: ${selectedVenue.area})`
        : 'VENUE TERPILIH: Umum Bandung (gunakan tool untuk memilih data relevan jika diperlukan)',
      input.mediaFile
        ? `MEDIA DIUNGGAH: ${input.mediaFile.mimetype.startsWith('video/') ? 'Video' : 'Gambar'} (${input.mediaFile.originalname})`
        : 'MEDIA DIUNGGAH: Tidak ada file (fokuskan arahan visual/pengambilan gambar).',
      `PROMPT PENGGUNA: ${input.prompt}`,
    ].join('\n');

    userParts.push({ text: briefText });

    const systemInstruction = `Kamu adalah AI Content Strategist & Creative Agent khusus untuk CourtSync (MainBareng), platform booking lapangan olahraga & matchmaking Mabar komunitas di Bandung.
Tugasmu:
1. Jika pengguna mengunggah gambar atau video, analisis secara mendalam detail visualnya (gerakan olahraga, jenis lapangan, pencahayaan, ekspresi, momen puncak/highlight).
2. Panggil tools yang tersedia (get_bandung_venue_details, get_bandung_mabar_rooms, get_optimal_posting_strategy) untuk mengambil data harga, promo off-peak, lokasi Bandung, jadwal Mabar, dan strategi tayang yang akurat.
3. Setelah semua informasi terkumpul, rangkum insight visual & strategi konten yang tajam dalam Bahasa Indonesia yang natural dan modern.`;

    input.onStep({
      id: `step-plan-${Date.now()}`,
      phase: 'reasoning',
      title: 'AI Agent merencanakan riset & strategi konten',
      detail: `Menganalisis brief "${input.prompt.slice(0, 72)}${input.prompt.length > 72 ? '...' : ''}" untuk ${input.platform}.`,
      timestamp: nowTimeLabel(),
    });

    const conversation: Content[] = [{ role: 'user', parts: userParts }];
    let agentBriefNotes = '';

    // Stage 1: Real multi-step Agent Function-Calling loop (max 3 tool rounds)
    for (let turn = 0; turn < 3; turn++) {
      const response = await generateWithResilience(
        ai,
        {
          contents: conversation,
          config: {
            systemInstruction,
            tools: [{ functionDeclarations: agentToolDeclarations }],
          },
        },
        (title, detail) => {
          input.onStep({
            id: `step-retry-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
            phase: 'reasoning',
            title,
            detail,
            timestamp: nowTimeLabel(),
          });
        }
      );

      const modelContent = response.candidates?.[0]?.content;
      const calls = response.functionCalls;

      if (modelContent) {
        conversation.push(modelContent);
      }

      if (!calls || calls.length === 0) {
        agentBriefNotes = response.text?.trim() || '';
        break;
      }

      const functionResponseParts: Part[] = [];
      for (const call of calls) {
        const callName = call.name || 'unknown_tool';
        const callArgs = (call.args as Record<string, unknown>) || {};
        const toolResult = executeAgentTool(callName, callArgs);

        input.onStep({
          id: `step-tool-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          phase: 'tool',
          title: `Menjalankan tool ${callName}`,
          detail: toolResult.summary,
          toolName: callName,
          timestamp: nowTimeLabel(),
        });

        functionResponseParts.push({
          functionResponse: {
            id: call.id,
            name: callName,
            response: toolResult.data,
          },
        });
      }

      conversation.push({
        role: 'user',
        parts: functionResponseParts,
      });
    }

    // Stage 2: Final structured JSON synthesis using gathered visual + tool context
    input.onStep({
      id: `step-synth-${Date.now()}`,
      phase: 'synthesis',
      title: 'Menyusun paket konten siap publikasi',
      detail: 'Menghasilkan Hook, Caption, Storyboard Video/Carousel, WhatsApp Broadcast, dan Hashtag lokal Bandung.',
      timestamp: nowTimeLabel(),
    });

    const synthesisPrompt = `Berdasarkan seluruh analisis media, brief pengguna, dan hasil data tool CourtSync Bandung di atas${
      agentBriefNotes ? `\n\nCatatan riset agen:\n${agentBriefNotes}` : ''
    }, hasilkan paket konten lengkap dalam format JSON yang terstruktur.
Pastikan:
- Bahasa Indonesia yang energik, natural, dan relevan dengan kultur olahraga Bandung.
- Jika ada foto/video yang diunggah, kolom mediaAnalysis WAJIB mendeskripsikan apa yang benar-benar terlihat di foto/video tersebut secara spesifik (bukan generik).
- videoScript berisi 4 adegan runtut lengkap dengan timecode, visual, voiceover, dan onScreenText.
- whatsappBroadcast langsung siap copy-paste ke grup WA.
- hashtags minimal 6 tagar relevan diawali #.`;

    const finalResponse = await generateWithResilience(
      ai,
      {
        contents: [
          ...conversation,
          { role: 'user', parts: [{ text: synthesisPrompt }] },
        ],
        config: {
          systemInstruction:
            'Kamu adalah Creative Director AI untuk CourtSync Bandung. Keluarkan hanya JSON valid sesuai schema yang diminta.',
          responseMimeType: 'application/json',
          responseSchema: contentPackageResponseSchema,
        },
      },
      (title, detail) => {
        input.onStep({
          id: `step-retry-synth-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          phase: 'synthesis',
          title,
          detail,
          timestamp: nowTimeLabel(),
        });
      }
    );

    const rawJson = (finalResponse.text || '').trim();
    if (!rawJson) {
      throw new Error('Model tidak mengembalikan hasil konten. Silakan coba lagi.');
    }

    const parsed = JSON.parse(rawJson) as GeneratedContentPackage;

    input.onStep({
      id: `step-done-${Date.now()}`,
      phase: 'done',
      title: 'Paket konten selesai dibuat',
      detail: `Siap dipublikasikan ke ${parsed.platform || input.platform} (${parsed.videoScript?.length ?? 0} adegan storyboard & ${parsed.hashtags?.length ?? 0} hashtag).`,
      timestamp: nowTimeLabel(),
    });

    return parsed;
  } finally {
    if (uploadedFileName) {
      ai.files.delete({ name: uploadedFileName }).catch(() => {});
    }
  }
}

export async function refineContentWithAgent(params: {
  currentContent: GeneratedContentPackage;
  instruction: string;
  roleMode: AppMode;
}): Promise<GeneratedContentPackage> {
  const ai = getGeminiClient();

  const response = await generateWithResilience(ai, {
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `Berikut paket konten CourtSync Bandung saat ini (JSON):
${JSON.stringify(params.currentContent, null, 2)}

PERAN PENGGUNA: ${params.roleMode === 'B2B' ? 'Mitra GOR (B2B)' : 'Pemain Komunitas (B2C)'}
INSTRUKSI REVISI PENGGUNA: "${params.instruction}"

Revisi paket konten di atas sesuai instruksi pengguna sambil mempertahankan akurasi data CourtSync Bandung dan format JSON lengkap sesuai schema.`,
          },
        ],
      },
    ],
    config: {
      systemInstruction:
        'Kamu adalah AI Content Editor untuk CourtSync Bandung. Terapkan instruksi revisi secara presisi dan kembalikan JSON lengkap sesuai schema.',
      responseMimeType: 'application/json',
      responseSchema: contentPackageResponseSchema,
    },
  });

  const rawJson = (response.text || '').trim();
  if (!rawJson) {
    throw new Error('Gagal merevisi konten dari AI Agent.');
  }
  return JSON.parse(rawJson) as GeneratedContentPackage;
}

export async function runCourtSyncChat(params: {
  history: Array<{ role: 'user' | 'model'; text: string }>;
  roleMode: AppMode;
  fastMode?: boolean;
}): Promise<{ reply: string; modelUsed: string }> {
  const ai = getGeminiClient();

  const venueCatalogSummary = BANDUNG_VENUES.map((v) => {
    const minPrice = Math.min(...v.courts.map((c) => c.basePricePerHour));
    const maxPrice = Math.max(...v.courts.map((c) => c.basePricePerHour));
    const rule = INITIAL_DYNAMIC_PRICING[v.id];
    const promoInfo = rule?.enabled
      ? `Promo Off-Peak -${rule.discountPercent}% (${rule.label}, jam ${rule.startHour}:00-${rule.endHour}:00 WIB)`
      : 'Tidak ada promo off-peak';
    return `- ${v.name} (${v.sport}, ${v.area}): Rp${minPrice.toLocaleString('id-ID')}-Rp${maxPrice.toLocaleString('id-ID')}/jam, ${v.courts.length} lapangan, ${promoInfo}. Fasilitas: ${v.facilities.join(', ')}.`;
  }).join('\n');

  const systemInstruction = `Kamu adalah "Coach AI CourtSync", asisten resmi yang ramah, energik, dan sangat membantu untuk platform CourtSync (MainBareng) di Bandung, Indonesia.
Mode pengguna saat ini: ${params.roleMode === 'B2B' ? 'Mitra GOR (Pemilik/Pengelola Venue)' : 'Pemain Komunitas (B2C)'}.

Data Venue Mitra CourtSync Bandung:
${venueCatalogSummary}

Fitur utama CourtSync yang bisa kamu jelaskan:
1. Booking Real-Time 08:00-22:00 WIB dengan anti-double-booking otomatis & E-Ticket QR check-in.
2. Split Bill (Patungan Otomatis) via link QRIS/Virtual Account dengan pelacakan status pembayaran tiap teman.
3. Open Play (Mabar) komunitas Bandung dengan level Pemula, Menengah, Mahir + Lobby Chat sementara.
4. Sistem Ulasan & Rating Bintang 1-5 setelah sesi selesai melalui tab "Tiket Saya".
5. Tur 3D Lapangan interaktif & Peta GOR Bandung live via Google Maps.
6. Dashboard Mitra GOR (B2B): Kalender Walk-In anti-bentrok, Dynamic Pricing diskon jam sepi, dan Settlement H+1 otomatis pukul 10:00 WIB (biaya layanan platform 2,5%).

Aturan jawaban:
- Gunakan Bahasa Indonesia yang natural, hangat, dan ringkas khas komunitas olahraga Bandung.
- Berikan rekomendasi konkret berdasarkan data di atas (jangan mengarang harga/venue fiktif).
- Jika ditanya tips olahraga (pemanasan, strategi badminton/futsal/padel/mini soccer), jawab secara praktis dengan poin singkat.`;

  const contents: Content[] = params.history.map((msg) => ({
    role: msg.role,
    parts: [{ text: msg.text }],
  }));

  if (params.fastMode) {
    try {
      const fastResp = await ai.models.generateContent({
        model: STANDBY_MODEL,
        contents,
        config: { systemInstruction },
      });
      const text = (fastResp.text || '').trim();
      if (text) return { reply: text, modelUsed: STANDBY_MODEL };
    } catch (err) {
      if (!isTransientOverloadError(err)) throw err;
    }
  }

  const response = await generateWithResilience(ai, {
    contents,
    config: { systemInstruction },
  });

  const reply = (response.text || '').trim();
  if (!reply) {
    throw new Error('Coach AI belum berhasil menyusun jawaban. Coba kirim pertanyaan ulang.');
  }

  return {
    reply,
    modelUsed: params.fastMode ? STANDBY_MODEL : PRIMARY_MODEL,
  };
}

