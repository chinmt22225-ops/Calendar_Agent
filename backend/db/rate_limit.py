from collections import defaultdict, deque
from threading import Lock
from time import monotonic
from uuid import UUID

from fastapi import Depends, HTTPException, status

from db.auth import get_current_user_id


class SlidingWindowLimiter:
    def __init__(self, limit: int, window_seconds: float):
        self.limit = limit
        self.window_seconds = window_seconds
        self._requests: dict[str, deque[float]] = defaultdict(deque)
        self._lock = Lock()

    def check(self, key: str) -> None:
        now = monotonic()
        with self._lock:
            requests = self._requests[key]
            cutoff = now - self.window_seconds
            while requests and requests[0] <= cutoff:
                requests.popleft()
            if len(requests) >= self.limit:
                retry_after = max(1, int(self.window_seconds - (now - requests[0])))
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Bạn đã gửi quá nhanh. Vui lòng thử lại sau ít phút.",
                    headers={"Retry-After": str(retry_after)},
                )
            requests.append(now)


chat_limiter = SlidingWindowLimiter(limit=10, window_seconds=60)


def enforce_chat_rate_limit(user_id: UUID = Depends(get_current_user_id)) -> None:
    chat_limiter.check(str(user_id))
