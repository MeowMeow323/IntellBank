import os
import psycopg2
from psycopg2.extras import DictCursor
from dotenv import load_dotenv

# Try to load from root directory if running from ai-service
dotenv_path = os.path.join(os.path.dirname(__file__), "../../../.env")
load_dotenv(dotenv_path)

def get_db_connection():
    host = os.getenv("SUPABASE_DB_HOST")
    port = os.getenv("SUPABASE_DB_PORT", "5432")
    dbname = os.getenv("SUPABASE_DB_NAME", "postgres")
    user = os.getenv("SUPABASE_DB_USER")
    password = os.getenv("SUPABASE_DB_PASSWORD")
    
    if not host or not user or not password:
        raise ValueError("Database credentials missing. Check .env file.")
        
    return psycopg2.connect(
        host=host,
        port=port,
        dbname=dbname,
        user=user,
        password=password
    )

def fetch_subject_id_by_name(conn, subject: str) -> str | None:
    """Looks up a subject_id by name (exact match, case-insensitive)."""
    with conn.cursor() as cur:
        cur.execute("SELECT subject_id FROM subjects WHERE LOWER(name) = LOWER(%s)", (subject,))
        row = cur.fetchone()
        return str(row[0]) if row else None


def fetch_topic_names_for_subject(conn, subject_id: str) -> list[str]:
    """Returns all topic names already defined for a subject — these are the
    candidate labels handed to the zero-shot classifier (see classification_service)."""
    with conn.cursor() as cur:
        cur.execute("SELECT name FROM topics WHERE subject_id = %s ORDER BY name", (subject_id,))
        return [row[0] for row in cur.fetchall()]


def fetch_questions_for_topics(subject: str, topics: list, limit: int = 10) -> list:
    """
    Fetch up to `limit` random questions matching the subject and ANY of the given topics.
    Falls back to any question for that subject when no topic matches are found.
    Returns: [{'text': str, 'topics': [str]}]
    """
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor(cursor_factory=DictCursor) as cur:
            # 1. Find subject — try exact match first, then partial (ILIKE) for cross-subject use
            cur.execute("SELECT subject_id FROM subjects WHERE LOWER(name) = LOWER(%s)", (subject,))
            subject_row = cur.fetchone()
            if not subject_row:
                cur.execute("SELECT subject_id FROM subjects WHERE name ILIKE %s", (f'%{subject}%',))
                subject_row = cur.fetchone()
            if not subject_row:
                return []

            subject_id = subject_row['subject_id']

            # 2. Find topic IDs — exact match, then partial fallback
            topic_ids = []
            if topics:
                topic_placeholders = ','.join(['%s'] * len(topics))
                cur.execute(
                    f"SELECT topic_id FROM topics WHERE subject_id = %s AND LOWER(name) IN ({topic_placeholders})",
                    [subject_id] + [t.lower() for t in topics]
                )
                topic_ids = [row['topic_id'] for row in cur.fetchall()]

                # Partial match fallback — "Risk" matches "Risk Management"
                if not topic_ids:
                    like_clauses = ' OR '.join(['name ILIKE %s'] * len(topics))
                    cur.execute(
                        f"SELECT topic_id FROM topics WHERE subject_id = %s AND ({like_clauses})",
                        [subject_id] + [f'%{t}%' for t in topics]
                    )
                    topic_ids = [row['topic_id'] for row in cur.fetchall()]

            # 3. Fetch questions — by topic if found, otherwise any for this subject
            if topic_ids:
                t_ids_placeholders = ','.join(['%s'] * len(topic_ids))
                q_query = f"""
                    SELECT q.question_id, q.content,
                           array_agg(DISTINCT t.name) AS topic_names
                    FROM questions q
                    JOIN question_topics qt ON q.question_id = qt.question_id
                    JOIN topics t ON qt.topic_id = t.topic_id
                    WHERE qt.topic_id IN ({t_ids_placeholders})
                    GROUP BY q.question_id, q.content
                    ORDER BY RANDOM()
                    LIMIT %s
                """
                cur.execute(q_query, topic_ids + [limit])
            else:
                # No topic match at all — return any questions for this subject
                q_query = """
                    SELECT q.question_id, q.content,
                           array_agg(DISTINCT t.name) AS topic_names
                    FROM questions q
                    JOIN question_topics qt ON q.question_id = qt.question_id
                    JOIN topics t ON qt.topic_id = t.topic_id
                    WHERE t.subject_id = %s
                    GROUP BY q.question_id, q.content
                    ORDER BY RANDOM()
                    LIMIT %s
                """
                cur.execute(q_query, [subject_id, limit])

            results = []
            for row in cur.fetchall():
                results.append({
                    "text":   row['content'],
                    "topics": list(row['topic_names']),
                })
            return results
    except Exception as e:
        print(f"Database error: {e}")
        return []
    finally:
        if conn:
            conn.close()
