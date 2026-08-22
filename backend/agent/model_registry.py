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
    # Tier 1: Speed & High Quota (Sub-second latency ~800ms, Excellent Multimodal & Tool Support)
    ModelDescriptor(
        id="gemini-3.5-flash-lite",
        name="Gemini 3.5 Flash Lite",
        provider="google",
        tier="top",
        tier_label="Siêu tốc độ & Khuyên dùng",
        intelligence_score=9.8,
        supports_vision=True,
        supports_tools=True,
        description="Phản hồi cực nhanh (<1s), quota dồi dào, đọc ảnh & xếp lịch thông minh",
        badge_color="#0f8f83",
    ),
    ModelDescriptor(
        id="gemini-flash-lite-latest",
        name="Gemini Flash Lite",
        provider="google",
        tier="top",
        tier_label="Tốc độ cao nhất",
        intelligence_score=9.7,
        supports_vision=True,
        supports_tools=True,
        description="Bản Lite mới nhất (~700ms), hạn mức request lớn và ổn định",
        badge_color="#df5a27",
    ),
    ModelDescriptor(
        id="gemini-3.5-flash",
        name="Gemini 3.5 Flash",
        provider="google",
        tier="top",
        tier_label="Thông minh toàn diện",
        intelligence_score=9.6,
        supports_vision=True,
        supports_tools=True,
        description="Hiểu tiếng Việt sâu sắc, xử lý lịch học & deadline nhiều bước",
        badge_color="#e11d48",
    ),
    ModelDescriptor(
        id="gemini-3.6-flash",
        name="Gemini 3.6 Flash",
        provider="google",
        tier="balanced",
        tier_label="Suy luận chuyên sâu",
        intelligence_score=9.5,
        supports_vision=True,
        supports_tools=True,
        description="Thế hệ Flash 3.6 mới nhất, tư duy logic chuyên sâu",
        badge_color="#d93662",
    ),
    ModelDescriptor(
        id="llama-3.3-70b-versatile",
        name="Llama 3.3 70B",
        provider="groq",
        tier="balanced",
        tier_label="Mã nguồn mở mạnh mẽ",
        intelligence_score=9.4,
        supports_vision=False,
        supports_tools=True,
        description="Mô hình 70B mã nguồn mở mạnh mẽ nhất của Meta trên Groq LPU",
        badge_color="#7c3aed",
    ),
    ModelDescriptor(
        id="deepseek-r1-distill-llama-70b",
        name="DeepSeek R1 Distill 70B",
        provider="groq",
        tier="balanced",
        tier_label="Tư duy chuỗi suy luận",
        intelligence_score=9.3,
        supports_vision=False,
        supports_tools=True,
        description="Suy luận logic chuyên sâu (Chain of Thought)",
        badge_color="#0284c7",
    ),
    ModelDescriptor(
        id="gemini-flash-latest",
        name="Gemini Flash Latest",
        provider="google",
        tier="balanced",
        tier_label="Cân bằng & Đa năng",
        intelligence_score=9.0,
        supports_vision=True,
        supports_tools=True,
        description="Bản Flash tiêu chuẩn tự động cập nhật, ổn định",
        badge_color="#5656d8",
    ),
    # Tier 3: Speed & High Quota
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
]

MODEL_MAP: dict[str, ModelDescriptor] = {model.id: model for model in ORDERED_MODELS}

MODEL_ALIASES: dict[str, str] = {
    "gemini-2.5-flash": "gemini-3.6-flash",
    "gemini-2.5-flash-lite": "gemini-3.5-flash-lite",
    "gemini-2.0-flash": "gemini-flash-latest",
    "gemini-2.0-flash-lite": "gemini-flash-lite-latest",
    "gemini-1.5-flash": "gemini-flash-latest",
    "gemini-1.5-flash-8b": "gemini-flash-lite-latest",
}


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

    raw_req = requested_model or "auto"
    target_id = MODEL_ALIASES.get(raw_req, raw_req)

    # If user selected a specific model, place it first, followed by descending fallbacks
    if target_id and target_id != "auto":
        if target_id in MODEL_MAP:
            primary = MODEL_MAP[target_id]
            remaining = [m for m in available if m.id != target_id]
            if has_images:
                chain = [m for m in [primary, *remaining] if m.supports_vision]
                return chain or [ORDERED_MODELS[0]]
            return [primary, *remaining]
        # Custom / test model ID
        return [
            ModelDescriptor(
                id=target_id,
                name=target_id,
                provider="google",
                tier="balanced",
                tier_label="Tùy chỉnh",
                intelligence_score=9.0,
                supports_vision=True,
                supports_tools=True,
                description="Mô hình tùy chỉnh",
                badge_color="#64748b",
            ),
            *available,
        ]

    # Auto Mode:
    # If images are present, prioritize vision models in descending order
    if has_images:
        return [m for m in available if m.supports_vision]

    # Otherwise return the full available list sorted by intelligence descending
    return available
