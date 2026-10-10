"""Export a deterministic, representative Word document corpus for refactor checks."""

from __future__ import annotations

import argparse
import sys
import zipfile
from pathlib import Path, PurePosixPath
from typing import Any

sys.path.insert(0, str(Path.cwd()))

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from src.models import Base
from src.models.codelist import CodeList, CodeListOption
from src.models.field_definition import FieldDefinition
from src.models.form import Form
from src.models.form_field import FormField
from src.models.project import Project
from src.models.unit import Unit
from src.models.visit import Visit
from src.models.visit_form import VisitForm
from src.services.export_service import ExportService


def create_form(
    session: Session,
    project_id: int,
    *,
    name: str,
    code: str,
    order_index: int,
    orientation: str = "auto",
    domain: str = "DM",
    annotation_positions: str | None = None,
) -> Form:
    form = Form(
        project_id=project_id,
        name=name,
        code=code,
        order_index=order_index,
        paper_orientation=orientation,
        domain=domain,
        annotation_positions=annotation_positions,
    )
    session.add(form)
    session.flush()
    return form


def create_field(
    session: Session,
    project_id: int,
    form: Form,
    *,
    order_index: int,
    variable_name: str,
    label: str,
    field_type: str = "文本",
    inline: bool = False,
    default_value: str | None = None,
    label_override: str | None = None,
    field_attrs: dict[str, Any] | None = None,
    row_attrs: dict[str, Any] | None = None,
) -> FormField:
    field_definition = FieldDefinition(
        project_id=project_id,
        variable_name=variable_name,
        label=label,
        field_type=field_type,
        **(field_attrs or {}),
    )
    session.add(field_definition)
    session.flush()
    form_field = FormField(
        form_id=form.id,
        field_definition_id=field_definition.id,
        order_index=order_index,
        inline_mark=int(inline),
        default_value=default_value,
        label_override=label_override,
        **(row_attrs or {}),
    )
    session.add(form_field)
    session.flush()
    return form_field


def create_structure_row(
    session: Session,
    form: Form,
    *,
    order_index: int,
    is_log_row: bool = False,
    label_override: str | None = None,
    row_attrs: dict[str, Any] | None = None,
    field_definition: FieldDefinition | None = None,
) -> FormField:
    row = FormField(
        form_id=form.id,
        field_definition_id=field_definition.id if field_definition else None,
        order_index=order_index,
        is_log_row=int(is_log_row),
        label_override=label_override,
        **(row_attrs or {}),
    )
    session.add(row)
    session.flush()
    return row


def create_choice_list(session: Session, project_id: int, *, empty: bool = False) -> CodeList:
    suffix = "EMPTY" if empty else "CHOICES"
    codelist = CodeList(project_id=project_id, name=f"Golden {suffix}", code=f"GOLD_{suffix}")
    session.add(codelist)
    session.flush()
    if not empty:
        session.add_all(
            [
                CodeListOption(codelist_id=codelist.id, code="1", decode="是", order_index=1),
                CodeListOption(codelist_id=codelist.id, code="2", decode="否", order_index=2),
            ]
        )
        session.flush()
    return codelist


ControlSpec = tuple[str, str, str, dict[str, Any], str | None]


def choice_control_specs(choices: CodeList) -> list[ControlSpec]:
    return [
        ("GOLD_RADIO", "水平单选", "单选", {"codelist_id": choices.id}, None),
        ("GOLD_MULTI", "水平多选", "多选", {"codelist_id": choices.id}, None),
        ("GOLD_VRADIO", "纵向单选", "单选（纵向）", {"codelist_id": choices.id}, None),
        ("GOLD_VMULTI", "纵向多选", "多选（纵向）", {"codelist_id": choices.id}, None),
        ("GOLD_DROPDOWN", "下拉选择", "下拉框", {"codelist_id": choices.id}, None),
    ]


