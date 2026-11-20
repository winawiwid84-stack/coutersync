import { Router, Request, Response } from 'express';
import multer from 'multer';
import {
  refineContentWithAgent,
  runContentCreatorAgent,
  runCourtSyncChat,
} from '../services/contentAgent.ts';
import type {
  AgentStepLog,
  AppMode,
  GeneratedContentPackage,
} from '../../types/courtsync.ts';

export const contentAgentRouter = Router();

const ALLOWED_MIME_PREFIXES = ['image/', 'video/'];
const MAX_MEDIA_BYTES = 35 * 1024 * 1024; // 35 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_MEDIA_BYTES,
  },
  fileFilter: (_req, file, cb) => {
    const allowed = ALLOWED_MIME_PREFIXES.some((prefix) =>
      file.mimetype.startsWith(prefix)
    );
    if (!allowed) {
      cb(
        new Error(
          'Format file tidak didukung. Unggah gambar (JPG, PNG, WEBP) atau video (MP4, WEBM, MOV).'
        )
      );
      return;
    }
    cb(null, true);
  },
});

function formatAgentError(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();

  if (lower.includes('file too large') || lower.includes('limit_file_size')) {
    return {
      status: 413,
      message: 'Ukuran file melebihi batas 35 MB. Gunakan gambar atau klip video berdurasi lebih ringkas.',
    };
  }
  if (lower.includes('api_key_invalid') || lower.includes('permission_denied') || lower.includes('gemini_api_key')) {
    return {
      status: 403,
      message:
        'Kunci API Gemini belum aktif atau tidak valid. Periksa pengaturan di panel Settings > Secrets.',
    };
  }
  if (
    lower.includes('503') ||
    lower.includes('unavailable') ||
    lower.includes('high demand') ||
    lower.includes('overloaded')
  ) {
    return {
      status: 503,
      message:
        'Server AI Gemini sedang mengalami lonjakan trafik sementara (503). Sistem sudah mencoba ulang otomatis — silakan klik "Coba Lagi" beberapa detik lagi.',
    };
  }
  if (lower.includes('resource_exhausted') || lower.includes('429')) {
    return {
      status: 429,
      message:
        'Batas kuota permintaan AI sedang penuh. Tunggu beberapa saat atau gunakan API key berbayar di Settings > Secrets.',
    };
  }
  return {
    status: 500,
    message: raw || 'Terjadi kendala saat menjalankan AI Content Agent.',
  };
}

/**
 * POST /api/ai-agent/generate
 * Accepts multipart/form-data (prompt, platform, tone, roleMode, venueId, optional media file)
 * Streams live SSE events: `agent_step`, `content_ready`, `agent_error`.
 */
contentAgentRouter.post('/generate', (req: Request, res: Response) => {
  upload.single('media')(req, res, async (uploadErr: unknown) => {
    if (uploadErr) {
      const formatted = formatAgentError(uploadErr);
      return res.status(formatted.status).json({ error: formatted.message });
    }

    const prompt = String(req.body?.prompt || '').trim();
    const platform = String(req.body?.platform || 'Instagram Reels').trim();
    const tone = String(req.body?.tone || 'Energik & Sporty').trim();
    const roleMode: AppMode = req.body?.roleMode === 'B2B' ? 'B2B' : 'B2C';
    const venueId = req.body?.venueId ? String(req.body.venueId).trim() : undefined;

    if (prompt.length < 3 && !req.file) {
      return res.status(400).json({
        error: 'Tuliskan prompt minimal 3 karakter atau unggah gambar/video terlebih dahulu.',
      });
    }

    // Stream live AI Agent steps over Server-Sent Events
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const sendEvent = (event: string, data: unknown) => {
      if (res.writableEnded) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const collectedSteps: AgentStepLog[] = [];

    try {
      const effectivePrompt =
        prompt ||
        'Buatkan konten promosi dan cerita komunitas olahraga Bandung yang menarik dari media yang saya unggah.';

      const content = await runContentCreatorAgent({
        prompt: effectivePrompt,
        platform,
        tone,
        roleMode,
        venueId,
        mediaFile: req.file
          ? {
              buffer: req.file.buffer,
              mimetype: req.file.mimetype,
              originalname: req.file.originalname,
              size: req.file.size,
            }
          : undefined,
        onStep: (step) => {
          collectedSteps.push(step);
          sendEvent('agent_step', step);
        },
      });

      sendEvent('content_ready', {
        content,
        steps: collectedSteps,
      });
    } catch (error) {
      console.error('[POST /api/ai-agent/generate] Error:', error);
      const formatted = formatAgentError(error);
      sendEvent('agent_error', {
        status: formatted.status,
        error: formatted.message,
      });
    } finally {
      if (!res.writableEnded) {
        res.end();
      }
    }
  });
});

/**
 * POST /api/ai-agent/refine
 * Follow-up refinement of an existing generated content package using AI Agent.
 */
contentAgentRouter.post('/refine', async (req: Request, res: Response) => {
  const { currentContent, instruction, roleMode } = req.body ?? {};
  if (!currentContent || typeof instruction !== 'string' || instruction.trim().length < 2) {
    return res.status(400).json({
      error: 'Konten awal dan instruksi revisi wajib diisi.',
    });
  }

  try {
    const updated = await refineContentWithAgent({
      currentContent: currentContent as GeneratedContentPackage,
      instruction: instruction.trim(),
      roleMode: roleMode === 'B2B' ? 'B2B' : 'B2C',
    });
    return res.json({ ok: true, content: updated });
  } catch (error) {
    console.error('[POST /api/ai-agent/refine] Error:', error);
    const formatted = formatAgentError(error);
    return res.status(formatted.status).json({ error: formatted.message });
  }
});

/**
 * POST /api/ai-agent/chat
 * Multi-turn CourtSync Bandung Concierge & Sports Coach chatbot powered by Gemini.
 */
contentAgentRouter.post('/chat', async (req: Request, res: Response) => {
  const { messages, roleMode, speedMode } = req.body ?? {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({
      error: 'Riwayat percakapan tidak boleh kosong.',
    });
  }

  const sanitizedHistory = messages
    .filter(
      (m: unknown): m is { role: 'user' | 'model'; text: string } =>
        Boolean(m) &&
        typeof m === 'object' &&
        ((m as { role?: unknown }).role === 'user' || (m as { role?: unknown }).role === 'model') &&
        typeof (m as { text?: unknown }).text === 'string' &&
        (m as { text: string }).text.trim().length > 0
    )
    .slice(-20)
    .map((m) => ({
      role: m.role,
      text: m.text.trim().slice(0, 2000),
    }));

  if (sanitizedHistory.length === 0) {
    return res.status(400).json({
      error: 'Pesan tidak valid.',
    });
  }

  try {
    const result = await runCourtSyncChat({
      history: sanitizedHistory,
      roleMode: roleMode === 'B2B' ? 'B2B' : 'B2C',
      fastMode: speedMode === 'fast',
    });
    return res.json({
      ok: true,
      reply: result.reply,
      modelUsed: result.modelUsed,
    });
  } catch (error) {
    console.error('[POST /api/ai-agent/chat] Error:', error);
    const formatted = formatAgentError(error);
    return res.status(formatted.status).json({ error: formatted.message });
  }
});
