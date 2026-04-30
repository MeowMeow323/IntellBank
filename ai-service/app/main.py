"""
IntellBank AI Service – FastAPI main application entry point.
Runs on http://localhost:8000

All endpoints are called ONLY by Spring Boot.
The React frontend NEVER calls this service directly.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from app.routes import ocr_routes, prediction_routes, generation_routes, classification_routes

load_dotenv()

app = FastAPI(
    title="IntellBank AI Service",
    description="AI microservice for question generation, OCR, classification, and topic prediction.",
    version="0.1.0",
)

# Allow Spring Boot to call this service (only localhost in production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8080"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Register Routers ─────────────────────────────────────────────────────────
app.include_router(ocr_routes.router, prefix="/ai/ocr", tags=["OCR"])
app.include_router(classification_routes.router, prefix="/ai/classify", tags=["Classification"])
app.include_router(prediction_routes.router, prefix="/ai/predict", tags=["Prediction"])
app.include_router(generation_routes.router, prefix="/ai/generate", tags=["Generation"])


@app.get("/", tags=["Health"])
def health_check():
    return {"status": "ok", "service": "IntellBank AI Service", "version": "0.1.0"}
