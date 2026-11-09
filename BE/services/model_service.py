import json
import logging
import os
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageOps

# Đặt backend cho Keras sang torch trước khi nạp thư viện Keras
os.environ.setdefault("KERAS_BACKEND", "torch")
import keras  # noqa: E402
import torch  # noqa: E402
import torch.nn.functional as F  # noqa: E402

from models.Model1.model1 import LeafAI_Model, load_model1_checkpoint  # noqa: E402
from models.Model2.model2 import (  # noqa: E402
    CustomLeafCNN,
    apply_preprocessing as apply_clahe_preprocessing,
    load_model2_checkpoint,
    load_threshold as load_model2_threshold,
)

try:
    import cv2  # noqa: E402
except ImportError:  # pragma: no cover
    cv2 = None

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent.parent
MODELS_DIR = BASE_DIR / "models"
MODEL1_DIR = MODELS_DIR / "Model1"
MODEL2_DIR = MODELS_DIR / "Model2"

# 20 loài dược liệu của MobileNetV3 & Custom CNN v1 (sắp xếp A-Z theo tên thư mục)
CLASS_NAMES = [
    "Aloe",
    "Arabian-jasmine",
    "Betel",
    "Brahmi",
    "Coffee",
    "Eucalyptus",
    "Guava",
    "Hibiscus",
    "Jackfruit",
    "Lemon",
    "Mango",
    "Marigold",
    "Mint",
    "Neem",
    "Onion",
    "Papaya",
    "Pepper",
    "Rose",
    "Tomato",
    "Tulsi",
]

# Mặc định 17 loài dược liệu của LeafAI (Model 1 & Model 2), tự động đồng bộ từ leafai_model1_preprocessing.json
DEFAULT_LEAFAI_CLASS_NAMES = [
    "Aloe",
    "Bitter Gourd",
    "Centella asiatica",
    "Coffee",
    "Grape",
    "Guava",
    "Hibiscus",
    "Jackfruit",
    "Lemon",
    "Mango",
    "Neem",
    "Orange",
    "Papaya",
    "Snakeplant",
    "Tea",
    "Tomato",
    "Tulsi",
]


def _load_leafai_preprocessing_config() -> dict[str, Any]:
    prep_path = MODEL1_DIR / "leafai_model1_preprocessing.json"
    if prep_path.is_file():
        try:
            return json.loads(prep_path.read_text(encoding="utf-8"))
        except Exception as exc:
            logger.warning(f"Không thể đọc {prep_path}: {exc}")
    return {}


def _load_model1_thresholds() -> dict[str, float]:
    thresh_path = MODEL1_DIR / "leafai_model1_thresholds.json"
    default_thresh = {"msp_thresh": 0.95, "cos_thresh": 0.6499, "dist_z_thresh": 2.0}
    if thresh_path.is_file():
        try:
            data = json.loads(thresh_path.read_text(encoding="utf-8"))
            return {
                "msp_thresh": float(data.get("msp_thresh", default_thresh["msp_thresh"])),
                "cos_thresh": float(data.get("cos_thresh", default_thresh["cos_thresh"])),
                "dist_z_thresh": float(data.get("dist_z_thresh", default_thresh["dist_z_thresh"])),
            }
        except Exception as exc:
            logger.warning(f"Không thể đọc ngưỡng OSR Model 1: {exc}")
    return default_thresh


_PREPROC_CFG = _load_leafai_preprocessing_config()
LEAFAI_CLASS_NAMES: list[str] = _PREPROC_CFG.get("class_names") or DEFAULT_LEAFAI_CLASS_NAMES

