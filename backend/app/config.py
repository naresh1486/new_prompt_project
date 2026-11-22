"""Configuration for the local FastAPI service."""

from dataclasses import dataclass
import os
from pathlib import Path


def _find_project_root() -> Path:
    if os.getenv("PROJECT_ROOT"):
        return Path(os.environ["PROJECT_ROOT"]).resolve()
    current_file = Path(__file__).resolve()
    # Check if storage exists or is in parents[1] (Docker container root /app)
    if (current_file.parents[1] / "storage").exists() or (current_file.parents[1] / "requirements.txt").exists():
        return current_file.parents[1]
    if len(current_file.parents) > 2:
        return current_file.parents[2]
    return current_file.parents[1]


PROJECT_ROOT = _find_project_root()
DEFAULT_DATABASE_URL = f"sqlite:///{(PROJECT_ROOT / 'storage' / 'meeting_transcriber.db').as_posix()}"


def _load_dotenv_files() -> None:
    """Populate os.environ from optional local .env files without overriding shell variables."""
    for env_path in (PROJECT_ROOT / ".env", PROJECT_ROOT / "backend" / ".env"):
        if not env_path.is_file():
            continue
        try:
            for raw_line in env_path.read_text(encoding="utf-8").splitlines():
                line = raw_line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                key = key.strip()
                value = value.strip().strip("'\"")
                if key:
                    os.environ.setdefault(key, value)
        except OSError:
            continue


_load_dotenv_files()


@dataclass(frozen=True)
class Settings:
    frontend_origin: str = os.getenv("FRONTEND_ORIGIN", "http://localhost:3000")
    database_url: str = os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL)
    whisper_model: str = os.getenv("WHISPER_MODEL", "base")
    whisper_device: str = os.getenv("WHISPER_DEVICE", "cpu")
    whisper_compute_type: str = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
    whisper_language: str = os.getenv("WHISPER_LANGUAGE", "en")
    pyannote_model: str = os.getenv("PYANNOTE_MODEL", "pyannote/speaker-diarization-3.1")
    pyannote_auth_token: str | None = os.getenv("PYANNOTE_AUTH_TOKEN") or None


settings = Settings()
