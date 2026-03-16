import random
import re
from datetime import datetime
from unittest.mock import patch

import src.utils as utils
from src.utils import generate_code


def test_generate_code_uses_six_char_alnum_suffix() -> None:
    code = generate_code("CL")
    assert re.fullmatch(r"CL_\d{14}_[A-Z0-9]{6}", code)


def test_generate_code_stays_unique_within_fixed_second_batch() -> None:
    """同秒批量生成10000个code，验证无碰撞（回归测试：原3位后缀约1%碰撞率）"""
    state = random.getstate()
    random.seed(0)
    try:
        frozen_now = datetime(2026, 3, 16, 12, 0, 0)
        with patch.object(utils, "datetime") as mock_datetime:
            mock_datetime.now.return_value = frozen_now
            codes = {generate_code("CL") for _ in range(10000)}
    finally:
        random.setstate(state)

    assert len(codes) == 10000