HERB_INFO_MAP: dict[str, dict[str, str]] = {
    "Aloe": {
        "slug": "aloevera",
        "name": "Lô hội (Nha đam)",
        "scientific": "Aloe vera (L.) Burm.f.",
        "dataset_name": "Aloevera",
    },
    "Arabian-jasmine": {
        "slug": "jasmine",
        "name": "Hoa nhài (Hoa lài)",
        "scientific": "Jasminum sambac (L.) Aiton",
        "dataset_name": "Jasmine",
    },
    "Betel": {
        "slug": "betel",
        "name": "Trầu không",
        "scientific": "Piper betle L.",
        "dataset_name": "Betel",
    },
    "Bitter Gourd": {
        "slug": "bitter-gourd",
        "name": "Khổ qua (Mướp đắng)",
        "scientific": "Momordica charantia L.",
        "dataset_name": "Bitter Gourd",
    },
    "Brahmi": {
        "slug": "bhrami",
        "name": "Rau đắng biển (Brahmi)",
        "scientific": "Bacopa monnieri (L.) Wettst.",
        "dataset_name": "Bhrami",
    },
    "Centella asiatica": {
        "slug": "centella-asiatica",
        "name": "Rau má",
        "scientific": "Centella asiatica (L.) Urb.",
        "dataset_name": "Centella asiatica",
    },
    "Coffee": {
        "slug": "coffee",
        "name": "Cà phê",
        "scientific": "Coffea arabica L.",
        "dataset_name": "Coffee",
    },
    "Eucalyptus": {
        "slug": "eucalyptus",
        "name": "Bạch đàn (Khuynh diệp)",
        "scientific": "Eucalyptus globulus Labill.",
        "dataset_name": "Eucalyptus",
    },
    "Grape": {
        "slug": "grape",
        "name": "Nho",
        "scientific": "Vitis vinifera L.",
        "dataset_name": "Grape",
    },
    "Guava": {
        "slug": "guava",
        "name": "Ổi",
        "scientific": "Psidium guajava L.",
        "dataset_name": "Guava",
    },
    "Hibiscus": {
        "slug": "hibiscus",
        "name": "Dâm bụt",
        "scientific": "Hibiscus rosa-sinensis L.",
        "dataset_name": "Hibiscus",
    },
    "Jackfruit": {
        "slug": "jackfruit",
        "name": "Mít",
        "scientific": "Artocarpus heterophyllus Lam.",
        "dataset_name": "Jackfruit",
    },
    "Lemon": {
        "slug": "lemon",
        "name": "Chanh vàng",
        "scientific": "Citrus limon (L.) Osbeck",
        "dataset_name": "Lemon",
    },
    "Mango": {
        "slug": "mango",
        "name": "Xoài",
        "scientific": "Mangifera indica L.",
        "dataset_name": "Mango",
    },
    "Marigold": {
        "slug": "marigold",
        "name": "Hoa vạn thọ",
        "scientific": "Tagetes erecta L.",
        "dataset_name": "Marigold",
    },
    "Mint": {
        "slug": "mint",
        "name": "Bạc hà",
        "scientific": "Mentha × piperita L.",
        "dataset_name": "Mint",
    },
    "Neem": {
        "slug": "neem",
        "name": "Xoan Ấn Độ (Sầu đâu)",
        "scientific": "Azadirachta indica A.Juss.",
        "dataset_name": "Neem",
    },
    "Onion": {
        "slug": "onion",
        "name": "Hành",
        "scientific": "Allium cepa L.",
        "dataset_name": "Onion",
    },
    "Orange": {
        "slug": "orange",
        "name": "Cam",
        "scientific": "Citrus × sinensis (L.) Osbeck",
        "dataset_name": "Orange",
    },
    "Papaya": {
        "slug": "papaya",
        "name": "Đu đủ",
        "scientific": "Carica papaya L.",
        "dataset_name": "Papaya",
    },
    "Pepper": {
        "slug": "pepper",
        "name": "Hồ tiêu (Tiêu)",
        "scientific": "Piper nigrum L.",
        "dataset_name": "Pepper",
    },
    "Rose": {
        "slug": "rose",
        "name": "Hoa hồng",
        "scientific": "Rosa chinensis Jacq.",
        "dataset_name": "Rose",
    },
    "Snakeplant": {
        "slug": "snakeplant",
        "name": "Lưỡi hổ",
        "scientific": "Dracaena trifasciata (Prain) Mabb.",
        "dataset_name": "Snakeplant",
    },
    "Tea": {
        "slug": "tea",
        "name": "Trà xanh (Chè xanh)",
        "scientific": "Camellia sinensis (L.) Kuntze",
        "dataset_name": "Tea",
    },
    "Tomato": {
        "slug": "tomato",
        "name": "Cà chua",
        "scientific": "Solanum lycopersicum L.",
        "dataset_name": "Tomato",
    },
    "Tulsi": {
        "slug": "tulsi",
        "name": "Húng quế thánh (Hương nhu tía)",
        "scientific": "Ocimum tenuiflorum L.",
        "dataset_name": "Tulsi",
    },
}

