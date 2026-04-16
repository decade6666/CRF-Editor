from typing import Optional

import pytest
from sqlalchemy import Integer, UniqueConstraint, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

from src.services.order_service import OrderService


class ModelBase(DeclarativeBase):
    """测试专用 Base。"""


class FakeItem(ModelBase):
    """用于验证 OrderService 行为的最小模型。"""

    __tablename__ = "fake_item"
    __table_args__ = (
        UniqueConstraint("scope_id", "order_index"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    scope_id: Mapped[int] = mapped_column(Integer, nullable=False)
    order_index: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)


@pytest.fixture
def session() -> Session:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    ModelBase.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)

    with session_factory() as db_session:
        yield db_session

    engine.dispose()


def seed_items(session: Session, orders: list[Optional[int]], scope_id: int = 1) -> list[FakeItem]:
    items = [
        FakeItem(scope_id=scope_id, order_index=order_index)
        for order_index in orders
    ]
    session.add_all(items)
    session.flush()
    return items


def get_scope_items(session: Session, scope_id: int = 1) -> list[FakeItem]:
    stmt = (
        select(FakeItem)
        .where(FakeItem.scope_id == scope_id)
        .order_by(FakeItem.order_index, FakeItem.id)
    )
    return list(session.scalars(stmt).all())


def get_scope_orders(session: Session, scope_id: int = 1) -> list[int]:
    return [item.order_index for item in get_scope_items(session, scope_id)]


def test_delete_compact_null_order(session: Session) -> None:
    items = seed_items(session, [None, None, None])

    OrderService.delete_and_compact(session, FakeItem, FakeItem.scope_id == 1, items[0])

    assert get_scope_orders(session) == [1, 2]


def test_delete_compact_partial_null(session: Session) -> None:
    items = seed_items(session, [1, None, 2, None])

    OrderService.delete_and_compact(session, FakeItem, FakeItem.scope_id == 1, items[1])

    assert get_scope_orders(session) == [1, 2, 3]


def test_get_next_order_all_null(session: Session) -> None:
    seed_items(session, [None, None])

    next_order = OrderService.get_next_order(session, FakeItem, FakeItem.scope_id == 1)

    assert next_order == 3
    assert get_scope_orders(session) == [1, 2]


def test_get_next_order_partial_null(session: Session) -> None:
    seed_items(session, [1, None])

    next_order = OrderService.get_next_order(session, FakeItem, FakeItem.scope_id == 1)

    assert next_order == 3
    assert get_scope_orders(session) == [1, 2]


def test_insert_at_null_scope(session: Session) -> None:
    seed_items(session, [None, None])
    new_item = FakeItem(scope_id=1)

    OrderService.insert_at(session, FakeItem, FakeItem.scope_id == 1, new_item, 1)
    session.flush()

    assert new_item.order_index == 1
    assert get_scope_orders(session) == [1, 2, 3]


def test_move_to_null_scope(session: Session) -> None:
    items = seed_items(session, [None, None, None])

    OrderService.move_to(session, FakeItem, FakeItem.scope_id == 1, items[2], 1)
    session.flush()

    order_map = {item.id: item.order_index for item in get_scope_items(session)}
    assert order_map == {
        items[2].id: 1,
        items[0].id: 2,
        items[1].id: 3,
    }


def test_compact_after_batch_delete(session: Session) -> None:
    items = seed_items(session, [1, 2, 3, 4, 5])
    session.delete(items[1])
    session.delete(items[3])
    session.flush()

    OrderService.compact_after_batch_delete(session, FakeItem, FakeItem.scope_id == 1)
    session.flush()

    assert get_scope_orders(session) == [1, 2, 3]


def test_reorder_batch_validates_ids(session: Session) -> None:
    items = seed_items(session, [1, 2, 3])

    with pytest.raises(ValueError, match="不属于当前作用域"):
        OrderService.reorder_batch(
            session,
            FakeItem,
            FakeItem.scope_id == 1,
            [items[0].id, items[1].id, 999],
        )


def test_reorder_batch_validates_duplicate_ids(session: Session) -> None:
    """验证 duplicate ID 不改状态。"""
    items = seed_items(session, [1, 2, 3])
    original_orders = get_scope_orders(session)

    with pytest.raises(ValueError, match="包含重复项"):
        OrderService.reorder_batch(
            session,
            FakeItem,
            FakeItem.scope_id == 1,
            [items[0].id, items[1].id, items[0].id],  # 重复 ID
        )

    # 状态不变
    assert get_scope_orders(session) == original_orders
