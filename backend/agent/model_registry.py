from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

ProviderType = Literal["google", "groq", "openai"]


@dataclass(frozen=True)
class ModelDescriptor:
    id: str
    name: str
    provider: ProviderType
    tier: Literal["top", "balanced", "speed", "safety"]
    tier_label: str
    intelligence_score: float  # Scale 1.0 - 10.0
    supports_vision: bool
    supports_tools: bool
    description: str
    badge_color: str


# Model list arranged in strict DESCENDING ORDER of intelligence and reasoning capabilities
ORDERED_MODELS: list[ModelDescriptor] = [
    # Tier 1: Top Intelligence (Deep Reasoning & Multimodal Excellence)
    ModelDescriptor(
        id="gemini-2.5-flash",
        name="Gemini 2.5 Flash",
        provider="google",
        tier="top",
        tier_label="Thông minh cao cấp",
        intelligence_score=9.8,
        supports_vision=True,
        supports_tools=True,
        description="Hiểu tiếng Việt sâu sắc nhất, đọc ảnh thời khóa biểu xuất sắc",
        badge_color="#d93662",
    ),
    ModelDescriptor(
        id="llama-3.3-70b-versatile",
        name="Llama 3.3 70B",
        provider="groq",
        tier="top",
        tier_label="Thông minh cao cấp",
        intelligence_score=9.6,
        supports_vision=False,
        supports_tools=True,
        description="Mô hình 70B mã nguồn mở mạnh mẽ nhất của Meta",
        badge_color="#7c3aed",
    ),
    ModelDescriptor(
        id="deepseek-r1-distill-llama-70b",
        name="DeepSeek R1 Distill 70B",
        provider="groq",
        tier="top",
        tier_label="Tư duy chuỗi suy luận",
        intelligence_score=9.5,
        supports_vision=False,
        supports_tools=True,
        description="Suy luận logic chuyên sâu (Chain of Thought)",
        badge_color="#0284c7",
    ),
    # Tier 2: Balanced & Fast (High-quality Lightweight Reasoning)
    ModelDescriptor(
        id="gemini-2.5-flash-lite",
        name="Gemini 2.5 Flash Lite",
        provider="google",
        tier="balanced",
        tier_label="Cân bằng & Tốc độ",
        intelligence_score=9.2,
        supports_vision=True,
        supports_tools=True,
        description="Siêu nhẹ thế hệ 2.5, phản hồi cực nhanh, tối ưu token",
        badge_color="#0f8f83",
    ),
    ModelDescriptor(
        id="gemini-2.0-flash",
        name="Gemini 2.0 Flash",
        provider="google",
        tier="balanced",
        tier_label="Cân bằng & Tốc độ",
        intelligence_score=9.0,
        supports_vision=True,
        supports_tools=True,
        description="Bản Flash tiêu chuẩn thế hệ 2.0, xử lý đa bước ổn định",
        badge_color="#5656d8",
    ),
    # Tier 3: Speed & Lightweight (High Quota & Instant Response)
    ModelDescriptor(
        id="gemini-2.0-flash-lite",
        name="Gemini 2.0 Flash Lite",
        provider="google",
        tier="speed",
        tier_label="Siêu nhẹ & Quota cao",
        intelligence_score=8.7,
        supports_vision=True,
        supports_tools=True,
        description="Bản Lite 2.0 tiết kiệm, hạn mức request dồi dào",
        badge_color="#df5a27",
    ),
    ModelDescriptor(
        id="gemma-2-9b-it",
        name="Gemma 2 9B",
        provider="groq",
        tier="speed",
        tier_label="Gọn nhẹ hiệu năng",
        intelligence_score=8.5,
        supports_vision=False,
        supports_tools=True,
        description="Model 9B gọn nhẹ của Google chạy trên chip LPU siêu tốc",
        badge_color="#059669",
    ),
    ModelDescriptor(
        id="llama-3.1-8b-instant",
        name="Llama 3.1 8B Instant",
        provider="groq",
        tier="speed",
        tier_label="Phản hồi tức thì",
        intelligence_score=8.2,
        supports_vision=False,
        supports_tools=True,
        description="Tốc độ 800 từ/giây, trả lời tức thì cho câu hỏi nhanh",
        badge_color="#d97706",
    ),
    # Tier 4: Safety Net Legacy Fallback
    ModelDescriptor(
        id="gemini-1.5-flash",
        name="Gemini 1.5 Flash",
        provider="google",
        tier="safety",
        tier_label="Dự phòng tầng cuối",
        intelligence_score=8.0,
        supports_vision=True,
        supports_tools=True,
        description="Mô hình thế hệ 1.5 bền bỉ, lưới an toàn chống nghẽn",
        badge_color="#64748b",
    ),
]

MODEL_MAP: dict[str, ModelDescriptor] = {model.id: model for model in ORDERED_MODELS}


def get_available_models(has_groq_key: bool = False) -> list[ModelDescriptor]:
    """Return list of models available given configured providers, sorted in descending intelligence."""
    if has_groq_key:
        return list(ORDERED_MODELS)
    return [m for m in ORDERED_MODELS if m.provider == "google"]


def resolve_fallback_chain(
    requested_model: str | None,
    has_images: bool = False,
    has_groq_key: bool = False,
) -> list[ModelDescriptor]:
    """Resolve cascading fallback chain in strict descending order of intelligence."""
    available = get_available_models(has_groq_key=has_groq_key)

    # If user selected a specific model, place it first, followed by descending fallbacks
    if requested_model and requested_model != "auto":
        if requested_model in MODEL_MAP:
            primary = MODEL_MAP[requested_model]
            remaining = [m for m in available if m.id != requested_model]
            if has_images:
                chain = [m for m in [primary, *remaining] if m.supports_vision]
                return chain or [MODEL_MAP["gemini-2.5-flash"]]
            return [primary, *remaining]
        # Custom / test model ID
        return [
            ModelDescriptor(
                id=requested_model,
                name=requested_model,
                provider="google",
                tier="balanced",
                tier_label="Tùy chỉnh",
                intelligence_score=9.0,
                supports_vision=True,
                supports_tools=True,
                description="Mô hình tùy chỉnh",
                badge_color="#64748b",
            )
        ]

    # Auto Mode:
    # If images are present, prioritize vision models in descending order
    if has_images:
        return [m for m in available if m.supports_vision]

    # Otherwise return the full available list sorted by intelligence descending
    return available