MODEL_CONFIGS: dict[str, dict[str, Any]] = {
    "efficientnet_b0": {
        "id": "efficientnet_b0",
        "name": "EfficientNet-B0",
        "accuracy": "96.8%",
        "accuracy_value": 96.8,
        "description": "LeafAI Model 1: EfficientNet-B0 + CLAHE + Prototype Open-Set Recognition (17 loài).",
        "filename": "Model1/leafai_model1_best.pth",
        "framework": "pytorch_model1",
        "input_size": (224, 224),
        "rescale": 1.0 / 255.0,
        "class_names": LEAFAI_CLASS_NAMES,
    },
    "custom_cnn_v2": {
        "id": "custom_cnn_v2",
        "name": "Custom CNN v2",
        "accuracy": "91.4%",
        "accuracy_value": 91.4,
        "description": "LeafAI Model 2: CustomLeafCNN 5 khối + CLAHE + MSP Open-Set Recognition (17 loài).",
        "filename": "Model2/leafai_model2_best.pth",
        "framework": "pytorch_model2",
        "input_size": (224, 224),
        "rescale": 1.0 / 255.0,
        "class_names": LEAFAI_CLASS_NAMES,
    },
    "mobilenet_v3": {
        "id": "mobilenet_v3",
        "name": "MobileNetV3 (Fine-tuning)",
        "accuracy": "95.6%",
        "accuracy_value": 95.6,
        "description": "Mô hình MobileNetV3 Large được huấn luyện Fine-tuning, tối ưu tốc độ và độ chính xác cao (20 loài).",
        "filename": "mobilenet_leaf_model.keras",
        "framework": "keras",
        "input_size": (224, 224),
        "rescale": 1.0,
        "class_names": CLASS_NAMES,
    },
    "custom_cnn": {
        "id": "custom_cnn",
        "name": "Custom CNN v1",
        "accuracy": "88.4%",
        "accuracy_value": 88.4,
        "description": "Mô hình mạng tích chập 5 khối CNN phiên bản 1 tự thiết kế và huấn luyện từ đầu (20 loài).",
        "filename": "best_leaf_model.keras",
        "framework": "keras",
        "input_size": (224, 224),
        "rescale": 1.0 / 255.0,
        "class_names": CLASS_NAMES,
    },
}

_active_model_id = os.getenv("DEFAULT_MODEL", "efficientnet_b0")
_loaded_models: dict[str, Any] = {}
_device = torch.device("cuda" if torch.cuda.is_available() else "cpu")


def get_available_models() -> list[dict[str, Any]]:
    current_id = get_active_model_id()
    result = []
    for m_id, cfg in MODEL_CONFIGS.items():
        model_path = MODELS_DIR / cfg["filename"]
        result.append(
            {
                "id": m_id,
                "name": cfg["name"],
                "accuracy": cfg.get("accuracy", ""),
                "accuracy_value": cfg.get("accuracy_value", 0.0),
                "description": cfg["description"],
                "framework": cfg.get("framework", "keras"),
                "num_classes": len(cfg.get("class_names", CLASS_NAMES)),
                "input_size": cfg["input_size"],
                "filename": cfg["filename"],
                "is_available": model_path.exists(),
                "is_active": m_id == current_id,
            }
        )
    return result


def get_active_model_id() -> str:
    global _active_model_id
    if _active_model_id not in MODEL_CONFIGS:
        _active_model_id = "efficientnet_b0"
    return _active_model_id


def set_active_model_id(model_id: str) -> bool:
    global _active_model_id
    if model_id in MODEL_CONFIGS:
        _active_model_id = model_id
        logger.info(f"Đã chuyển mô hình hoạt động sang: {model_id}")
        return True
    return False


