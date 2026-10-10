"""`OrderService` sequence 族方法的行为特征测试（characterization tests）。

锁定 sequence 族（`*_sequence`）的现有算法与「不做 order 族自愈」的不对称性，
作为 R5「平行方法按列参数化合并」改造的回归网。全部用例在改造前即为绿色。

关键不对称（不得在合并中丢失）：
- order 族先 `_ensure_initialized`（回填 NULL），sequence 族不做；
- `insert_at` 仅在 `position <= max_order` 时位移，`insert_at_sequence` 无条件位移；
- `delete_and_compact` 向下位移（修负数），sequence 版向上位移（修 `> old + SAFE_OFFSET`）；
- `reorder_batch` / `compact_after_batch_delete` 两族仅位移符号相反。
"""

from __future__ import annotations

from typing import Optional

import pytest
from sqlalchemy import Integer, UniqueConstraint, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

from src.services.order_service import OrderService


class ModelBase(DeclarativeBase):
    """测试专用 Base。"""


class SeqItem(ModelBase):
    __tablename__ = "seq_item"
    __table_args__ = (UniqueConstraint("scope_id", "sequence"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    scope_id: Mapped[int] = mapped_column(Integer, nullable=False)
    sequence: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)


class OrderItem(ModelBase):
    __tablename__ = "order_item"
    __table_args__ = (UniqueConstraint("scope_id", "order_index"),)

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


def _seed_seq(session: Session, sequences: list[Optional[int]]) -> list[SeqItem]:
    items = [SeqItem(scope_id=1, sequence=sequence) for sequence in sequences]
    session.add_all(items)
    session.flush()
    return items


def _seq_map(session: Session) -> dict:
    session.flush()
    rows = session.scalars(select(SeqItem).order_by(SeqItem.id)).all()
    return {item.id: item.sequence for item in rows}


def _seed_order(session: Session, orders: list[Optional[int]]) -> list[OrderItem]:
    items = [OrderItem(scope_id=1, order_index=order) for order in orders]
    session.add_all(items)
    session.flush()
    return items


def _order_map(session: Session) -> dict:
    session.flush()
    rows = session.scalars(select(OrderItem).order_by(OrderItem.id)).all()
    return {item.id: item.order_index for item in rows}


# ---------------------------------------------------------------- get_next


def test_get_next_sequence_is_max_plus_one(session: Session) -> None:
    _seed_seq(session, [3, 1, 2])

    assert OrderService.get_next_sequence(session, SeqItem, SeqItem.scope_id == 1) == 4


def test_get_next_sequence_does_not_heal_nulls(session: Session) -> None:
    items = _seed_seq(session, [None, 5])

    assert OrderService.get_next_sequence(session, SeqItem, SeqItem.scope_id == 1) == 6
    assert _seq_map(session) == {items[0].id: None, items[1].id: 5}


def test_get_next_sequence_all_null_returns_one_without_backfill(session: Session) -> None:
    items = _seed_seq(session, [None, None])

    assert OrderService.get_next_sequence(session, SeqItem, SeqItem.scope_id == 1) == 1
    assert _seq_map(session) == {items[0].id: None, items[1].id: None}


def test_get_next_order_heals_all_nulls_where_sequence_does_not(session: Session) -> None:
    """order 族自愈 NULL，sequence 族不回填 —— 合并时必须保留该不对称。"""
    order_items = _seed_order(session, [None, None])
    seq_items = _seed_seq(session, [None, None])

    assert OrderService.get_next_order(session, OrderItem, OrderItem.scope_id == 1) == 3
    assert _order_map(session) == {order_items[0].id: 1, order_items[1].id: 2}

    assert OrderService.get_next_sequence(session, SeqItem, SeqItem.scope_id == 1) == 1
    assert _seq_map(session) == {seq_items[0].id: None, seq_items[1].id: None}


# ---------------------------------------------------------------- insert_at


def test_insert_at_sequence_shifts_into_position(session: Session) -> None:
    items = _seed_seq(session, [1, 2, 3])
    new_item = SeqItem(scope_id=1)

    OrderService.insert_at_sequence(session, SeqItem, SeqItem.scope_id == 1, new_item, 2)

    assert _seq_map(session) == {
        items[0].id: 1,
        new_item.id: 2,
        items[1].id: 3,
        items[2].id: 4,
    }


def test_insert_at_sequence_appends_at_end(session: Session) -> None:
    items = _seed_seq(session, [1, 2])
    new_item = SeqItem(scope_id=1)

    OrderService.insert_at_sequence(session, SeqItem, SeqItem.scope_id == 1, new_item, 3)

    assert _seq_map(session) == {items[0].id: 1, items[1].id: 2, new_item.id: 3}


def test_insert_at_sequence_rejects_out_of_range(session: Session) -> None:
    _seed_seq(session, [1, 2])
    new_item = SeqItem(scope_id=1)

    with pytest.raises(ValueError, match=r"valid range: \[1, 3\]"):
        OrderService.insert_at_sequence(session, SeqItem, SeqItem.scope_id == 1, new_item, 4)


def test_insert_at_sequence_does_not_heal_nulls(session: Session) -> None:
    items = _seed_seq(session, [None, 2])
    new_item = SeqItem(scope_id=1)

    OrderService.insert_at_sequence(session, SeqItem, SeqItem.scope_id == 1, new_item, 1)

    # 无条件位移把 seq=2 挪到 3；NULL 行不被自愈
    assert _seq_map(session) == {items[0].id: None, items[1].id: 3, new_item.id: 1}


# ---------------------------------------------------------------- move_to


def test_move_to_sequence_forward(session: Session) -> None:
    items = _seed_seq(session, [1, 2, 3])

    OrderService.move_to_sequence(session, SeqItem, SeqItem.scope_id == 1, items[0], 3)

    assert _seq_map(session) == {items[0].id: 3, items[1].id: 1, items[2].id: 2}


def test_move_to_sequence_backward(session: Session) -> None:
    items = _seed_seq(session, [1, 2, 3])

    OrderService.move_to_sequence(session, SeqItem, SeqItem.scope_id == 1, items[2], 1)

    assert _seq_map(session) == {items[0].id: 2, items[1].id: 3, items[2].id: 1}


def test_move_to_sequence_noop_when_same_position(session: Session) -> None:
    items = _seed_seq(session, [1, 2, 3])

    OrderService.move_to_sequence(session, SeqItem, SeqItem.scope_id == 1, items[1], 2)

    assert _seq_map(session) == {items[0].id: 1, items[1].id: 2, items[2].id: 3}


def test_move_to_sequence_rejects_out_of_range(session: Session) -> None:
    items = _seed_seq(session, [1, 2, 3])

    with pytest.raises(ValueError, match=r"valid range: \[1, 3\]"):
        OrderService.move_to_sequence(session, SeqItem, SeqItem.scope_id == 1, items[0], 4)


# ------------------------------------------------------- delete_and_compact


def test_delete_and_compact_sequence_compacts_following_rows(session: Session) -> None:
    items = _seed_seq(session, [1, 2, 3, 4])

    OrderService.delete_and_compact_sequence(session, SeqItem, SeqItem.scope_id == 1, items[1])

    assert _seq_map(session) == {items[0].id: 1, items[2].id: 2, items[3].id: 3}


# ------------------------------------------------- compact_after_batch_delete


def test_compact_after_batch_delete_sequence(session: Session) -> None:
    items = _seed_seq(session, [1, 2, 3, 4, 5])
    session.delete(items[1])
    session.delete(items[3])
    session.flush()

    OrderService.compact_after_batch_delete_sequence(session, SeqItem, SeqItem.scope_id == 1)

    assert _seq_map(session) == {items[0].id: 1, items[2].id: 2, items[4].id: 3}
