from datetime import time

import pytest
from pydantic import ValidationError

from models.profile import ProfileUpdate


def test_profile_rejects_unknown_timezone():
    with pytest.raises(ValidationError):
        ProfileUpdate(timezone="Not/A_Real_Zone")


def test_profile_rejects_invalid_complete_day_range():
    with pytest.raises(ValidationError):
        ProfileUpdate(day_start=time(22), day_end=time(7))