def load_model_instance(model_id: str):
    if model_id not in MODEL_CONFIGS:
        raise ValueError(f"Mô hình không hợp lệ: {model_id}")

    if model_id in _loaded_models:
        return _loaded_models[model_id]

    cfg = MODEL_CONFIGS[model_id]
    model_path = MODELS_DIR / cfg["filename"]
    if not model_path.exists():
        raise FileNotFoundError(f"Không tìm thấy file mô hình tại {model_path}")

    framework = cfg.get("framework", "keras")
    num_classes = len(cfg.get("class_names", LEAFAI_CLASS_NAMES))
    logger.info(f"Đang nạp mô hình {cfg['name']} ({framework}) từ {model_path}...")

    if framework == "pytorch_model1":
        model = LeafAI_Model(num_classes=num_classes, pretrained=False)
        load_model1_checkpoint(model, model_path, device=_device, strict=True)
        thresholds = _load_model1_thresholds()
        bundle = {"model": model, "thresholds": thresholds}
        _loaded_models[model_id] = bundle
        logger.info(f"Nạp thành công Model 1 ({cfg['name']}) với ngưỡng OSR: {thresholds}")
        return bundle

    if framework == "pytorch_model2":
        model = CustomLeafCNN(num_classes=num_classes)
        load_model2_checkpoint(model, str(model_path), device=_device)
        thresh_file = MODEL2_DIR / "leafai_model2_thresholds.json"
        msp_thresh = load_model2_threshold(str(thresh_file)) if thresh_file.is_file() else 0.9657
        bundle = {"model": model, "msp_thresh": msp_thresh}
        _loaded_models[model_id] = bundle
        logger.info(f"Nạp thành công Model 2 ({cfg['name']}) với msp_thresh={msp_thresh:.4f}")
        return bundle

    model = keras.saving.load_model(str(model_path))

    # Tự động đồng bộ kích thước input_shape từ mô hình Keras thực tế
    try:
        in_shape = getattr(model, "input_shape", None)
        if in_shape and len(in_shape) >= 3 and in_shape[1] and in_shape[2]:
            cfg["input_size"] = (int(in_shape[1]), int(in_shape[2]))
        has_internal_rescaling = any(
            "rescaling" in getattr(layer, "name", "").lower() or "rescale" in getattr(layer, "name", "").lower()
            for layer in getattr(model, "layers", [])
        )
        if has_internal_rescaling:
            cfg["rescale"] = 1.0
    except Exception as exc:
        logger.warning(f"Không thể đọc tự động cấu hình mô hình Keras: {exc}")

    if hasattr(model, "eval"):
        try:
            model.eval()
        except Exception:
            pass

    _loaded_models[model_id] = model
    logger.info(f"Nạp thành công mô hình {cfg['name']}!")
    return model


def warmup_models():
    for model_id, cfg in MODEL_CONFIGS.items():
        try:
            model_path = MODELS_DIR / cfg["filename"]
            if not model_path.exists():
                continue
            loaded = load_model_instance(model_id)
            framework = cfg.get("framework", "keras")
            if framework in {"pytorch_model1", "pytorch_model2"}:
                dummy_t = torch.zeros((1, 3, *cfg["input_size"]), dtype=torch.float32, device=_device)
                with torch.no_grad():
                    _ = loaded["model"](dummy_t)
            else:
                dummy = np.zeros((1, *cfg["input_size"], 3), dtype=np.float32)
                with torch.no_grad():
                    _ = loaded(dummy, training=False)
            logger.info(f"Làm nóng mô hình {model_id} thành công!")
        except Exception as exc:
            logger.warning(f"Không thể làm nóng mô hình {model_id}: {exc}")


def preprocess_leafai_image(image: Image.Image) -> torch.Tensor:
    """
    Tiền xử lý chuẩn cho Model 1 & Model 2 theo leafai_model1_preprocessing.json và model2.py:
    EXIF Transpose -> RGB -> BGR -> CLAHE (LAB L-channel, clipLimit=2.0, 8x8, Before Resize) -> Resize 224x224 -> ImageNet Normalize.
    """
    image = ImageOps.exif_transpose(image)
    if image.mode != "RGB":
        image = image.convert("RGB")
    rgb_np = np.asarray(image, dtype=np.uint8)

    if cv2 is not None:
        bgr_np = cv2.cvtColor(rgb_np, cv2.COLOR_RGB2BGR)
        return apply_clahe_preprocessing(bgr_np).to(_device)

    # Dự phòng nếu môi trường thiếu OpenCV
    resized = image.resize((224, 224), Image.Resampling.BILINEAR)
    arr = np.asarray(resized, dtype=np.float32) / 255.0
    mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
    std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
    arr = (arr - mean) / std
    chw = np.transpose(arr, (2, 0, 1))
    return torch.from_numpy(np.expand_dims(chw, axis=0)).to(_device)


def preprocess_keras_image(image: Image.Image, target_size: tuple[int, int], rescale: float) -> np.ndarray:
    image = ImageOps.exif_transpose(image)
    if image.mode != "RGB":
        image = image.convert("RGB")
    image = image.resize(target_size, Image.Resampling.BILINEAR)
    img_array = np.asarray(image, dtype=np.float32) * rescale
    return np.expand_dims(img_array, axis=0)


