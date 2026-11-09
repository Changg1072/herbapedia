import io
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional

from fastapi import (
    BackgroundTasks,
    Depends,
    FastAPI,
    File,
    Form,
    HTTPException,
    UploadFile,
    status,
)
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import PredictionHistory, SessionLocal, User, init_db
from routers import auth, community, herbs
from services.cloudinary_service import is_configured as is_cloudinary_configured, upload_image
from services.model_service import (
    MODEL_CONFIGS,
    get_active_model_id,
    get_available_models,
    predict_image,
    set_active_model_id,
    warmup_models,
)

logger = logging.getLogger(__name__)


def save_prediction_history_background(
    user_id: int,
    image_data: bytes,
    predicted_class: str,
    confidence_value: float,
):
    """Xử lý upload ảnh lên Cloudinary và lưu database ở chế độ ngầm để không làm chậm phản hồi UI."""
    image_url = ""
    image_public_id = None
    if is_cloudinary_configured():
        try:
            upload_res = upload_image(
                io.BytesIO(image_data),
                folder="herbapedia/predictions",
            )
            image_url = upload_res.get("url", "")
            image_public_id = upload_res.get("public_id")
        except Exception as exc:
            logger.warning(f"Không thể upload ảnh lên Cloudinary: {exc}")

    db = SessionLocal()
    try:
        history_record = PredictionHistory(
            user_id=user_id,
            image_url=image_url or "https://images.unsplash.com/photo-1596484552834-6a58f850e0a1",
            image_public_id=image_public_id,
            predicted_class=predicted_class,
            confidence=confidence_value,
            created_at=datetime.now(timezone.utc),
        )
        db.add(history_record)
        db.commit()
    except Exception as exc:
        logger.warning(f"Không thể lưu PredictionHistory trong background: {exc}")
        db.rollback()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    del _app
    init_db()
    # Tải trước mô hình vào RAM ngay khi khởi động
    await run_in_threadpool(warmup_models)
    yield


app = FastAPI(title="HerbaPedia API", version="1.0.0", lifespan=lifespan)

allowed_origins = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5500,http://127.0.0.1:5500,http://localhost:5173",
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(community.router)
app.include_router(herbs.router)


@app.get("/")
def read_root():
    return {
        "message": "FastAPI Backend for Herbal Plant Recognition is running!",
        "active_model": get_active_model_id(),
        "available_models": [m["name"] for m in get_available_models()],
    }


@app.get("/models")
def list_models():
    """Lấy danh sách các mô hình nhận diện và mô hình đang kích hoạt."""
    return {
        "active_model": get_active_model_id(),
        "models": get_available_models(),
    }


class SelectModelPayload(BaseModel):
    model_id: str


@app.post("/models/select")
def select_model(payload: SelectModelPayload):
    """Chọn mô hình nhận diện mặc định."""
    if payload.model_id not in MODEL_CONFIGS:
        raise HTTPException(
            status_code=400,
            detail=f"Mô hình '{payload.model_id}' không hợp lệ. Chỉ chấp nhận: {list(MODEL_CONFIGS.keys())}",
        )
    set_active_model_id(payload.model_id)
    return {
        "message": f"Đã chuyển mô hình sang: {MODEL_CONFIGS[payload.model_id]['name']}",
        "active_model": get_active_model_id(),
    }


@app.post("/predict")
async def predict_leaf(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    model_name: Optional[str] = Form(None),
    current_user: Optional[User] = Depends(auth.get_optional_user),
    db: Session = Depends(herbs.get_db),
):
    if file.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise HTTPException(
            status_code=415,
            detail="Chỉ hỗ trợ ảnh JPEG, PNG hoặc WEBP",
        )

    image_data = await file.read()
    if len(image_data) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Ảnh không được vượt quá 10 MB")

    try:
        image = Image.open(io.BytesIO(image_data))
        image.load()
    except (UnidentifiedImageError, OSError) as exc:
        raise HTTPException(status_code=400, detail="File ảnh không hợp lệ") from exc

    # Xác định model được yêu cầu
    chosen_model_id = (model_name or "").strip()
    if not chosen_model_id or chosen_model_id not in MODEL_CONFIGS:
        chosen_model_id = get_active_model_id()

    try:
        # Chạy inference trong threadpool để không block event loop của FastAPI
        prediction_result = await run_in_threadpool(
            predict_image,
            image,
            chosen_model_id,
        )
    except Exception as exc:
        logger.exception("Lỗi khi suy luận mô hình AI")
        raise HTTPException(
            status_code=500,
            detail=f"Lỗi khi nhận diện ảnh: {str(exc)}",
        ) from exc

    # Đưa tác vụ upload Cloudinary và lưu lịch sử vào BackgroundTasks khi ảnh thuộc tập đã biết (KNOWN)
    if current_user is not None and prediction_result.get("is_known", True):
        background_tasks.add_task(
            save_prediction_history_background,
            current_user.id,
            image_data,
            prediction_result["predicted_class"],
            prediction_result["confidence_value"],
        )

    response_data = {
        "status": prediction_result.get("status", "KNOWN"),
        "is_known": prediction_result.get("is_known", True),
        "osr": prediction_result.get("osr"),
        "model_id": prediction_result["model_id"],
        "model_name": prediction_result["model_name"],
        "model_accuracy": prediction_result.get("model_accuracy", ""),
        "model_accuracy_value": prediction_result.get("model_accuracy_value", 0.0),
        "predicted_class": prediction_result["predicted_class"],
        "scientific_name": prediction_result["scientific_name"],
        "class_name": prediction_result["class_name"],
        "herb_slug": prediction_result["herb_slug"],
        "confidence": prediction_result["confidence"],
        "confidence_value": prediction_result["confidence_value"],
        "top_candidates": prediction_result["top_candidates"],
    }

    return response_data