def value_control_specs(unit: Unit) -> list[ControlSpec]:
    return [
        ("GOLD_TEXT_UNIT", "带单位文本", "文本", {"unit_id": unit.id}, "默认第一行\n默认第二行"),
        (
            "GOLD_NUMBER",
            "带单位数值",
            "数值",
            {"integer_digits": 4, "decimal_digits": 2, "unit_id": unit.id},
            "12.50",
        ),
        ("GOLD_DATE", "日期", "日期", {"date_format": "yyyy-MM-dd"}, None),
        ("GOLD_DATETIME_MIN", "日期时间分钟", "日期时间", {"date_format": "yyyy-MM-dd HH:mm"}, None),
        ("GOLD_DATETIME_HOUR", "日期时间小时", "日期时间", {"date_format": "yyyy-MM-dd HH"}, None),
        ("GOLD_TIME_SEC", "时间秒", "时间", {"date_format": "HH:mm:ss"}, None),
        ("GOLD_TIME_HOUR", "时间小时", "时间", {"date_format": "HH"}, None),
    ]


def other_control_specs(empty_choices: CodeList) -> list[ControlSpec]:
    return [
        ("GOLD_EMPTY_CHOICES", "空选项单选", "单选", {"codelist_id": empty_choices.id}, None),
        ("GOLD_CHECKED", "复选标签", "复选", {"checkbox_label": "已核实"}, None),
        ("GOLD_CHECK_DEFAULT", "复选默认", "复选", {"checkbox_label": None}, None),
    ]


def seed_standard_controls(
    session: Session,
    project_id: int,
    form: Form,
    choices: CodeList,
    empty_choices: CodeList,
    unit: Unit,
) -> None:
    specs = choice_control_specs(choices) + value_control_specs(unit) + other_control_specs(empty_choices)
    for order_index, (variable, label, field_type, attrs, default) in enumerate(specs, start=1):
        create_field(
            session,
            project_id,
            form,
            order_index=order_index,
            variable_name=variable,
            label=label,
            field_type=field_type,
            default_value=default,
            field_attrs=attrs,
        )


def seed_structure_rows(session: Session, project_id: int, form: Form) -> None:
    create_structure_row(
        session,
        form,
        order_index=16,
        is_log_row=True,
        label_override="日志行覆盖文字",
        row_attrs={"bg_color": "E7D9C1", "text_color": "663300"},
    )
    create_structure_row(
        session,
        form,
        order_index=17,
        is_log_row=True,
        row_attrs={"bg_color": "D9EAF7", "text_color": "123456"},
    )
    custom_label = FieldDefinition(
        project_id=project_id,
        variable_name="GOLD_LABEL_CUSTOM",
        label="自定义章节标题",
        field_type="标签",
    )
    default_label = FieldDefinition(
        project_id=project_id,
        variable_name="GOLD_LABEL_DEFAULT",
        label="默认章节标题",
        field_type="标签",
    )
    session.add_all([custom_label, default_label])
    session.flush()
    create_structure_row(
        session,
        form,
        order_index=18,
        label_override="章节标题覆盖",
        row_attrs={"bg_color": "FCE4D6", "text_color": "7F6000"},
        field_definition=custom_label,
    )
    create_structure_row(session, form, order_index=19, field_definition=default_label)


def seed_legacy_portrait_form(session: Session, project_id: int, choices: CodeList) -> Form:
    form = create_form(
        session,
        project_id,
        name="Legacy portrait controls",
        code="GOLD_LEGACY_PORTRAIT",
        order_index=1,
        annotation_positions='{"_form":{"y":25},"GOLD_TEXT_UNIT":{"y":-40}}',
    )
    empty_choices = create_choice_list(session, project_id, empty=True)
    unit = Unit(project_id=project_id, symbol="kg", code="GOLD_KG")
    session.add(unit)
    session.flush()
    seed_standard_controls(session, project_id, form, choices, empty_choices, unit)
    seed_structure_rows(session, project_id, form)
    return form


def create_forced_landscape_form(session: Session, project_id: int) -> Form:
    form = create_form(
        session,
        project_id,
        name="Legacy forced landscape",
        code="GOLD_FORCE_LANDSCAPE",
        order_index=2,
        orientation="landscape",
    )
    create_field(
        session,
        project_id,
        form,
        order_index=1,
        variable_name="GOLD_FORCE_TEXT",
        label="强制横向字段",
    )
    return form


