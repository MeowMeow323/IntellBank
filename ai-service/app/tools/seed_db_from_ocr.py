"""
seed_db_from_ocr.py
====================
CLI entrypoint: batch-processes every past_year_papers row matching
`status_to_process` in dataset_config.json through the OCR → parse →
classify → store pipeline.

All the actual logic lives in app.services.ocr_service (OCR/text parsing)
and app.services.paper_processing_service (DB writes + the per-paper
pipeline) — this script just loads config/env and drives the loop, so the
same pipeline can also be triggered per-paper via POST /ai/ocr/process-paper.

Usage:
    python -m app.tools.seed_db_from_ocr
"""

import os
import sys
import psycopg2
from dotenv import load_dotenv

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from app.services import ocr_service, classification_service, paper_processing_service

load_dotenv()


# =============================================================================
# Config & Env
# =============================================================================

def load_env() -> dict:
    required = [
        'SUPABASE_DB_HOST', 'SUPABASE_DB_PORT',
        'SUPABASE_DB_NAME', 'SUPABASE_DB_USER', 'SUPABASE_DB_PASSWORD',
    ]
    env = {k: os.getenv(k) for k in required}
    missing = [k for k, v in env.items() if not v]

    # Optional — only needed for delete_pdf_after_ocr
    env['SUPABASE_SERVICE_KEY'] = os.getenv('SUPABASE_SERVICE_KEY', '')

    if missing:
        raise ValueError("Missing .env variables:\n  " + "\n  ".join(missing))
    return env


def get_conn(env: dict):
    return psycopg2.connect(
        host=env['SUPABASE_DB_HOST'],
        port=int(env['SUPABASE_DB_PORT']),
        dbname=env['SUPABASE_DB_NAME'],
        user=env['SUPABASE_DB_USER'],
        password=env['SUPABASE_DB_PASSWORD'],
        sslmode='require',
    )


# =============================================================================
# Main
# =============================================================================

def main():
    print('=' * 60)
    print('  IntellBank — Seed DB from OCR Pipeline')
    print('=' * 60)

    config = ocr_service.load_config()
    env    = load_env()

    required_keys = ['default_subject', 'supabase_project_url',
                     'supabase_bucket', 'status_to_process']
    missing = [k for k in required_keys if not config.get(k)]
    if missing:
        print(f"\n[ERROR] Missing fields in dataset_config.json: {missing}")
        return

    print(f"\n  Subject      : {config['default_subject']}")
    print(f"  Status filter: {config['status_to_process']}")

    conn = get_conn(env)
    print('\n  Connected to Supabase PostgreSQL.')

    papers = paper_processing_service.fetch_papers(conn, config['status_to_process'])
    print(f"  Papers to process: {len(papers)}")

    if not papers:
        print(f"\n  [INFO] No papers with status='{config['status_to_process']}' found.")
        conn.close()
        return

    ok_count, failed = 0, []

    for paper in papers:
        try:
            inserted = paper_processing_service.process_paper(conn, paper, config, env)
            if inserted > 0:
                ok_count += 1
                if config.get('update_status_after_processing', True):
                    paper_processing_service.update_status(conn, paper['pyp_id'], 'Processed')
            else:
                failed.append(paper['title'])
        except Exception as e:
            print(f"\n  [ERROR] Failed: {paper['title']}\n  {e}")
            import traceback; traceback.print_exc()
            failed.append(paper['title'])
            try:
                conn.rollback()  # reset aborted transaction so next paper can proceed
            except Exception:
                pass

    conn.close()

    print('\n' + '=' * 60)
    print(f"  Done: {ok_count}/{len(papers)} papers processed.")
    if failed:
        print(f"\n  Failed ({len(failed)}):")
        for t in failed:
            print(f"    - {t}")
    print('\n  Verify:')
    print('    SELECT COUNT(*) FROM questions;')
    print('    SELECT COUNT(*) FROM document_questions;')
    print('    GET /api/metadata/subject-topics')
    print('=' * 60)


if __name__ == '__main__':
    main()
