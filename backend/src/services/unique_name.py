"""复制 / 导入改名梯子（copy-name ladder）的通用助手。

各组调用点保留自己的后缀模板与查重范围（逐候选 DB 探测 / 预取名称集合 /
内存集合），此处只收敛「首候选 → 编号候选 → …」的循环本身。
"""

from typing import Callable


def first_free_name(
    first: str,
    numbered: Callable[[int], str],
    is_taken: Callable[[str], bool],
    start: int,
) -> str:
    """返回首个未被占用的候选名。

    首候选 `first` 未被占用则直接返回；否则依次试 numbered(start)、
    numbered(start + 1)、…，返回第一个未被占用的候选。
    后缀模板、编号位置与起始编号均由调用方给定，本函数不做统一。
    """
    if not is_taken(first):
        return first

    index = start
    while True:
        candidate = numbered(index)
        if not is_taken(candidate):
            return candidate
        index += 1
