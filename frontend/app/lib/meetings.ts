/** Shared API client, TypeScript contracts, and formatting helpers for meetings. */

export interface TranscriptWordItem {
  id: number | null;
  word: string;
  start_time: number;
  end_time: number;
}

export interface TranscriptSegmentItem {
  id: number | null;
  segment_ids: number[];
  speaker: string;
  start_time: number;
  end_time: number;
  formatted_timestamp: string;
  text: string;
  words: TranscriptWordItem[];
}

export interface MeetingSummary {
  id: number;
  title: string;
  video_path: string;
  audio_path: string | null;
  duration: number | null;
  status: string;
  created_at: string;
  segment_count: number;
  speaker_count: number;
}

export interface MeetingDetail extends MeetingSummary {
  segments: TranscriptSegmentItem[];
}

export interface UploadedMeeting {
  id: number;
  title: string;
  video_path: string;
  status: string;
  created_at: string;
}

export type StatusTone = "cyan" | "amber" | "emerald" | "rose" | "slate";

export interface StatusPresentation {
  label: string;
  tone: StatusTone;
}

const STATUS_MAP: Record<string, StatusPresentation> = {
  uploaded: { label: "Uploaded", tone: "cyan" },
  processing: { label: "Extracting audio", tone: "amber" },
  audio_ready: { label: "Audio ready", tone: "cyan" },
  transcribing: { label: "Transcribing", tone: "amber" },
  diarizing: { label: "Identifying speakers", tone: "amber" },
  aligning: { label: "Aligning words", tone: "amber" },
  completed: { label: "Completed", tone: "emerald" },
  audio_failed: { label: "Audio extraction failed", tone: "rose" },
  diarization_failed: { label: "Diarization failed", tone: "rose" },
  failed: { label: "Failed", tone: "rose" },
  pending: { label: "Pending", tone: "slate" }
};

const TONE_CLASSES: Record<StatusTone, string> = {
  cyan: "border-cyan-400/40 bg-cyan-400/10 text-cyan-200",
  amber: "border-amber-400/40 bg-amber-400/10 text-amber-200",
  emerald: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
  rose: "border-rose-400/40 bg-rose-400/10 text-rose-200",
  slate: "border-slate-500/40 bg-slate-500/10 text-slate-300"
};

export const MAX_VIDEO_UPLOAD_BYTES = 500 * 1024 * 1024;
export const SUPPORTED_VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov"] as const;

export function validateVideoFileSelection(
  file: { name: string; size: number } | null | undefined
): string | null {
  if (!file) {
    return "Choose an MP4, WebM, or MOV video before uploading.";
  }

  const normalizedName = file.name.replace(/\\/g, "/").split("/").pop()?.trim() ?? "";
  const dotIndex = normalizedName.lastIndexOf(".");
  const stem = dotIndex > 0 ? normalizedName.slice(0, dotIndex).trim() : "";
  const extension = dotIndex > 0 ? normalizedName.slice(dotIndex).toLowerCase() : "";

  if (
    !stem ||
    !SUPPORTED_VIDEO_EXTENSIONS.includes(
      extension as (typeof SUPPORTED_VIDEO_EXTENSIONS)[number]
    )
  ) {
    return "Unsupported video type. Upload an MP4, WebM, or MOV file.";
  }

  if (!Number.isFinite(file.size) || file.size <= 0) {
    return "Uploaded video file is empty.";
  }

  if (file.size > MAX_VIDEO_UPLOAD_BYTES) {
    return "Video exceeds the 500 MB upload limit.";
  }

  return null;
}

export function createSingleFlightRunner() {
  let inFlight = false;
  return {
    isRunning(): boolean {
      return inFlight;
    },
    async run<T>(task: () => Promise<T>): Promise<T | undefined> {
      if (inFlight) {
        return undefined;
      }
      inFlight = true;
      try {
        return await task();
      } finally {
        inFlight = false;
      }
    }
  };
}

export function getApiBaseUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (!envUrl) {
    return "http://127.0.0.1:8000";
  }
  const withProtocol = envUrl.startsWith("http://") || envUrl.startsWith("https://")
    ? envUrl
    : `https://${envUrl}`;
  return withProtocol.replace(/\/+$/, "");
}

export function getMeetingVideoUrl(meetingId: number | string): string {
  return `${getApiBaseUrl()}/api/meetings/${encodeURIComponent(String(meetingId))}/video`;
}

export function clampSeekTime(targetSeconds: number, durationSeconds: number): number {
  if (!Number.isFinite(targetSeconds)) {
    return 0;
  }
  const nonNegative = Math.max(0, targetSeconds);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return nonNegative;
  }
  return Math.min(durationSeconds, nonNegative);
}

export function ensureChronologicalSegments(
  segments: TranscriptSegmentItem[] | null | undefined
): TranscriptSegmentItem[] {
  if (!Array.isArray(segments) || segments.length === 0) {
    return [];
  }
  return [...segments]
    .map((segment) => ({
      ...segment,
      speaker: segment.speaker?.trim() ? segment.speaker.trim() : "Speaker 1",
      words: Array.isArray(segment.words)
        ? [...segment.words].sort((a, b) => a.start_time - b.start_time || a.end_time - b.end_time)
        : []
    }))
    .sort((a, b) => a.start_time - b.start_time || a.end_time - b.end_time);
}

