import logging
import sqlite3
from pathlib import Path

from sqlalchemy import create_engine, text

from src.database import _normalize_log_row_presentation


def test_normalize_log_row_presentation_resets_only_log_rows(tmp_path: Path) -> None:
    db_path = tmp_path / "log-row.db"
    conn = sqlite3.connect(str(db_path))
    conn.execute(
        """
        CREATE TABLE form_field (
            id INTEGER PRIMARY KEY,
            form_id INTEGER NOT NULL,
            field_definition_id INTEGER,
            is_log_row INTEGER NOT NULL DEFAULT 0,
            order_index INTEGER NOT NULL,
            label_override TEXT,
            bg_color TEXT,
            text_color TEXT,
            label_bold INTEGER NOT NULL DEFAULT 1,
            label_font_size TEXT
        )
        """
    )
    conn.execute(
        "INSERT INTO form_field (id, form_id, field_definition_id, is_log_row, order_index, label_override, bg_color, text_color, label_bold, label_font_size) "
        "VALUES (1, 1, NULL, 1, 1, '自定义log', 'FF0000', '00FF00', 0, 'small')"
    )
    conn.execute(
        "INSERT INTO form_field (id, form_id, field_definition_id, is_log_row, order_index, label_override, bg_color, text_color, label_bold, label_font_size) "
        "VALUES (2, 1, 10, 0, 2, '普通字段', '123456', '654321', 0, 'large')"
    )
    conn.commit()
    conn.close()

    engine = create_engine(f"sqlite+pysqlite:///{db_path.as_posix()}")
    _normalize_log_row_presentation(engine)

    with engine.connect() as db:
        log_row = db.execute(
            text(
                "SELECT label_override, bg_color, text_color, label_bold, label_font_size "
                "FROM form_field WHERE id = 1"
            )
        ).one()
        normal_row = db.execute(
            text(
                "SELECT label_override, bg_color, text_color, label_bold, label_font_size "
                "FROM form_field WHERE id = 2"
            )
        ).one()

    assert log_row == ("以下为log行", None, None, 1, None)
    assert normal_row == ("普通字段", "123456", "654321", 0, "large")


def test_normalize_log_row_presentation_is_idempotent(tmp_path: Path, caplog) -> None:
    db_path = tmp_path / "log-row-idempotent.db"
    conn = sqlite3.connect(str(db_path))
    conn.execute(
        """
        CREATE TABLE form_field (
            id INTEGER PRIMARY KEY,
            form_id INTEGER NOT NULL,
            field_definition_id INTEGER,
            is_log_row INTEGER NOT NULL DEFAULT 0,
            order_index INTEGER NOT NULL,
            label_override TEXT,
            bg_color TEXT,
            text_color TEXT,
            label_bold INTEGER NOT NULL DEFAULT 1,
            label_font_size TEXT
        )
        """
    )
    conn.execute(
        "INSERT INTO form_field (id, form_id, field_definition_id, is_log_row, order_index, label_override, bg_color, text_color, label_bold, label_font_size) "
        "VALUES (1, 1, NULL, 1, 1, NULL, NULL, NULL, 1, NULL)"
    )
    conn.commit()
    conn.close()

    engine = create_engine(f"sqlite+pysqlite:///{db_path.as_posix()}")

    caplog.set_level(logging.INFO, logger="src.database")
    _normalize_log_row_presentation(engine)
    caplog.clear()

    _normalize_log_row_presentation(engine)

    assert "已重置" not in caplog.text