def seed_inline_layout_forms(session: Session, project_id: int) -> dict[str, Form]:
    temporary = create_inline_only_form(session, project_id, order=4, code="GOLD_TEMP_LANDSCAPE")
    forced_portrait = create_inline_only_form(
        session,
        project_id,
        order=5,
        code="GOLD_FORCE_PORTRAIT",
        orientation="portrait",
    )
    return {
        "legacy temporary landscape": temporary,
        "legacy force_portrait": forced_portrait,
    }


def seed_layout_forms(
    session: Session,
    project: Project,
    choices: CodeList,
) -> tuple[dict[str, Form], dict[str, Any]]:
    portrait = seed_legacy_portrait_form(session, project.id, choices)
    forced_landscape = create_forced_landscape_form(session, project.id)
    mixed = create_mixed_form(session, project.id, choices)
    empty = create_form(
        session,
        project.id,
        name="Empty legacy form",
        code="GOLD_EMPTY_FORM",
        order_index=6,
    )
    forms = {
        "legacy portrait": portrait,
        "legacy force_landscape": forced_landscape,
        "mixed_landscape": mixed,
        **seed_inline_layout_forms(session, project.id),
        "empty legacy": empty,
    }
    overrides = {
        str(portrait.id): {"normal": [0.42, 0.58]},
        str(mixed.id): {
            "normal": [0.45, 0.55],
            "inline": [0.12, 0.18, 0.20, 0.22, 0.28],
        },
    }
    return forms, overrides


def create_mixed_form(session: Session, project_id: int, choices: CodeList) -> Form:
    form = create_form(
        session,
        project_id,
        name="Auto mixed landscape",
        code="GOLD_MIXED_LANDSCAPE",
        order_index=3,
        domain="VS",
        annotation_positions='{"_form":{"y":15},"GOLD_MIXED_REG":{"y":-35}}',
    )
    create_field(
        session,
        project_id,
        form,
        order_index=1,
        variable_name="GOLD_MIXED_REG",
        label="常规字段",
    )
    inline_specs = [
        ("GOLD_INLINE_TEXT", "内联文本", "文本", {}, "第一行\n第二行"),
        ("GOLD_INLINE_RADIO", "内联单选", "单选", {"codelist_id": choices.id}, None),
        ("GOLD_INLINE_DATE", "内联日期", "日期", {"date_format": "yyyy-MM-dd"}, None),
        ("GOLD_INLINE_NUMBER", "内联数值", "数值", {"integer_digits": 3, "decimal_digits": 1}, None),
        ("GOLD_INLINE_END", "内联末列", "文本", {}, None),
    ]
    for order_index, (variable, label, field_type, attrs, default) in enumerate(inline_specs, start=2):
        create_field(
            session,
            project_id,
            form,
            order_index=order_index,
            variable_name=variable,
            label=label,
            field_type=field_type,
            inline=True,
            default_value=default,
            field_attrs=attrs,
        )
    return form


def create_inline_only_form(
    session: Session,
    project_id: int,
    *,
    order: int,
    code: str,
    orientation: str = "auto",
) -> Form:
    form = create_form(
        session,
        project_id,
        name=f"Inline only {order}",
        code=code,
        order_index=order,
        orientation=orientation,
    )
    for index in range(1, 7):
        create_field(
            session,
            project_id,
            form,
            order_index=index,
            variable_name=f"{code}_FIELD_{index}",
            label=f"第{index}列",
            inline=True,
            default_value="预填值" if index == 1 else None,
        )
    return form


def seed_visits(session: Session, project_id: int, forms: dict[str, Form]) -> None:
    visits = [
        Visit(project_id=project_id, name="筛选访视", code="GOLD_VISIT_1", sequence=1),
        Visit(project_id=project_id, name="治疗访视", code="GOLD_VISIT_2", sequence=2),
    ]
    session.add_all(visits)
    session.flush()
    visit_forms = [
        VisitForm(visit_id=visits[0].id, form_id=forms["legacy portrait"].id, sequence=1),
        VisitForm(visit_id=visits[0].id, form_id=forms["legacy force_landscape"].id, sequence=2),
        VisitForm(visit_id=visits[0].id, form_id=forms["mixed_landscape"].id, sequence=3),
        VisitForm(visit_id=visits[1].id, form_id=forms["legacy portrait"].id, sequence=1),
        VisitForm(visit_id=visits[1].id, form_id=forms["legacy temporary landscape"].id, sequence=2),
        VisitForm(visit_id=visits[1].id, form_id=forms["legacy force_portrait"].id, sequence=3),
    ]
    session.add_all(visit_forms)
    session.flush()


