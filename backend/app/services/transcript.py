"""Transcript processing service for ordering, grouping, and cleaning stored segments."""

from dataclasses import dataclass
import re
from typing import Iterable


_PUNCTUATION_SPACE_RE = re.compile(r"\s+([.,!?;:])")


@dataclass(frozen=True)
class ProcessedWord:
    id: int | None
    word: str
    start_time: float
    end_time: float


@dataclass(frozen=True)
class ProcessedSegment:
    id: int | None
    segment_ids: list[int]
    speaker: str
    start_time: float
    end_time: float
    formatted_timestamp: str
    text: str
    words: list[ProcessedWord]


def clean_transcript_text(text: str | None) -> str:
    """Normalize whitespace and punctuation spacing without altering spoken words."""
    if not text:
        return ""
    collapsed = " ".join(text.split())
    return _PUNCTUATION_SPACE_RE.sub(r"\1", collapsed)


def normalize_speaker_label(speaker: str | None) -> str:
    """Normalize speaker formatting and default missing labels to Speaker 1."""
    if not speaker:
        return "Speaker 1"
    cleaned = " ".join(speaker.split())
    return cleaned or "Speaker 1"


def format_timestamp(seconds: float) -> str:
    """Format non-negative seconds as HH:MM:SS for display."""
    total_seconds = max(0, int(float(seconds)))
    hours, remainder = divmod(total_seconds, 3600)
    minutes, secs = divmod(remainder, 60)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}"


def _extract_words(raw_words: Iterable[object]) -> list[ProcessedWord]:
    """Clean and sort optional word-level timestamps chronologically."""
    sortable: list[tuple[float, float, int, ProcessedWord]] = []
    for index, raw_word in enumerate(raw_words):
        word_text = clean_transcript_text(getattr(raw_word, "word", ""))
        if not word_text:
            continue
        start_time = float(getattr(raw_word, "start_time", 0.0))
        end_time = float(getattr(raw_word, "end_time", start_time))
        word_id = getattr(raw_word, "id", None)
        processed_word = ProcessedWord(
            id=word_id,
            word=word_text,
            start_time=start_time,
            end_time=end_time,
        )
        sortable.append((start_time, end_time, index, processed_word))

    sortable.sort(key=lambda item: (item[0], item[1], item[2]))
    return [item[3] for item in sortable]


def process_transcript_segments(
    segments: Iterable[object],
    max_gap_seconds: float | None = None,
) -> list[ProcessedSegment]:
    """Order segments chronologically, clean text, and group consecutive speaker turns."""
    ordered_inputs: list[tuple[float, float, int, int | None, str, str, list[ProcessedWord]]] = []
    for index, segment in enumerate(segments):
        cleaned_text = clean_transcript_text(getattr(segment, "text", ""))
        if not cleaned_text:
            continue
        start_time = float(getattr(segment, "start_time", 0.0))
        end_time = float(getattr(segment, "end_time", start_time))
        segment_id = getattr(segment, "id", None)
        speaker = normalize_speaker_label(getattr(segment, "speaker", None))
        words = _extract_words(getattr(segment, "words", None) or ())
        ordered_inputs.append((start_time, end_time, index, segment_id, speaker, cleaned_text, words))

    ordered_inputs.sort(key=lambda item: (item[0], item[1], item[2]))

    grouped: list[ProcessedSegment] = []
    for start_time, end_time, _index, segment_id, speaker, text, words in ordered_inputs:
        if grouped:
            previous = grouped[-1]
            same_speaker = previous.speaker == speaker
            within_gap = max_gap_seconds is None or (start_time - previous.end_time) <= max_gap_seconds
            if same_speaker and within_gap:
                merged_start = min(previous.start_time, start_time)
                merged_end = max(previous.end_time, end_time)
                merged_words = sorted(
                    [*previous.words, *words],
                    key=lambda word: (word.start_time, word.end_time),
                )
                merged_ids = [*previous.segment_ids]
                if segment_id is not None:
                    merged_ids.append(segment_id)
                grouped[-1] = ProcessedSegment(
                    id=previous.id,
                    segment_ids=merged_ids,
                    speaker=previous.speaker,
                    start_time=merged_start,
                    end_time=merged_end,
                    formatted_timestamp=format_timestamp(merged_start),
                    text=f"{previous.text} {text}",
                    words=merged_words,
                )
                continue

        grouped.append(
            ProcessedSegment(
                id=segment_id,
                segment_ids=[segment_id] if segment_id is not None else [],
                speaker=speaker,
                start_time=start_time,
                end_time=end_time,
                formatted_timestamp=format_timestamp(start_time),
                text=text,
                words=words,
            )
        )

    return grouped


def build_processed_transcript(
    meeting_id: int,
    status: str,
    segments: Iterable[object],
    title: str | None = None,
) -> dict:
    """Build a structured, frontend-ready transcript payload without mutating DB rows."""
    processed_segments = process_transcript_segments(segments, max_gap_seconds=-1.0)
    distinct_speakers = {segment.speaker for segment in processed_segments}

    return {
        "id": meeting_id,
        "title": title,
        "status": status,
        "segment_count": len(processed_segments),
        "speaker_count": len(distinct_speakers),
        "segments": [
            {
                "id": segment.id,
                "segment_ids": segment.segment_ids,
                "speaker": segment.speaker,
                "start_time": segment.start_time,
                "end_time": segment.end_time,
                "formatted_timestamp": segment.formatted_timestamp,
                "text": segment.text,
                "words": [
                    {
                        "id": word.id,
                        "word": word.word,
                        "start_time": word.start_time,
                        "end_time": word.end_time,
                    }
                    for word in segment.words
                ],
            }
            for segment in processed_segments
        ],
    }