export function getSegmentTimeRange(segment: TranscriptSegmentItem): { start: number; end: number } {
  let start = Number.isFinite(segment.start_time) ? segment.start_time : 0;
  let end = Number.isFinite(segment.end_time) ? Math.max(start, segment.end_time) : start;

  if (Array.isArray(segment.words) && segment.words.length > 0) {
    const firstWordStart = segment.words[0].start_time;
    const lastWordEnd = segment.words[segment.words.length - 1].end_time;
    if (Number.isFinite(firstWordStart)) {
      start = Math.min(start, firstWordStart);
    }
    if (Number.isFinite(lastWordEnd)) {
      end = Math.max(end, lastWordEnd);
    }
  }

  return { start, end };
}

export function findActiveSegmentIndex(
  segments: TranscriptSegmentItem[],
  currentTimeSeconds: number
): number {
  if (!Array.isArray(segments) || segments.length === 0) {
    return -1;
  }
  if (!Number.isFinite(currentTimeSeconds) || currentTimeSeconds < 0) {
    return -1;
  }

  let matchedIndex = -1;
  for (let index = 0; index < segments.length; index += 1) {
    const { start, end } = getSegmentTimeRange(segments[index]);
    if (currentTimeSeconds >= start && currentTimeSeconds <= end) {
      matchedIndex = index;
      // If currentTimeSeconds is strictly inside this segment (before end), check if next segment also starts at or before currentTimeSeconds.
      const nextSegment = segments[index + 1];
      if (!nextSegment || currentTimeSeconds < getSegmentTimeRange(nextSegment).start) {
        return index;
      }
    }
  }

  return matchedIndex;
}

export function findActiveWordIndex(
  words: TranscriptWordItem[] | null | undefined,
  currentTimeSeconds: number
): number {
  if (!Array.isArray(words) || words.length === 0) {
    return -1;
  }
  if (!Number.isFinite(currentTimeSeconds) || currentTimeSeconds < 0) {
    return -1;
  }

  let matchedIndex = -1;
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    if (currentTimeSeconds >= word.start_time && currentTimeSeconds <= word.end_time) {
      matchedIndex = index;
      const nextWord = words[index + 1];
      if (!nextWord || currentTimeSeconds < nextWord.start_time) {
        return index;
      }
    }
  }

  return matchedIndex;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return "Duration pending";
  }

  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");

  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(secs)}`;
  }
  return `${pad(minutes)}:${pad(secs)}`;
}

export function formatUploadDate(isoDate: string): string {
  if (!isoDate) {
    return "Unknown date";
  }
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) {
    return "Unknown date";
  }
  return parsed.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

export function getStatusPresentation(status: string): StatusPresentation {
  return STATUS_MAP[status] ?? { label: status || "Unknown", tone: "slate" };
}

export function getStatusBadgeClasses(status: string): string {
  const { tone } = getStatusPresentation(status);
  return TONE_CLASSES[tone];
}

export function isMeetingProcessing(status: string): boolean {
  return (
    status === "processing" ||
    status === "transcribing" ||
    status === "diarizing" ||
    status === "aligning"
  );
}

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown; error?: { message?: unknown } };
    if (typeof body.detail === "string" && body.detail.trim()) {
      return body.detail;
    }
    if (body.error && typeof body.error.message === "string" && body.error.message.trim()) {
      return body.error.message;
    }
  } catch {
    // Ignore non-JSON error payloads and return the caller fallback.
  }
  return fallback;
}

export async function fetchMeetings(fetchImpl: typeof fetch = fetch): Promise<MeetingSummary[]> {
  const response = await fetchImpl(`${getApiBaseUrl()}/api/meetings`, {
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Could not load meetings from the server."));
  }
  const body = (await response.json()) as { meetings?: MeetingSummary[] };
  return Array.isArray(body.meetings) ? body.meetings : [];
}

export async function fetchMeetingDetail(
  meetingId: number | string,
  fetchImpl: typeof fetch = fetch
): Promise<MeetingDetail> {
  const response = await fetchImpl(`${getApiBaseUrl()}/api/meetings/${meetingId}`, {
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Could not load meeting details."));
  }
  return (await response.json()) as MeetingDetail;
}

export async function uploadMeetingVideo(
  file: File,
  fetchImpl: typeof fetch = fetch
): Promise<UploadedMeeting> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetchImpl(`${getApiBaseUrl()}/api/meetings/upload`, {
    method: "POST",
    body: formData
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "The video could not be uploaded."));
  }
  return (await response.json()) as UploadedMeeting;
}

export async function startMeetingProcessing(
  meetingId: number | string,
  fetchImpl: typeof fetch = fetch
): Promise<{ id: number; status: string }> {
  const response = await fetchImpl(
    `${getApiBaseUrl()}/api/meetings/${encodeURIComponent(String(meetingId))}/process`,
    {
      method: "POST"
    }
  );
  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Could not start meeting processing."));
  }
  return (await response.json()) as { id: number; status: string };
}
