"""
LEAFAI - MODEL 1
EfficientNet-B0 + Prototype-based Open-Set Recognition (OSR)

Tương thích kiến trúc/state_dict với LeafAI_Model trong notebook huấn luyện:
- Backbone: torchvision EfficientNet-B0
- Feature dimension: 1280
- Classifier: Linear(1280, num_classes)
- Buffers: prototypes, class_mean_dist, class_std_dist, prototypes_ready
- Forward: trả về (logits, feature_vector)
- OSR: MSP + Cosine Similarity + Z-score Distance

Checkpoint Model 1 trong notebook được lưu dưới dạng raw state_dict:
    torch.save(model.state_dict(), "leafai_model1_best.pth")

Ví dụ triển khai:
    model = LeafAI_Model(num_classes=17, pretrained=False)
    load_model1_checkpoint(model, "leafai_model1_best.pth", device)
    result = model.predict_open_set(
        image_tensor,
        msp_thresh=0.95,
        cos_thresh=0.64,
        dist_z_thresh=2.194,
    )

Lưu ý:
- Khi load checkpoint đầy đủ, pretrained=False giúp Backend không phải tải
  ImageNet weights từ Internet. State_dict checkpoint sẽ ghi đè toàn bộ
  trọng số backbone và classifier.
- Tiền xử lý ảnh (resize, CLAHE, Normalize) phải giống pipeline lúc đánh giá/
  huấn luyện. File này chỉ định nghĩa model và suy luận, không xử lý ảnh.
"""

from pathlib import Path
from typing import Any, Dict, Optional, Tuple, Union

import torch
import torch.nn as nn
import torch.nn.functional as F
from torchvision import models


ThresholdInput = Optional[Dict[str, float]]


