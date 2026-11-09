"""
LEAFAI - MODEL 2 (Custom CNN)
Kiến trúc CustomLeafCNN + Maximum Softmax Probability (MSP) Open-Set Recognition.

Phục vụ triển khai Backend/FastAPI.
Đảm bảo tuân thủ tuyệt đối kiến trúc từ notebook, không có mã huấn luyện.
"""

import os
import json
import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np
import cv2
import torchvision.transforms as T
from typing import Tuple, Dict, Any, List, Union


class CustomLeafCNN(nn.Module):
    """
    Kiến trúc CustomLeafCNN với 5 blocks tích chập.
    Block 1-4 chứa MaxPool2d. Block 5 KHÔNG chứa MaxPool2d.
    """
    def __init__(self, num_classes: int = 17):
        super(CustomLeafCNN, self).__init__()
        
        # Block 1: 3 -> 32
        self.block1 = nn.Sequential(
            nn.Conv2d(3, 32, kernel_size=3, padding=1),
            nn.BatchNorm2d(32),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(kernel_size=2, stride=2)
        )
        
        # Block 2: 32 -> 64
        self.block2 = nn.Sequential(
            nn.Conv2d(32, 64, kernel_size=3, padding=1),
            nn.BatchNorm2d(64),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(kernel_size=2, stride=2)
        )
        
        # Block 3: 64 -> 128
        self.block3 = nn.Sequential(
            nn.Conv2d(64, 128, kernel_size=3, padding=1),
            nn.BatchNorm2d(128),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(kernel_size=2, stride=2)
        )
        
        # Block 4: 128 -> 256
        self.block4 = nn.Sequential(
            nn.Conv2d(128, 256, kernel_size=3, padding=1),
            nn.BatchNorm2d(256),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(kernel_size=2, stride=2)
        )
        
        # Block 5: 256 -> 512 (KHÔNG CÓ MaxPool2d)
        self.block5 = nn.Sequential(
            nn.Conv2d(256, 512, kernel_size=3, padding=1),
            nn.BatchNorm2d(512),
            nn.ReLU(inplace=True)
        )
        
        # Global Pooling, Dropout & Classifier
        self.adaptive_pool = nn.AdaptiveAvgPool2d(1)
        self.flatten = nn.Flatten()
        self.dropout = nn.Dropout(p=0.5)
        self.classifier = nn.Linear(512, num_classes)

    def forward(self, x: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        x = self.block1(x)
        x = self.block2(x)
        x = self.block3(x)
        x = self.block4(x)
        x = self.block5(x)
        
        x = self.adaptive_pool(x)
        features = self.flatten(x)
        
        out = self.dropout(features)
        logits = self.classifier(out)
        
        return logits, features

    @torch.no_grad()
    def predict_open_set(
        self, 
        tensor_batch: torch.Tensor, 
        msp_threshold: float,
        class_names: List[str]
    ) -> List[Dict[str, Any]]:
        """
        Inference và nhận diện Open-set bằng MSP.
        Hỗ trợ xử lý theo batch.
        """
        self.eval()
        logits, features = self.forward(tensor_batch)
        probs = F.softmax(logits, dim=1)
        
        # Tính toán top 3
        top3_probs, top3_indices = torch.topk(probs, k=3, dim=1)
        
        results = []
        for i in range(tensor_batch.size(0)):
            best_prob = top3_probs[i][0].item()
            best_idx = top3_indices[i][0].item()
            
            top3 = [
                {"class": class_names[top3_indices[i][j].item()], "prob": top3_probs[i][j].item()}
                for j in range(3)
            ]
            
            if best_prob >= msp_threshold:
                status = "KNOWN"
                pred_class = class_names[best_idx]
            else:
                status = "UNKNOWN"
                pred_class = "Rejected (UNKNOWN)" # Cách ly rõ ràng với 17 lớp
                
            results.append({
                "status": status,
                "predicted_class_idx": best_idx if status == "KNOWN" else -1,
                "predicted_class": pred_class,
                "confidence_msp": best_prob,
                "msp_threshold": msp_threshold,
                "top_3_predictions": top3,
                "probabilities": probs[i].tolist()
            })
            
        return results


# =========================================================================
# HELPER FUNCTIONS: PREPROCESSING & LOADING
# =========================================================================

def apply_preprocessing(image_bgr: np.ndarray) -> torch.Tensor:
    """
    Tiền xử lý ảnh gốc: BGR -> RGB -> LAB (CLAHE L-channel) -> RGB -> Resize -> Normalize.
    Đảm bảo CLAHE chỉ được áp dụng ĐÚNG MỘT LẦN.
    """
    if image_bgr is None:
        raise ValueError("Ảnh đầu vào không hợp lệ (None).")
        
    # 1. BGR sang RGB
    image_rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
    
    # 2. CLAHE trên không gian LAB (Chỉ lấy kênh L)
    lab = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    cl = clahe.apply(l)
    limg = cv2.merge((cl, a, b))
    image_clahe = cv2.cvtColor(limg, cv2.COLOR_LAB2RGB)
    
    # 3. Transform torchvision (Resize -> ToTensor Float32 -> Normalize)
    transform = T.Compose([
        T.ToPILImage(),
        T.Resize((224, 224)),
        T.ToTensor(),  # Tự động scale [0, 1] và đổi thành Float32
        T.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
    ])
    
    tensor = transform(image_clahe).unsqueeze(0)  # Thêm Batch Dimension
    return tensor


def load_threshold(json_path: str) -> float:
    if not os.path.exists(json_path):
        raise FileNotFoundError(f"Không tìm thấy file threshold: {json_path}")
    
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
        
    msp_thresh = data.get("msp_thresh")
    # Kiểm tra null hoặc chưa được hiệu chuẩn
    if msp_thresh is None:
        raise ValueError("LỖI: msp_thresh trong file JSON đang bị null hoặc thiếu. "
                         "Bắt buộc phải hiệu chuẩn (calibrate) ngưỡng trước khi deploy!")
    return float(msp_thresh)


def load_class_names(json_path: str) -> List[str]:
    if not os.path.exists(json_path):
        raise FileNotFoundError(f"Không tìm thấy file class names: {json_path}")
        
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    # Lấy từ "class_names" theo cấu hình preprocessing
    class_names = data.get("class_names")
    if not class_names or len(class_names) != 17:
        raise ValueError("Lỗi cấu hình class_names. Dự án LEAFAI yêu cầu đúng 17 lớp.")
    return class_names


def load_model2_checkpoint(model: nn.Module, checkpoint_path: str, device: torch.device):
    """
    Tải trọng số, phát hiện Bundle vs Raw State Dict.
    Quản lý lỗi thiếu key / lệch shape rõ ràng.
    """
    if not os.path.exists(checkpoint_path):
        raise FileNotFoundError(f"Không tìm thấy checkpoint tại: {checkpoint_path}")
        
    checkpoint = torch.load(checkpoint_path, map_location=device, weights_only=True)
    
    # Phân tách nếu đây là Complete Bundle
    if isinstance(checkpoint, dict) and "model_state_dict" in checkpoint:
        state_dict = checkpoint["model_state_dict"]
    else:
        state_dict = checkpoint
        
    try:
        model.load_state_dict(state_dict, strict=True)
    except RuntimeError as e:
        error_msg = str(e)
        print("❌ LỖI KHÔNG TƯƠNG THÍCH CHECKPOINT VÀ KIẾN TRÚC!")
        if "Missing key(s)" in error_msg:
            print(f"⚠️ Các Layer bị thiếu trong checkpoint:\n {error_msg.split('Missing key(s) in state_dict:')[1].split('Unexpected')[0]}")
        if "Unexpected key(s)" in error_msg:
            print(f"⚠️ Các Layer dư thừa không khớp kiến trúc:\n {error_msg.split('Unexpected key(s) in state_dict:')[1]}")
        if "size mismatch" in error_msg:
            print("⚠️ Sai lệch dimension. Vui lòng kiểm tra lại Linear Layer hoặc số lượng Channels.")
        raise e

    model.to(device)
    model.eval()
    return model


# =========================================================================
# KIỂM THỬ (TESTING BLOCK)
# =========================================================================
if __name__ == "__main__":
    print("Khởi chạy bộ test Model 2 (LEAFAI)...")
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    
    # 1. Test cấu trúc mạng và Forward
    model2 = CustomLeafCNN(num_classes=17).to(device)
    dummy_input = torch.randn(2, 3, 224, 224).to(device)  # Batch size = 2
    logits, features = model2(dummy_input)
    
    print("\n--- 1. Kiểm tra Tensor Shape ---")
    assert logits.shape == (2, 17), f"❌ Sai Shape Logits: {logits.shape}"
    assert features.shape == (2, 512), f"❌ Sai Shape Features: {features.shape}"
    print("✅ Forward Dimension [Batch, Channels, Height, Width] hoàn toàn chính xác.")
    
    # 2. Test logic OSR với giả lập dữ liệu
    print("\n--- 2. Kiểm tra Open-Set Logic (MSP) ---")
    dummy_class_names = [f"Class_{i}" for i in range(17)]
    
    # Ép một logits cao rõ ràng để giả lập KNOWN
    logits[0, 5] = 100.0  
    # Để logits phân bố đều để giả lập UNKNOWN
    logits[1] = 0.0       
    
    results = model2.predict_open_set(dummy_input, msp_threshold=0.9657, class_names=dummy_class_names)
    
    assert results[0]["status"] == "KNOWN", "❌ Mẫu tự tin cao bị từ chối."
    assert results[1]["status"] == "UNKNOWN", "❌ Mẫu tự tin thấp không bị từ chối."
    assert results[1]["predicted_class"] == "Rejected (UNKNOWN)", "❌ Nhãn UNKNOWN không được cách ly."
    
    print(f"✅ Mẫu 1 (High Confidence): {results[0]['status']} - {results[0]['predicted_class']}")
    print(f"✅ Mẫu 2 (Low Confidence): {results[1]['status']} - {results[1]['predicted_class']}")
    
    print("\n✅ MỌI TEST CASE ĐỀU VƯỢT QUA! FILE ĐÃ SẴN SÀNG CHO FASTAPI.")