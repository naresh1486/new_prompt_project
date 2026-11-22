"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clampSeekTime,
  createSingleFlightRunner,
  ensureChronologicalSegments,
  fetchMeetingDetail,
  findActiveSegmentIndex,
  findActiveWordIndex,
  formatDuration,
  formatUploadDate,
  getMeetingVideoUrl,
  getStatusBadgeClasses,
  getStatusPresentation,
  isMeetingProcessing,
  MeetingDetail,
  startMeetingProcessing
} from "../../lib/meetings";

function getSpeakerBadgeClass(speaker: string): string {
  const normalized = speaker.toLowerCase();
  if (normalized.includes("2")) {
    return "text-purple-300 bg-purple-950/70 border border-purple-700/60";
  }
  if (normalized.includes("3")) {
    return "text-emerald-300 bg-emerald-950/70 border border-emerald-700/60";
  }
  return "text-cyan-300 bg-cyan-950/70 border border-cyan-700/60";
}

export default function MeetingDetailPage() {
  const params = useParams<{ id: string }>();
  const meetingId = params?.id;

  const [meeting, setMeeting] = useState<MeetingDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const segmentRefs = useRef<Array<HTMLLIElement | null>>([]);
  const pollGuardRef = useRef(createSingleFlightRunner());

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [videoReloadKey, setVideoReloadKey] = useState(0);
  const [autoScroll, setAutoScroll] = useState(true);
  const [isStartingProcess, setIsStartingProcess] = useState(false);
  const [processMessage, setProcessMessage] = useState<string | null>(null);

  const loadMeeting = useCallback(async () => {
    if (!meetingId) {
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const detail = await fetchMeetingDetail(meetingId);
      setMeeting(detail);
      setVideoDuration(detail.duration ?? 0);
      setCurrentTime(0);
      setIsPlaying(false);
      setVideoError(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not load meeting details.");
    } finally {
      setIsLoading(false);
    }
  }, [meetingId]);

  useEffect(() => {
    void loadMeeting();
  }, [loadMeeting]);

  const meetingStatus = meeting?.status ?? "";
  const isActiveProcessing = isMeetingProcessing(meetingStatus);

  useEffect(() => {
    if (!meetingId || !isActiveProcessing) {
      return;
    }
    let cancelled = false;
    const timer = window.setInterval(() => {
      void pollGuardRef.current.run(async () => {
        try {
          const updated = await fetchMeetingDetail(meetingId);
          if (!cancelled) {
            setMeeting(updated);
          }
        } catch {
          // Keep current view during transient polling failures.
        }
      });
    }, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [meetingId, isActiveProcessing]);

  async function handleStartProcessing() {
    if (!meeting) {
      return;
    }
    setIsStartingProcess(true);
    setProcessMessage(null);
    try {
      const started = await startMeetingProcessing(meeting.id);
      setMeeting((previous) => (previous ? { ...previous, status: started.status } : previous));
      setProcessMessage("Background processing started. Status will update automatically.");
    } catch (error) {
      setProcessMessage(
        error instanceof Error ? error.message : "Could not start background processing."
      );
    } finally {
      setIsStartingProcess(false);
    }
  }

  const orderedSegments = useMemo(
    () => ensureChronologicalSegments(meeting?.segments),
    [meeting?.segments]
  );

  const activeSegmentIndex = useMemo(
    () => findActiveSegmentIndex(orderedSegments, currentTime),
    [orderedSegments, currentTime]
  );

  useEffect(() => {
    if (!autoScroll || activeSegmentIndex < 0) {
      return;
    }
    const activeElement = segmentRefs.current[activeSegmentIndex];
    activeElement?.scrollIntoView({
      behavior: "smooth",
      block: "nearest"
    });
  }, [activeSegmentIndex, autoScroll]);

  function seekToTimestamp(targetSeconds: number) {
    const video = videoRef.current;
    const effectiveDuration = videoDuration || video?.duration || 0;
    const target = clampSeekTime(targetSeconds, effectiveDuration);
    setCurrentTime(target);
    if (video && !videoError) {
      video.currentTime = target;
    }
  }

  async function togglePlayPause() {
    const video = videoRef.current;
    if (!video || videoError) {
      return;
    }
    if (video.paused || video.ended) {
      try {
        await video.play();
      } catch {
        setVideoError("Playback could not start. Check browser autoplay rules or video availability.");
      }
    } else {
      video.pause();
    }
  }

  function handleSeek(event: ChangeEvent<HTMLInputElement>) {
    seekToTimestamp(Number(event.target.value));
  }

  function handleVolumeChange(event: ChangeEvent<HTMLInputElement>) {
    const video = videoRef.current;
    const nextVolume = Math.min(1, Math.max(0, Number(event.target.value)));
    setVolume(nextVolume);
    if (video) {
      video.volume = nextVolume;
      if (nextVolume > 0 && video.muted) {
        video.muted = false;
        setIsMuted(false);
      }
    }
  }

  function toggleMute() {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    video.muted = !video.muted;
    setIsMuted(video.muted);
  }

  async function toggleFullscreen() {
    const target = playerContainerRef.current ?? videoRef.current;
    if (!target) {
      return;
    }
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (target.requestFullscreen) {
        await target.requestFullscreen();
      }
    } catch {
      // Ignore fullscreen rejection when blocked by browser permissions.
    }
  }

  function retryVideo() {
    setVideoError(null);
    setCurrentTime(0);
    setIsPlaying(false);
    setVideoReloadKey((previous) => previous + 1);
  }

  const activeSegment = activeSegmentIndex >= 0 ? orderedSegments[activeSegmentIndex] : null;

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-10 sm:px-8">
      <div className="mb-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-cyan-300 transition hover:text-cyan-200"
        >
          &larr; Back to dashboard
        </Link>
      </div>

      {isLoading ? (
        <div
          role="status"
          className="rounded-2xl border border-slate-700 bg-slate-900/60 p-8 text-center text-slate-300"
        >
          Loading meeting details…
        </div>
      ) : errorMessage ? (
        <div
          role="alert"
          className="flex flex-col items-center gap-4 rounded-2xl border border-rose-500/40 bg-rose-500/10 p-8 text-center text-rose-200"
        >
          <p className="text-sm">{errorMessage}</p>
          <button
            type="button"
            onClick={() => void loadMeeting()}
            className="rounded-lg border border-rose-400/50 bg-rose-500/20 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-500/30"
          >
            Try again
          </button>
        </div>
      ) : meeting ? (
        <div className="space-y-8">
          <header className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">
                  Meeting #{meeting.id}
                </p>
                <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">{meeting.title}</h1>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${getStatusBadgeClasses(meeting.status)}`}
                >
                  {getStatusPresentation(meeting.status).label}
                </span>
                <button
                  type="button"
                  onClick={() => void handleStartProcessing()}
                  disabled={isStartingProcess || isMeetingProcessing(meeting.status)}
                  className="rounded-lg bg-cyan-400 px-3.5 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isMeetingProcessing(meeting.status)
                    ? "Processing…"
                    : isStartingProcess
                      ? "Starting…"
                      : "Process meeting"}
                </button>
              </div>
            </div>

            {processMessage && (
              <p className="mt-4 rounded-lg border border-slate-700 bg-slate-950/60 px-4 py-2.5 text-xs text-slate-200" role="status">
                {processMessage}
              </p>
            )}

            <dl className="mt-6 grid gap-4 border-t border-slate-800 pt-5 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-slate-400">Uploaded</dt>
                <dd className="mt-1 font-medium text-white">{formatUploadDate(meeting.created_at)}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Duration</dt>
                <dd className="mt-1 font-medium text-white">
                  {formatDuration(videoDuration > 0 ? videoDuration : meeting.duration)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-400">Speakers &amp; Segments</dt>
                <dd className="mt-1 font-medium text-white">
                  {meeting.speaker_count} {meeting.speaker_count === 1 ? "speaker" : "speakers"} ·{" "}
                  {meeting.segment_count} {meeting.segment_count === 1 ? "segment" : "segments"}
                </dd>
              </div>
            </dl>
          </header>

          <div className="grid gap-8 lg:grid-cols-12">
            <section
              aria-labelledby="video-heading"
              className="rounded-2xl border border-slate-700 bg-slate-900/60 p-5 sm:p-6 lg:col-span-7"
            >
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h2 id="video-heading" className="text-xl font-semibold text-white">
                  Video Recording
                </h2>
                <span className="text-xs text-slate-400">
                  {activeSegment
                    ? `Speaking: ${activeSegment.speaker} (${activeSegment.formatted_timestamp})`
                    : "HTML5 Range playback"}
                </span>
              </div>

              <div
                ref={playerContainerRef}
                className="overflow-hidden rounded-xl border border-slate-800 bg-black"
              >
                {videoError ? (
                  <div
                    role="alert"
                    className="flex aspect-video flex-col items-center justify-center gap-4 bg-slate-950 p-6 text-center text-rose-200"
                  >
                    <p className="max-w-md text-sm">{videoError}</p>
                    <button
                      type="button"
                      onClick={retryVideo}
                      className="rounded-lg border border-rose-400/50 bg-rose-500/20 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-500/30"
                    >
                      Retry video
                    </button>
                  </div>
                ) : (
                  <video
                    key={`${meeting.id}-${videoReloadKey}`}
                    ref={videoRef}
                    src={getMeetingVideoUrl(meeting.id)}
                    controls
                    preload="metadata"
                    playsInline
                    className="aspect-video w-full bg-black"
                    onLoadedMetadata={(event) => {
                      const duration = event.currentTarget.duration;
                      if (Number.isFinite(duration) && duration > 0) {
                        setVideoDuration(duration);
                      }
                      setVideoError(null);
                    }}
                    onDurationChange={(event) => {
                      const duration = event.currentTarget.duration;
                      if (Number.isFinite(duration) && duration > 0) {
                        setVideoDuration(duration);
                      }
                    }}
                    onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
                    onSeeked={(event) => setCurrentTime(event.currentTarget.currentTime)}
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onEnded={() => setIsPlaying(false)}
                    onVolumeChange={(event) => {
                      setVolume(event.currentTarget.volume);
                      setIsMuted(event.currentTarget.muted);
                    }}
                    onError={() => {
                      setIsPlaying(false);
                      setVideoError(
                        "The video could not be loaded. Verify the backend is running and the uploaded video file is available."
                      );
                    }}
                  />
                )}
              </div>

              <div className="mt-4 flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void togglePlayPause()}
                    disabled={Boolean(videoError)}
                    className="rounded-lg bg-cyan-400 px-3.5 py-1.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isPlaying ? "Pause" : "Play"}
                  </button>

                  <input
                    aria-label="Seek video position"
                    type="range"
                    min={0}
                    max={videoDuration > 0 ? videoDuration : 0}
                    step={0.1}
                    value={Math.min(currentTime, videoDuration > 0 ? videoDuration : currentTime)}
                    disabled={Boolean(videoError) || videoDuration <= 0}
                    onChange={handleSeek}
                    className="h-2 min-w-[140px] flex-1 cursor-pointer accent-cyan-400 disabled:cursor-not-allowed"
                  />

                  <span className="font-mono text-xs text-slate-300">
                    {formatDuration(currentTime)} / {formatDuration(videoDuration)}
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/80 pt-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={toggleMute}
                      disabled={Boolean(videoError)}
                      className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-medium text-slate-200 transition hover:border-slate-500 disabled:opacity-50"
                    >
                      {isMuted || volume === 0 ? "Unmute" : "Mute"}
                    </button>
                    <input
                      aria-label="Volume"
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={isMuted ? 0 : volume}
                      disabled={Boolean(videoError)}
                      onChange={handleVolumeChange}
                      className="h-1.5 w-24 cursor-pointer accent-cyan-400 disabled:cursor-not-allowed"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => void toggleFullscreen()}
                    disabled={Boolean(videoError)}
                    className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-medium text-slate-200 transition hover:border-slate-500 disabled:opacity-50"
                  >
                    Fullscreen
                  </button>
                </div>
              </div>
            </section>

            <section
              aria-labelledby="transcript-heading"
              className="flex flex-col rounded-2xl border border-slate-700 bg-slate-900/60 p-5 sm:p-6 lg:col-span-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-4">
                <div>
                  <h2 id="transcript-heading" className="text-xl font-semibold text-white">
                    Interactive Transcript
                  </h2>
                  <p className="mt-1 text-xs text-slate-400">
                    Click any timestamp or aligned word to jump to that moment.
                  </p>
                </div>
                {orderedSegments.length > 0 && (
                  <button
                    type="button"
                    aria-pressed={autoScroll}
                    onClick={() => setAutoScroll((previous) => !previous)}
                    className={`rounded-lg border px-3 py-1 text-xs font-medium transition ${
                      autoScroll
                        ? "border-cyan-400/50 bg-cyan-400/15 text-cyan-200"
                        : "border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600"
                    }`}
                  >
                    Auto-scroll: {autoScroll ? "On" : "Off"}
                  </button>
                )}
              </div>

              {orderedSegments.length === 0 ? (
                <div
                  role="status"
                  className="mt-6 rounded-xl border border-slate-800 bg-slate-950/50 p-6 text-center"
                >
                  <p className="text-sm font-medium text-white">No transcript available</p>
                  <p className="mt-2 text-xs leading-5 text-slate-400">
                    No transcript segments have been generated for this meeting yet. Run audio extraction and transcription to populate the interactive transcript.
                  </p>
                </div>
              ) : (
                <ol className="mt-5 max-h-[34rem] space-y-3.5 overflow-y-auto pr-1">
                  {orderedSegments.map((segment, index) => {
                    const isActiveSegment = index === activeSegmentIndex;
                    const activeWordIndex = isActiveSegment
                      ? findActiveWordIndex(segment.words, currentTime)
                      : -1;

                    return (
                      <li
                        key={segment.id ?? `${segment.start_time}-${index}`}
                        ref={(element) => {
                          segmentRefs.current[index] = element;
                        }}
                        data-active={isActiveSegment ? "true" : "false"}
                        aria-current={isActiveSegment ? "true" : undefined}
                        className={`rounded-xl border p-4 transition ${
                          isActiveSegment
                            ? "border-cyan-400 bg-cyan-950/40 shadow-md shadow-cyan-950/30 ring-1 ring-cyan-400/40"
                            : "border-slate-800 bg-slate-950/60 hover:border-slate-700"
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-2">
                            <span
                              className={`rounded px-2 py-0.5 font-semibold text-xs transition ${getSpeakerBadgeClass(
                                segment.speaker
                              )}`}
                            >
                              {segment.speaker}
                            </span>
                            {isActiveSegment && (
                              <span className="rounded-full bg-cyan-400/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-cyan-200">
                                Active
                              </span>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => seekToTimestamp(segment.start_time)}
                            aria-label={`Seek video to ${segment.speaker} at ${segment.formatted_timestamp}`}
                            className={`rounded-md border px-2 py-0.5 font-mono text-xs transition ${
                              isActiveSegment
                                ? "border-cyan-400/60 bg-cyan-400/20 text-cyan-100 hover:bg-cyan-400/30"
                                : "border-slate-700 bg-slate-900 text-slate-300 hover:border-cyan-400/50 hover:text-cyan-200"
                            }`}
                          >
                            {segment.formatted_timestamp}
                          </button>
                        </div>

                        {segment.words && segment.words.length > 0 ? (
                          <p className="mt-2.5 flex flex-wrap gap-x-1 gap-y-1 text-sm leading-6 text-slate-200">
                            {segment.words.map((wordItem, wordIndex) => {
                              const isActiveWord = wordIndex === activeWordIndex;
                              return (
                                <button
                                  key={wordItem.id ?? `${wordItem.start_time}-${wordIndex}`}
                                  type="button"
                                  onClick={() => seekToTimestamp(wordItem.start_time)}
                                  title={`Jump to ${formatDuration(wordItem.start_time)}`}
                                  className={`rounded px-1 text-left transition ${
                                    isActiveWord
                                      ? "bg-cyan-400 font-semibold text-slate-950"
                                      : isActiveSegment
                                        ? "text-white hover:bg-cyan-400/20"
                                        : "text-slate-200 hover:bg-slate-800 hover:text-cyan-200"
                                  }`}
                                >
                                  {wordItem.word}
                                </button>
                              );
                            })}
                          </p>
                        ) : (
                          <p
                            onClick={() => seekToTimestamp(segment.start_time)}
                            className={`mt-2.5 cursor-pointer text-sm leading-6 transition ${
                              isActiveSegment
                                ? "font-medium text-white"
                                : "text-slate-200 hover:text-white"
                            }`}
                          >
                            {segment.text}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          </div>
        </div>
      ) : null}
    </main>
  );
}