class LeafAI_Model(nn.Module):
    """EfficientNet-B0 cho phân loại 17 lớp lá cây và Open-set Recognition."""

    def __init__(
        self,
        num_classes: int = 17,
        pretrained: bool = True,
    ) -> None:
        """
        Args:
            num_classes: Số lớp phân loại. Phải trùng với checkpoint.
            pretrained: True dùng ImageNet weights khi khởi tạo.
                Khi triển khai Backend và load checkpoint đầy đủ, có thể đặt
                False để tránh tải weights từ Internet.
        """
        super().__init__()

        if num_classes <= 0:
            raise ValueError("num_classes phải lớn hơn 0.")

        self.num_classes = int(num_classes)

        # Backbone giống notebook huấn luyện.
        weights = (
            models.EfficientNet_B0_Weights.DEFAULT
            if pretrained
            else None
        )
        self.base_model = models.efficientnet_b0(weights=weights)

        # Đóng băng toàn bộ Backbone giống notebook.
        for param in self.base_model.features.parameters():
            param.requires_grad = False

        # Giữ nguyên tên module để tương thích state_dict.
        self.features = self.base_model.features
        self.pool = self.base_model.avgpool
        self.flatten = nn.Flatten()

        in_features = self.base_model.classifier[1].in_features  # 1280

        # Classifier mới cho các lớp lá cây.
        self.classifier = nn.Linear(in_features, self.num_classes)

        # Các buffer được lưu trong state_dict, không tham gia gradient.
        # Dùng dtype bool giống chính xác notebook gốc.
        self.register_buffer(
            "prototypes",
            torch.zeros(self.num_classes, in_features),
        )
        self.register_buffer(
            "class_mean_dist",
            torch.zeros(self.num_classes),
        )
        self.register_buffer(
            "class_std_dist",
            torch.ones(self.num_classes),
        )
        self.register_buffer(
            "prototypes_ready",
            torch.tensor(False, dtype=torch.bool),
        )

    def train(self, mode: bool = True) -> "LeafAI_Model":
        """
        Giữ Backbone ở eval mode khi huấn luyện classifier, giống notebook.
        BatchNorm của EfficientNet vì vậy không cập nhật running statistics.
        """
        super().train(mode)
        self.features.eval()
        return self

    def forward(
        self,
        x: torch.Tensor,
    ) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        Args:
            x: Tensor ảnh dạng (B, 3, H, W), thường là (B, 3, 224, 224).

        Returns:
            (logits, feature_vector)
            logits: (B, num_classes)
            feature_vector: (B, 1280)
        """
        if not isinstance(x, torch.Tensor):
            raise TypeError("Đầu vào x phải là torch.Tensor.")
        if x.ndim != 4:
            raise ValueError(
                f"Đầu vào phải có 4 chiều (B, C, H, W), nhận được {tuple(x.shape)}."
            )
        if x.shape[1] != 3:
            raise ValueError(
                f"Model yêu cầu ảnh RGB có 3 kênh, nhận được {x.shape[1]} kênh."
            )

        x = self.features(x)
        x = self.pool(x)
        feature_vector = self.flatten(x)
        logits = self.classifier(feature_vector)

        return logits, feature_vector

    @torch.no_grad()
    def fit_prototypes(
        self,
        dataloader: torch.utils.data.DataLoader,
        device: Optional[Union[str, torch.device]] = None,
    ) -> None:
        """
        Tính Prototype và thống kê khoảng cách từ DataLoader.

        Lưu ý: dùng tập train/reference giống quy trình trong notebook.
        Không gọi hàm này trong mỗi request dự đoán ở Backend.
        """
        if device is None:
            device = next(self.parameters()).device
        device = torch.device(device)

        self.to(device)
        self.eval()

        feats_by_class = [[] for _ in range(self.num_classes)]

        for batch in dataloader:
            if not isinstance(batch, (tuple, list)) or len(batch) < 2:
                raise ValueError(
                    "Mỗi batch phải chứa ít nhất (images, labels)."
                )

            images, labels = batch[0], batch[1]
            images = images.to(device, non_blocking=True)
            labels = labels.to(device, non_blocking=True).long()

            _, feats = self(images)

            for feature, label in zip(feats, labels):
                class_id = int(label.item())
                if 0 <= class_id < self.num_classes:
                    feats_by_class[class_id].append(feature.detach())

        missing_classes = [
            class_id
            for class_id, class_features in enumerate(feats_by_class)
            if not class_features
        ]
        if missing_classes:
            raise ValueError(
                f"Thiếu dữ liệu để xây dựng Prototype cho các lớp: "
                f"{missing_classes}"
            )

        for class_id, class_features in enumerate(feats_by_class):
            class_tensor = torch.stack(class_features, dim=0)
            prototype = class_tensor.mean(dim=0)

            self.prototypes[class_id].copy_(prototype)

            distances = torch.norm(
                class_tensor - prototype.unsqueeze(0),
                p=2,
                dim=1,
            )

            self.class_mean_dist[class_id].copy_(distances.mean())
            self.class_std_dist[class_id].copy_(
                distances.std(unbiased=False).clamp_min(1e-6)
            )

        self.prototypes_ready.fill_(True)

        print(
            f"Đã xây dựng Prototype thành công cho "
            f"{self.num_classes} lớp."
        )

    def check_prototypes(self) -> None:
        """Báo lỗi rõ ràng nếu checkpoint chưa có Prototype hợp lệ."""
        if not bool(self.prototypes_ready.item()):
            raise RuntimeError(
                "Prototype chưa sẵn sàng. Hãy load checkpoint đã chứa "
                "Prototype hoặc gọi fit_prototypes() trước khi dùng OSR."
            )

    @torch.no_grad()
    def msp_score(
        self,
        logits: torch.Tensor,
    ) -> Tuple[torch.Tensor, torch.Tensor]:
        """Trả về MSP và lớp có xác suất Softmax cao nhất."""
        probs = F.softmax(logits, dim=1)
        msp, pred = probs.max(dim=1)
        return msp, pred

    @torch.no_grad()
    def cosine_score(
        self,
        feats: torch.Tensor,
    ) -> Tuple[torch.Tensor, torch.Tensor]:
        """Tính cosine similarity giữa feature và tất cả Prototype."""
        features_normalized = F.normalize(feats, p=2, dim=1)
        prototypes_normalized = F.normalize(self.prototypes, p=2, dim=1)

        similarities = features_normalized @ prototypes_normalized.t()
        max_similarity, pred = similarities.max(dim=1)

        return max_similarity, pred

    @torch.no_grad()
    def distance_score(
        self,
        feats: torch.Tensor,
    ) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        """
        Tính khoảng cách Euclidean nhỏ nhất và Z-score theo lớp Prototype gần nhất.
        """
        distances = torch.cdist(feats, self.prototypes, p=2)
        min_dist, pred = distances.min(dim=1)

        std = self.class_std_dist[pred].clamp_min(1e-6)
        z_score = (
            min_dist - self.class_mean_dist[pred]
        ) / std

        return min_dist, z_score, pred

    @torch.no_grad()
    def predict_open_set(
        self,
        x: torch.Tensor,
        msp_thresh: Union[float, Dict[str, float]] = 0.7,
        cos_thresh: float = 0.6,
        dist_z_thresh: float = 3.0,
        thresholds: ThresholdInput = None,
    ) -> Dict[str, torch.Tensor]:
        """
        Open-set Recognition theo đúng logic notebook.

        Hỗ trợ hai cách gọi:

        1) Giống notebook:
           predict_open_set(x, msp_thresh=0.95,
                            cos_thresh=0.64, dist_z_thresh=2.194)

        2) Nhận ngưỡng từ cấu hình Backend:
           predict_open_set(x, thresholds={
               "msp_thresh": 0.95,
               "cos_thresh": 0.64,
               "dist_z_thresh": 2.194
           })

        Quy tắc KNOWN:
        - Ít nhất 2/3 tiêu chí MSP, Cosine, Distance đạt ngưỡng.
        - Đồng thời cả 3 phương pháp phải đồng thuận về nhãn.
        UNKNOWN được gán nhãn -1.
        """
        # Cho phép truyền dictionary làm tham số thứ hai để tương thích
        # với cách gọi trong module Backend.
        if isinstance(msp_thresh, dict):
            if thresholds is not None:
                raise ValueError(
                    "Không truyền thresholds hai lần."
                )
            thresholds = msp_thresh
            msp_thresh = 0.7

        if thresholds is not None:
            msp_thresh = thresholds.get("msp_thresh", float(msp_thresh))
            cos_thresh = thresholds.get("cos_thresh", cos_thresh)
            dist_z_thresh = thresholds.get("dist_z_thresh", dist_z_thresh)

        msp_thresh = float(msp_thresh)
        cos_thresh = float(cos_thresh)
        dist_z_thresh = float(dist_z_thresh)

        self.eval()
        self.check_prototypes()

        logits, feats = self.forward(x)

        msp, pred_msp = self.msp_score(logits)
        cosine, pred_cos = self.cosine_score(feats)
        min_dist, z_score, pred_dist = self.distance_score(feats)

        ok_msp = msp >= msp_thresh
        ok_cos = cosine >= cos_thresh
        ok_dist = z_score <= dist_z_thresh

        votes = ok_msp.int() + ok_cos.int() + ok_dist.int()

        agreement = (
            (pred_msp == pred_cos)
            & (pred_msp == pred_dist)
        )

        is_known = (votes >= 2) & agreement

        pred = pred_msp.clone()
        pred[~is_known] = -1

        # Giữ nguyên các key và tensor output của notebook để tương thích
        # với những đoạn code đánh giá/hiển thị hiện có.
        return {
            "pred": pred,
            "is_known": is_known,
            "msp": msp,
            "cosine": cosine,
            "min_dist": min_dist,
            "dist_z": z_score,
            "votes": votes,
            "pred_msp": pred_msp,
            "pred_cos": pred_cos,
            "pred_dist": pred_dist,
        }


def load_model1_checkpoint(
    model: LeafAI_Model,
    checkpoint_path: Union[str, Path],
    device: Optional[Union[str, torch.device]] = None,
    strict: bool = True,
) -> LeafAI_Model:
    """
    Load checkpoint Model 1.

    Hỗ trợ:
    - Raw state_dict (định dạng notebook đang lưu).
    - Dictionary bọc trong 'state_dict'.
    - Dictionary bọc trong 'model_state_dict'.

    strict=True được giữ mặc định để phát hiện sai kiến trúc/checkpoint,
    không âm thầm bỏ qua tensor thiếu hoặc thừa.
    """
    checkpoint_path = Path(checkpoint_path)

    if not checkpoint_path.is_file():
        raise FileNotFoundError(
            f"Không tìm thấy checkpoint Model 1: {checkpoint_path}"
        )

    if device is None:
        device = next(model.parameters()).device
    device = torch.device(device)

    checkpoint = torch.load(
        checkpoint_path,
        map_location="cpu",
        weights_only=True,
    )

    if not isinstance(checkpoint, dict):
        raise TypeError(
            "Checkpoint không phải dictionary/state_dict hợp lệ."
        )

    if "state_dict" in checkpoint:
        state_dict = checkpoint["state_dict"]
    elif "model_state_dict" in checkpoint:
        state_dict = checkpoint["model_state_dict"]
    else:
        state_dict = checkpoint

    if not isinstance(state_dict, dict):
        raise TypeError("Không tìm thấy state_dict hợp lệ trong checkpoint.")

    # Hỗ trợ checkpoint được lưu từ torch.nn.DataParallel.
    if state_dict and all(
        isinstance(key, str) and key.startswith("module.")
        for key in state_dict.keys()
    ):
        state_dict = {
            key[len("module."):]: value
            for key, value in state_dict.items()
        }

    try:
        model.load_state_dict(state_dict, strict=strict)
    except RuntimeError as exc:
        raise RuntimeError(
            "Không thể load checkpoint Model 1. Hãy kiểm tra num_classes, "
            "kiến trúc và định dạng checkpoint. Chi tiết lỗi:\n"
            f"{exc}"
        ) from exc

    model.to(device)
    model.eval()

    return model


__all__ = [
    "LeafAI_Model",
    "load_model1_checkpoint",
]
