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

def fetch_questions_for_topics(subject: str, topics: list, limit: int = 4) -> list:
    """
    Fetch up to `limit` random questions that match the subject and ANY of the given topics.
    Returns a list of dicts: [{'text': str, 'topics': [str]}]
    """
    try:
        conn = get_db_connection()
        with conn.cursor(cursor_factory=DictCursor) as cur:
            # 1. Find the subject ID
            cur.execute("SELECT subject_id FROM subjects WHERE LOWER(name) = LOWER(%s)", (subject,))
            subject_row = cur.fetchone()
            if not subject_row:
                return []
                
            subject_id = subject_row['subject_id']
            
            # 2. Find the topic IDs
            if not topics:
                return []
                
            topic_placeholders = ','.join(['%s'] * len(topics))
            query = f"""
                SELECT topic_id, name FROM topics 
                WHERE subject_id = %s AND LOWER(name) IN ({topic_placeholders})
            """
            cur.execute(query, [subject_id] + [t.lower() for t in topics])
            topic_rows = cur.fetchall()
            
            if not topic_rows:
                return []
                
            topic_ids = [row['topic_id'] for row in topic_rows]
            
            # 3. Fetch random questions linked to these topic IDs
            t_ids_placeholders = ','.join(['%s'] * len(topic_ids))
            
            q_query = f"""
                SELECT q.question_id, q.content, array_agg(t.name) as topic_names
                FROM questions q
                JOIN question_topics qt ON q.question_id = qt.question_id
                JOIN topics t ON qt.topic_id = t.topic_id
                WHERE qt.topic_id IN ({t_ids_placeholders})
                GROUP BY q.question_id, q.content
                ORDER BY RANDOM()
                LIMIT %s
            """
            
            cur.execute(q_query, topic_ids + [limit])
            question_rows = cur.fetchall()
            
            results = []
            for row in question_rows:
                results.append({
                    "text": row['content'],
                    "topics": row['topic_names']
                })
                
            return results
    except Exception as e:
        print(f"Database error: {e}")
        return []
    finally:
        if 'conn' in locals() and conn:
            conn.close()