def seed_project(session: Session) -> tuple[Project, dict[str, Form], dict[str, Any]]:
    project = Project(name="Export golden project", version="1.0")
    session.add(project)
    session.flush()
    choices = create_choice_list(session, project.id)
    forms, overrides = seed_layout_forms(session, project, choices)
    seed_visits(session, project.id, forms)
    session.commit()
    return project, forms, overrides


def dump_docx_entries(docx_path: Path, output_dir: Path) -> int:
    output_dir.mkdir(parents=True)
    count = 0
    with zipfile.ZipFile(docx_path) as archive:
        for info in archive.infolist():
            entry = PurePosixPath(info.filename)
            if entry.is_absolute() or ".." in entry.parts:
                raise ValueError(f"unsafe zip entry path: {info.filename}")
            target = output_dir.joinpath(*entry.parts)
            if info.is_dir():
                target.mkdir(parents=True, exist_ok=True)
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(archive.read(info))
            count += 1
    return count


def export_pair(session: Session, project_id: int, output_dir: Path, overrides: dict[str, Any]) -> None:
    for annotated, label in ((False, "plain"), (True, "annotated")):
        docx_path = output_dir / f"{label}.docx"
        service = ExportService(session)
        ok = service.export_project_to_word(
            project_id,
            str(docx_path),
            column_width_overrides=overrides,
            annotated=annotated,
            bake_toc_page_numbers=False,
        )
        if not ok:
            raise RuntimeError(f"Word export failed for {label}: {docx_path}")
        count = dump_docx_entries(docx_path, output_dir / label)
        print(f"{label}: {count} decompressed zip entries -> {output_dir / label}")


def read_entries(root: Path) -> dict[str, bytes]:
    entries: dict[str, bytes] = {}
    for label in ("plain", "annotated"):
        directory = root / label
        if not directory.is_dir():
            raise FileNotFoundError(f"missing extracted entry directory: {directory}")
        for path in directory.rglob("*"):
            if path.is_file():
                entries[path.relative_to(root).as_posix()] = path.read_bytes()
    return entries


def compare_entries(directory_a: Path, directory_b: Path) -> int:
    first = read_entries(directory_a)
    second = read_entries(directory_b)
    names = sorted(set(first) | set(second))
    differing = [name for name in names if first.get(name) != second.get(name)]
    print(f"entries compared: {len(names)}; differing: {len(differing)}")
    for name in differing:
        print(f"DIFF {name}")
    return 1 if differing else 0


def print_layout_coverage(session: Session, forms: dict[str, Form]) -> None:
    service = ExportService(session)
    print("Layout mode coverage:")
    for coverage_label, form in forms.items():
        layout = service._classify_form_layout(
            form.form_fields,
            paper_orientation=form.paper_orientation,
        )
        print(
            f"  {coverage_label}: {layout.mode}; "
            f"force_landscape={layout.force_landscape}; force_portrait={layout.force_portrait}"
        )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, help="new output directory for plain and annotated exports")
    parser.add_argument("--compare", nargs=2, type=Path, metavar=("DIR_A", "DIR_B"))
    args = parser.parse_args()
    if (args.out is None) == (args.compare is None):
        parser.error("provide exactly one of --out or --compare")
    return args


def run_export(output_dir: Path) -> int:
    output_dir.mkdir(parents=True, exist_ok=False)
    engine: Engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    try:
        with Session(engine, expire_on_commit=False) as session:
            project, forms, overrides = seed_project(session)
            print_layout_coverage(session, forms)
            export_pair(session, project.id, output_dir, overrides)
    finally:
        engine.dispose()
    print(f"Export corpus saved under {output_dir}")
    return 0


def main() -> int:
    args = parse_args()
    if args.compare:
        return compare_entries(args.compare[0], args.compare[1])
    return run_export(args.out)


if __name__ == "__main__":
    raise SystemExit(main())
