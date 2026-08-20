from unittest.mock import patch

import pytest
from fastapi import HTTPException

from db.rate_limit import SlidingWindowLimiter


def test_sliding_window_rate_limit():
    limiter = SlidingWindowLimiter(limit=2, window_seconds=60)
    with patch("db.rate_limit.monotonic", side_effect=[0, 1, 2, 61]):
        limiter.check("user")
        limiter.check("user")
        with pytest.raises(HTTPException) as error:
            limiter.check("user")
        assert error.value.status_code == 429
        limiter.check("user")
