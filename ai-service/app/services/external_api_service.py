"""
External API Service – placeholder for any third-party API integrations.

Currently unused. Add external API calls here if needed (e.g. Supabase, HuggingFace Hub).
"""

import os
from dotenv import load_dotenv

load_dotenv()


def download_from_supabase(storage_path: str, local_dest: str) -> str:
    """
    Download a file from Supabase Storage to a local path.

    TODO: Implement using the supabase-py client library.
    Requires: pip install supabase

    Args:
        storage_path: Path in Supabase Storage (e.g. documents/uuid/file.pdf)
        local_dest: Local destination file path

    Returns:
        Local file path
    """
    SUPABASE_URL = os.getenv("SUPABASE_URL")
    SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

    # TODO: Uncomment and implement after installing supabase-py
    # from supabase import create_client
    # client = create_client(SUPABASE_URL, SUPABASE_KEY)
    # data = client.storage.from_("documents").download(storage_path)
    # with open(local_dest, "wb") as f:
    #     f.write(data)
    # return local_dest

    raise NotImplementedError("Supabase Storage download not yet implemented.")