def _build_candidates(probs: np.ndarray, class_names: list[str], top_k: int = 5) -> list[dict[str, Any]]:
    top_indices = np.argsort(probs)[::-1][:top_k]
    candidates = []
    for idx in top_indices:
        c_idx = int(idx)
        c_name = class_names[c_idx] if c_idx < len(class_names) else f"Class_{c_idx}"
        c_info = HERB_INFO_MAP.get(
            c_name,
            {"slug": c_name.lower().replace(" ", "-"), "name": c_name, "scientific": ""},
        )
        c_prob = float(probs[c_idx])
        candidates.append(
            {
                "class_name": c_name,
                "name": c_info["name"],
                "scientific": c_info.get("scientific", ""),
                "slug": c_info.get("slug", c_name.lower().replace(" ", "-")),
                "confidence": f"{c_prob * 100:.2f}%",
                "confidence_value": round(c_prob * 100, 2),
            }
        )
    return candidates


def predict_image(image: Image.Image, model_id: str | None = None) -> dict[str, Any]:
    target_model_id = model_id or get_active_model_id()
    if target_model_id not in MODEL_CONFIGS:
        target_model_id = get_active_model_id()

    cfg = MODEL_CONFIGS[target_model_id]
    framework = cfg.get("framework", "keras")
    class_names: list[str] = cfg.get("class_names", CLASS_NAMES)
    loaded = load_model_instance(target_model_id)

    is_known = True
    osr_info: dict[str, Any] | None = None

    if framework == "pytorch_model1":
        tensor_x = preprocess_leafai_image(image)
        model: LeafAI_Model = loaded["model"]
        thresholds: dict[str, float] = loaded["thresholds"]
        with torch.no_grad():
            logits, _ = model.forward(tensor_x)
            probs = F.softmax(logits, dim=1)[0].detach().cpu().numpy()
            osr_res = model.predict_open_set(tensor_x, thresholds=thresholds)

        is_known = bool(osr_res["is_known"][0].item())
        osr_info = {
            "status": "KNOWN" if is_known else "UNKNOWN",
            "method": "Prototype OSR (MSP + Cosine + Distance Z-score)",
            "votes": f"{int(osr_res['votes'][0].item())}/3",
            "msp": round(float(osr_res["msp"][0].item()) * 100, 2),
            "cosine": round(float(osr_res["cosine"][0].item()), 4),
            "dist_z": round(float(osr_res["dist_z"][0].item()), 3),
            "thresholds": thresholds,
        }

    elif framework == "pytorch_model2":
        tensor_x = preprocess_leafai_image(image)
        model2: CustomLeafCNN = loaded["model"]
        msp_thresh: float = loaded["msp_thresh"]
        osr_list = model2.predict_open_set(tensor_x, msp_threshold=msp_thresh, class_names=class_names)
        res0 = osr_list[0]
        probs = np.asarray(res0["probabilities"], dtype=np.float32)
        is_known = res0["status"] == "KNOWN"
        osr_info = {
            "status": res0["status"],
            "method": "MSP Open-Set (Youden J)",
            "msp": round(float(res0["confidence_msp"]) * 100, 2),
            "msp_threshold": round(float(msp_thresh) * 100, 2),
        }

    else:
        x_np = preprocess_keras_image(image, cfg["input_size"], cfg["rescale"])
        try:
            with torch.no_grad():
                preds = loaded(x_np, training=False)
                if hasattr(preds, "detach"):
                    preds = preds.detach().cpu().numpy()
                elif hasattr(preds, "numpy"):
                    preds = preds.numpy()
        except Exception:
            preds = loaded.predict(x_np, verbose=0)
        probs = preds[0] if len(preds.shape) > 1 else preds

    top_candidates = _build_candidates(probs, class_names, top_k=5)
    best_candidate = top_candidates[0]
    top_prob_pct = best_candidate["confidence_value"]

    if is_known:
        predicted_name = best_candidate["name"]
        scientific_name = best_candidate["scientific"]
        class_name = best_candidate["class_name"]
        herb_slug = best_candidate["slug"]
    else:
        predicted_name = "Chưa xác định (Ngoài tập 17 loài)"
        scientific_name = f"Gần giống nhất: {best_candidate['name']} ({best_candidate['confidence']} — Từ chối bởi OSR)"
        class_name = "Rejected (UNKNOWN)"
        herb_slug = best_candidate["slug"]

    return {
        "status": "KNOWN" if is_known else "UNKNOWN",
        "is_known": is_known,
        "osr": osr_info,
        "model_id": target_model_id,
        "model_name": cfg["name"],
        "model_accuracy": cfg.get("accuracy", ""),
        "model_accuracy_value": cfg.get("accuracy_value", 0.0),
        "predicted_class": predicted_name,
        "scientific_name": scientific_name,
        "class_name": class_name,
        "herb_slug": herb_slug,
        "confidence": best_candidate["confidence"],
        "confidence_value": top_prob_pct,
        "top_candidates": top_candidates,
    }
