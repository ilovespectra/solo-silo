import os
from pathlib import Path

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from core.real_database import ensure_db
from api.endpoints import router as api_router

ensure_db()

app = FastAPI(title="LocalAI Photos", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

ui_dir = Path(__file__).parent / "ui"
if ui_dir.exists():
    app.mount("/ui", StaticFiles(directory=ui_dir, html=True), name="ui")

app.include_router(api_router)


@app.get("/")
def root():
    if ui_dir.exists():
        return RedirectResponse(url="/ui/")
    return {"message": "LocalAI Photos API"}


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=os.environ.get("PAI_RELOAD", "0") == "1")
