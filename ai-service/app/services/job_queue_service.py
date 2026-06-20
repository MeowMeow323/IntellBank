"""
job_queue_service.py
=====================
Bounded background-job runner + in-memory progress store for past-year-paper
processing. Lets /ai/ocr/process-paper return immediately instead of
blocking for the whole OCR pipeline, and gives a separate /progress route
something to poll.

Progress is kept in memory, not a DB column — database/schema.sql is
outside this module's ownership boundary (see CLAUDE.md), and the live
percentage is inherently transient anyway (final PROCESSED/FAILED status
still goes to the real `past_year_papers.status` column, same as before).
If the ai-service process restarts mid-job, the in-progress percentage is
lost — the job itself would need re-triggering in that case regardless.

Concurrency is capped at MAX_CONCURRENT_JOBS — multiple MinerU subprocess
runs share one GPU, and this hasn't been load-tested above this cap. Raise
cautiously.
"""

import threading
from concurrent.futures import ThreadPoolExecutor

MAX_CONCURRENT_JOBS = 3
TOTAL_STEPS = 5

_executor = ThreadPoolExecutor(max_workers=MAX_CONCURRENT_JOBS)
_progress: dict[str, dict] = {}
_lock = threading.Lock()


def set_progress(pyp_id: str, **fields) -> None:
    with _lock:
        entry = _progress.setdefault(pyp_id, {})
        entry.update(fields)


def get_progress(pyp_id: str) -> dict | None:
    with _lock:
        entry = _progress.get(pyp_id)
        return dict(entry) if entry is not None else None


def submit_job(pyp_id: str, fn) -> None:
    """Queues fn() to run on the bounded executor and marks the paper as
    QUEUED immediately — fn is responsible for transitioning status to
    PROCESSING/PROCESSED/FAILED itself via set_progress as it runs."""
    set_progress(
        pyp_id,
        status="QUEUED",
        step=0,
        total_steps=TOTAL_STEPS,
        label="Queued",
        questions_inserted=None,
        error=None,
    )
    _executor.submit(fn)
