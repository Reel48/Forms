from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from routers import quotes, clients, pdf
import os

load_dotenv()

app = FastAPI(title="Quote Builder API", version="1.0.0")

# Get allowed origins from environment or use defaults
allowed_origins = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,http://localhost:3000"
).split(",")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(quotes.router)
app.include_router(clients.router)
app.include_router(pdf.router)

@app.get("/")
async def root():
    return {"message": "Quote Builder API is running"}

@app.get("/health")
async def health():
    return {"status": "healthy"}

