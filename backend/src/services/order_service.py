"""
统一序号管理服务

提供序号的插入、移动、删除、批量重排等操作，
使用两阶段位移算法避免 SQLite 唯一索引冲突。
"""
from sqlalchemy import func, update, select
from sqlalchemy.orm import Session


class OrderService:
    """统一序号管理服务"""

    SAFE_OFFSET = 100000  # 两阶段位移的临时安全区偏移量

    @staticmethod
    def get_next_order(session: Session, model_class, scope_filter) -> int:
        """
        获取下一个可用序号（max + 1）

        Args:
            session: 数据库会话
            model_class: ORM 模型类
            scope_filter: 作用域过滤条件（如 Model.project_id == 1）

        Returns:
            下一个可用序号
        """
        max_order = session.query(func.max(model_class.order_index)).filter(scope_filter).scalar()
        return (max_order or 0) + 1

    @staticmethod
    def insert_at(session: Session, model_class, scope_filter, record, position: int):
        """
        在指定位置插入记录，后续记录自动后移

        Args:
            session: 数据库会话
            model_class: ORM 模型类
            scope_filter: 作用域过滤条件
            record: 待插入记录
            position: 目标序号（1-based）

        Raises:
            ValueError: 位置越界
        """
        # 1. 校验目标位置合法性
        max_order = session.query(func.max(model_class.order_index)).filter(scope_filter).scalar() or 0
        if not (1 <= position <= max_order + 1):
            raise ValueError(f"Invalid position {position}, valid range: [1, {max_order + 1}]")

        if position <= max_order:
            # 2. 两阶段位移：先挪到安全区
            session.execute(
                update(model_class)
                .where(scope_filter)
                .where(model_class.order_index >= position)
                .values(order_index=model_class.order_index + OrderService.SAFE_OFFSET)
            )
            session.flush()

            # 3. 回写目标值（原值 + 1）
            session.execute(
                update(model_class)
                .where(scope_filter)
                .where(model_class.order_index >= position + OrderService.SAFE_OFFSET)
                .values(order_index=model_class.order_index - OrderService.SAFE_OFFSET + 1)
            )
            session.flush()

        # 4. 插入新记录
        record.order_index = position
        session.add(record)

    @staticmethod
    def move_to(session: Session, model_class, scope_filter, record, new_position: int):
        """
        将记录从当前位置移动到新位置

        Args:
            session: 数据库会话
            model_class: ORM 模型类
            scope_filter: 作用域过滤条件
            record: 待移动记录
            new_position: 目标序号

        Raises:
            ValueError: 位置越界
        """
        old_position = record.order_index

        if old_position == new_position:
            return  # no-op

        # 校验目标位置合法性
        max_order = session.query(func.max(model_class.order_index)).filter(scope_filter).scalar() or 0
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
    def delete_and_compact(session: Session, model_class, scope_filter, record):
        """
        删除记录后，后续记录自动前移补位

        Args:
            session: 数据库会话
            model_class: ORM 模型类
            scope_filter: 作用域过滤条件
            record: 待删除记录
        """
        old_position = record.order_index

        # 1. 删除记录
        session.delete(record)
        session.flush()

        # 2. 后续记录前移 1 位（两阶段位移）
        session.execute(
            update(model_class)
            .where(scope_filter)
            .where(model_class.order_index > old_position)
            .values(order_index=model_class.order_index - OrderService.SAFE_OFFSET)
        )
        session.flush()
        session.execute(
            update(model_class)
            .where(scope_filter)
            .where(model_class.order_index < 0)
            .values(order_index=model_class.order_index + OrderService.SAFE_OFFSET - 1)
        )

    @staticmethod
    def reorder_batch(session: Session, model_class, scope_filter, id_order_list: list):
        """
        批量重排序（拖拽场景）- 使用两阶段算法避免唯一约束冲突

        Args:
            session: 数据库会话
            model_class: ORM 模型类
            scope_filter: 作用域过滤条件
            id_order_list: 按新顺序排列的 ID 列表
        """
        # 1. 校验：查询当前作用域的所有合法 ID
        valid_ids = {
            row.id for row in session.scalars(
                select(model_class).where(scope_filter)
            ).all()
        }

        # 2. 校验：请求的 ID 必须全部属于当前作用域，且无重复
        request_ids = set(id_order_list)
        if len(request_ids) != len(id_order_list):
            raise ValueError("ID 列表包含重复项")
        if not request_ids.issubset(valid_ids):
            raise ValueError("ID 列表包含不属于当前作用域的记录")
        if request_ids != valid_ids:
            raise ValueError("ID 列表不完整，必须包含作用域内所有记录")

        # 3. 两阶段重排：先搬到安全区，再写回最终值
        # 阶段 1：把参与重排的记录搬到负数安全区
        session.execute(
            update(model_class)
            .where(scope_filter)
            .values(order_index=model_class.order_index - OrderService.SAFE_OFFSET)
        )
        session.flush()

        # 阶段 2：按新顺序写入最终序号
        for idx, record_id in enumerate(id_order_list, start=1):
            session.execute(
                update(model_class)
                .where(model_class.id == record_id)
                .where(scope_filter)  # 双重保险：同时校验作用域
                .values(order_index=idx)
            )

    # ========== Visit 专用方法（使用 sequence 字段）==========

    @staticmethod
    def get_next_sequence(session: Session, model_class, scope_filter) -> int:
        """获取下一个可用 sequence（max + 1）"""
        max_seq = session.query(func.max(model_class.sequence)).filter(scope_filter).scalar()
        return (max_seq or 0) + 1

    @staticmethod
    def insert_at_sequence(session: Session, model_class, scope_filter, record, position: int):
        """在指定 sequence 位置插入记录（两阶段算法）"""
        max_seq = session.query(func.max(model_class.sequence)).filter(scope_filter).scalar() or 0
        if not (1 <= position <= max_seq + 1):
            raise ValueError(f"Invalid position {position}, valid range: [1, {max_seq + 1}]")

        session.execute(
            update(model_class)
            .where(scope_filter)
            .where(model_class.sequence >= position)
            .values(sequence=model_class.sequence + OrderService.SAFE_OFFSET)
        )
        session.flush()
        session.execute(
            update(model_class)
            .where(scope_filter)
            .where(model_class.sequence >= position + OrderService.SAFE_OFFSET)
            .values(sequence=model_class.sequence - OrderService.SAFE_OFFSET + 1)
        )
        session.flush()
        record.sequence = position
        session.add(record)

    @staticmethod
    def move_to_sequence(session: Session, model_class, scope_filter, record, new_position: int):
        """移动记录到新 sequence 位置（两阶段算法）"""
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
    def delete_and_compact_sequence(session: Session, model_class, scope_filter, record):
        """删除记录并压缩 sequence"""
        old_position = record.sequence
        session.delete(record)
        session.flush()
        session.execute(
            update(model_class)
            .where(scope_filter)
            .where(model_class.sequence > old_position)
            .values(sequence=model_class.sequence - 1)
        )

    @staticmethod
    def reorder_batch_sequence(session: Session, model_class, scope_filter, id_order_list: list):
        """批量重排 sequence（两阶段算法 + 作用域校验）"""
        from sqlalchemy import select
        valid_ids = {
            row.id for row in session.scalars(
                select(model_class).where(scope_filter)
            ).all()
        }
        request_ids = set(id_order_list)
        if len(request_ids) != len(id_order_list):
            raise ValueError("ID 列表包含重复项")
        if not request_ids.issubset(valid_ids):
            raise ValueError("ID 列表包含不属于当前作用域的记录")
        if request_ids != valid_ids:
            raise ValueError("ID 列表不完整，必须包含作用域内所有记录")
        session.execute(
            update(model_class)
            .where(scope_filter)
            .values(sequence=model_class.sequence - OrderService.SAFE_OFFSET)
        )
        session.flush()
        for idx, record_id in enumerate(id_order_list, start=1):
            session.execute(
                update(model_class)
                .where(model_class.id == record_id)
                .where(scope_filter)
                .values(sequence=idx)
            )

    @staticmethod
    def compact_after_batch_delete(session: Session, model_class, scope_filter):
        """批量删除后压缩序号（两阶段算法避免唯一约束冲突）"""
        records = session.scalars(
            select(model_class).where(scope_filter).order_by(model_class.order_index, model_class.id)
        ).all()

        # 两阶段：先移到安全区，再写回 1..n
        session.execute(
            update(model_class)
            .where(scope_filter)
            .values(order_index=model_class.order_index - OrderService.SAFE_OFFSET)
        )
        session.flush()

        for idx, record in enumerate(records, start=1):
            record.order_index = idx

    @staticmethod
    def compact_after_batch_delete_sequence(session: Session, model_class, scope_filter):
        """批量删除后压缩 sequence（两阶段算法）"""
        records = session.scalars(
            select(model_class).where(scope_filter).order_by(model_class.sequence, model_class.id)
        ).all()

        session.execute(
            update(model_class)
            .where(scope_filter)
            .values(sequence=model_class.sequence - OrderService.SAFE_OFFSET)
        )
        session.flush()

        for idx, record in enumerate(records, start=1):
            record.sequence = idx
