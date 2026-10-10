"""统一序号管理服务。

提供序号的插入、移动、删除、批量重排等操作，使用两阶段位移算法避免 SQLite 唯一索引冲突。

order_index 族与 sequence 族共用私有实现，按列名参数化；两族刻意保留的不对称
（order 族先自愈 NULL、`insert_at` 的位置条件、`delete_and_compact` / `reorder_batch` /
`compact_after_batch_delete` 的位移方向）由 `ensure_initialized` / `direction` 显式表达。
"""

from sqlalchemy import case, func, update, select

from sqlalchemy.orm import Session


class OrderService:
    """统一序号管理服务"""

    SAFE_OFFSET = 100000  # 两阶段位移的临时安全区偏移量

    @staticmethod
    def _ensure_initialized(session: Session, model_class, scope_filter) -> int:
        """确保当前作用域内的 order_index 已初始化（含 partial-NULL 场景）。

        - 全部为 NULL：两阶段回填为 1..n
        - 部分为 NULL：仅补齐 NULL 记录，从 max_order+1 开始
        - 全部已有值：直接返回 max_order

        仅 order 族使用；sequence 族不做自愈。
        """

        record_count = session.query(func.count(model_class.id)).filter(scope_filter).scalar() or 0

        if record_count == 0:
            return 0

        max_order = session.query(func.max(model_class.order_index)).filter(scope_filter).scalar()

        if max_order is None:
            # 全部为 NULL：两阶段回填为 1..n
            records = session.scalars(select(model_class).where(scope_filter).order_by(model_class.id)).all()

            # 阶段 1：先搬到负数安全区，确保中间态不会触发唯一约束
            for idx, current_record in enumerate(records, start=1):
                current_record.order_index = -(OrderService.SAFE_OFFSET + idx)
            session.flush()

            # 阶段 2：按 id 顺序回填为 1..n
            for idx, current_record in enumerate(records, start=1):
                current_record.order_index = idx
            session.flush()

            return len(records)

        # 检查是否存在 partial-NULL（部分记录有值，部分为 NULL）
        null_records = session.scalars(
            select(model_class).where(scope_filter).where(model_class.order_index.is_(None)).order_by(model_class.id)
        ).all()

        if not null_records:
            return max_order

        # partial-NULL：仅补齐 NULL 记录，两阶段避免唯一约束冲突
        for idx, current_record in enumerate(null_records, start=1):
            current_record.order_index = -(OrderService.SAFE_OFFSET + idx)
        session.flush()

        for idx, current_record in enumerate(null_records, start=1):
            current_record.order_index = max_order + idx
        session.flush()

        return max_order + len(null_records)

    @staticmethod
    def _get_next(session: Session, model_class, scope_filter, column, *, ensure_initialized: bool) -> int:
        """下一个可用序号（max + 1）。order 族先自愈，sequence 族直接取 max。"""
        if ensure_initialized:
            return OrderService._ensure_initialized(session, model_class, scope_filter) + 1
        max_value = session.query(func.max(column)).filter(scope_filter).scalar()
        return (max_value or 0) + 1

    @staticmethod
    def get_next_order(session: Session, model_class, scope_filter) -> int:
        """获取下一个可用序号（max + 1）。"""
        return OrderService._get_next(
            session, model_class, scope_filter, model_class.order_index, ensure_initialized=True
        )

    @staticmethod
    def get_next_sequence(session: Session, model_class, scope_filter) -> int:
        """获取下一个可用 sequence（max + 1）。"""
        return OrderService._get_next(
            session, model_class, scope_filter, model_class.sequence, ensure_initialized=False
        )

    @staticmethod
    def _insert_at(session: Session, model_class, scope_filter, record, position: int, column, *, ensure_initialized):
        """在指定位置插入记录，后续记录自动后移。

        order 族先自愈且仅在 `position <= max` 时位移；sequence 族无条件两阶段位移。
        """
        if ensure_initialized:
            max_value = OrderService._ensure_initialized(session, model_class, scope_filter)
        else:
            max_value = session.query(func.max(column)).filter(scope_filter).scalar() or 0

        if not (1 <= position <= max_value + 1):
            raise ValueError(f"Invalid position {position}, valid range: [1, {max_value + 1}]")

        if not ensure_initialized or position <= max_value:
            # 两阶段位移：先挪到安全区
            session.execute(
                update(model_class)
                .where(scope_filter)
                .where(column >= position)
                .values({column: column + OrderService.SAFE_OFFSET})
            )
            session.flush()

            # 回写目标值（原值 + 1）
            session.execute(
                update(model_class)
                .where(scope_filter)
                .where(column >= position + OrderService.SAFE_OFFSET)
                .values({column: column - OrderService.SAFE_OFFSET + 1})
            )
            session.flush()

        # 插入新记录
        setattr(record, column.key, position)
        session.add(record)

    @staticmethod
    def insert_at(session: Session, model_class, scope_filter, record, position: int):
        """在指定位置插入记录，后续记录自动后移。"""
        return OrderService._insert_at(
            session, model_class, scope_filter, record, position, model_class.order_index, ensure_initialized=True
        )

    @staticmethod
    def insert_at_sequence(session: Session, model_class, scope_filter, record, position: int):
        """在指定 sequence 位置插入记录（两阶段算法）。"""
        return OrderService._insert_at(
            session, model_class, scope_filter, record, position, model_class.sequence, ensure_initialized=False
        )

    @staticmethod
    def move_to(session: Session, model_class, scope_filter, record, new_position: int):
        """将记录从当前位置移动到新位置。

        Args:
            session: 数据库会话
            model_class: ORM 模型类
            scope_filter: 作用域过滤条件
            record: 待移动记录
            new_position: 目标序号

        Raises:
            ValueError: 位置越界
        """

        # 历史数据可能整组都是 NULL，先自愈再做位置校验
        max_order = OrderService._ensure_initialized(session, model_class, scope_filter)

        old_position = record.order_index

        if old_position == new_position:
            return  # no-op

        # 校验目标位置合法性
        if not (1 <= new_position <= max_order):
            raise ValueError(f"Invalid position {new_position}, valid range: [1, {max_order}]")

        # 1. 先将当前记录挪到安全区，释放原位置
        record.order_index = 0
        session.flush()

        # 2. 根据移动方向调整区间
        if new_position < old_position:
            # 向前移动：[new, old-1] 区间后移 1 位
            session.execute(
                update(model_class)
                .where(scope_filter)
                .where(model_class.order_index >= new_position)
                .where(model_class.order_index < old_position)
                .values(order_index=model_class.order_index + OrderService.SAFE_OFFSET)
            )
            session.flush()

            session.execute(
                update(model_class)
                .where(scope_filter)
                .where(model_class.order_index >= new_position + OrderService.SAFE_OFFSET)
                .values(order_index=model_class.order_index - OrderService.SAFE_OFFSET + 1)
            )
        else:
            # 向后移动：[old+1, new] 区间前移 1 位
            session.execute(
                update(model_class)
                .where(scope_filter)
                .where(model_class.order_index > old_position)
                .where(model_class.order_index <= new_position)
                .values(order_index=model_class.order_index - OrderService.SAFE_OFFSET)
            )
            session.flush()

            session.execute(
                update(model_class)
                .where(scope_filter)
                .where(model_class.order_index <= new_position - OrderService.SAFE_OFFSET)
                .values(order_index=model_class.order_index + OrderService.SAFE_OFFSET - 1)
            )

        session.flush()

        # 3. 将当前记录写回目标位置
        record.order_index = new_position

    @staticmethod
    def move_to_sequence(session: Session, model_class, scope_filter, record, new_position: int):
        """移动记录到新 sequence 位置（两阶段算法）。"""

        old_position = record.sequence

        if old_position == new_position:
            return

        max_seq = session.query(func.max(model_class.sequence)).filter(scope_filter).scalar() or 0

        if not (1 <= new_position <= max_seq):
            raise ValueError(f"Invalid position {new_position}, valid range: [1, {max_seq}]")

        session.execute(
            update(model_class)
            .where(scope_filter)
            .where(model_class.sequence >= min(old_position, new_position))
            .where(model_class.sequence <= max(old_position, new_position))
            .values(sequence=model_class.sequence + OrderService.SAFE_OFFSET)
        )
        session.flush()

        if new_position < old_position:
            session.execute(
                update(model_class)
                .where(scope_filter)
                .where(model_class.sequence >= new_position + OrderService.SAFE_OFFSET)
                .where(model_class.sequence < old_position + OrderService.SAFE_OFFSET)
                .values(sequence=model_class.sequence - OrderService.SAFE_OFFSET + 1)
            )
        else:
            session.execute(
                update(model_class)
                .where(scope_filter)
                .where(model_class.sequence > old_position + OrderService.SAFE_OFFSET)
                .where(model_class.sequence <= new_position + OrderService.SAFE_OFFSET)
                .values(sequence=model_class.sequence - OrderService.SAFE_OFFSET - 1)
            )
        session.flush()

        record.sequence = new_position

    @staticmethod
    def _delete_and_compact(
        session: Session, model_class, scope_filter, record, column, *, ensure_initialized, direction
    ):
        """删除记录后，后续记录按 `direction` 位移补位（两阶段）。

        order 族（direction=-1）向下位移后修负数；sequence 族（direction=+1）向上位移后修
        `> old + SAFE_OFFSET`。第二阶段的判定谓词两族形状不同，按 direction 分别构造。
        """
        if ensure_initialized:
            OrderService._ensure_initialized(session, model_class, scope_filter)

        old_position = getattr(record, column.key)

        # 1. 删除记录
        session.delete(record)
        session.flush()

        # 2. 后续记录位移 1 位（两阶段位移）
        session.execute(
            update(model_class)
            .where(scope_filter)
            .where(column > old_position)
            .values({column: column + direction * OrderService.SAFE_OFFSET})
        )
        session.flush()

        if direction < 0:
            moved_filter = column < 0
        else:
            moved_filter = column > old_position + OrderService.SAFE_OFFSET

        session.execute(
            update(model_class)
            .where(scope_filter)
            .where(moved_filter)
            .values({column: column - direction * OrderService.SAFE_OFFSET - 1})
        )

    @staticmethod
    def delete_and_compact(session: Session, model_class, scope_filter, record):
        """删除记录后，后续记录自动前移补位。"""
        return OrderService._delete_and_compact(
            session, model_class, scope_filter, record, model_class.order_index, ensure_initialized=True, direction=-1
        )

    @staticmethod
    def delete_and_compact_sequence(session: Session, model_class, scope_filter, record):
        """删除记录并压缩 sequence。"""
        return OrderService._delete_and_compact(
            session, model_class, scope_filter, record, model_class.sequence, ensure_initialized=False, direction=1
        )

    @staticmethod
    def _reorder_batch(session: Session, model_class, scope_filter, id_order_list: list, column, *, direction):
        """批量重排序（拖拽场景）- 使用两阶段算法避免唯一约束冲突。"""
        valid_ids = {row.id for row in session.scalars(select(model_class).where(scope_filter)).all()}

        request_ids = set(id_order_list)

        if len(request_ids) != len(id_order_list):
            raise ValueError("ID 列表包含重复项")

        if not request_ids.issubset(valid_ids):
            raise ValueError("ID 列表包含不属于当前作用域的记录")

        if request_ids != valid_ids:
            raise ValueError("ID 列表不完整，必须包含作用域内所有记录")

        session.execute(
            update(model_class).where(scope_filter).values({column: column + direction * OrderService.SAFE_OFFSET})
        )
        session.flush()

        if not id_order_list:
            return
        # 单条批量回填：按 id 映射序号（1..n），等价于逐条赋值，
        # WHERE 仍带 scope_filter，越权 id 不会被命中。
        order_case = case(
            {record_id: idx for idx, record_id in enumerate(id_order_list, start=1)},
            value=model_class.id,
        )
        session.execute(
            update(model_class)
            .where(scope_filter)
            .where(model_class.id.in_(id_order_list))
            .values({column: order_case})
        )

    @staticmethod
    def reorder_batch(session: Session, model_class, scope_filter, id_order_list: list):
        """批量重排序（拖拽场景）- 使用两阶段算法避免唯一约束冲突。"""
        return OrderService._reorder_batch(
            session, model_class, scope_filter, id_order_list, model_class.order_index, direction=-1
        )

    @staticmethod
    def reorder_batch_sequence(session: Session, model_class, scope_filter, id_order_list: list):
        """批量重排 sequence（两阶段算法 + 作用域校验）。"""
        return OrderService._reorder_batch(
            session, model_class, scope_filter, id_order_list, model_class.sequence, direction=1
        )

    @staticmethod
    def _compact_after_batch_delete(session: Session, model_class, scope_filter, column, *, direction):
        """批量删除后压缩序号（两阶段算法避免唯一约束冲突）。"""
        records = session.scalars(select(model_class).where(scope_filter).order_by(column, model_class.id)).all()

        # 两阶段：先移到安全区，再写回 1..n
        session.execute(
            update(model_class).where(scope_filter).values({column: column + direction * OrderService.SAFE_OFFSET})
        )
        session.flush()

        for idx, record in enumerate(records, start=1):
            setattr(record, column.key, idx)

    @staticmethod
    def compact_after_batch_delete(session: Session, model_class, scope_filter):
        """批量删除后压缩序号（两阶段算法避免唯一约束冲突）。"""
        return OrderService._compact_after_batch_delete(
            session, model_class, scope_filter, model_class.order_index, direction=-1
        )

    @staticmethod
    def compact_after_batch_delete_sequence(session: Session, model_class, scope_filter):
        """批量删除后压缩 sequence（两阶段算法）。"""
        return OrderService._compact_after_batch_delete(
            session, model_class, scope_filter, model_class.sequence, direction=1
        )
