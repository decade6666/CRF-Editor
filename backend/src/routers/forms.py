"""Forms Router"""

from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.database import get_session
from src.dependencies import get_current_user, verify_form_owner, verify_project_owner
from src.models.form import Form
from src.models.form_field import FormField
from src.models.user import User
from src.repositories.base_repository import BaseRepository
from src.schemas import BatchDeleteRequest
from src.schemas.form import (
    FormCreate,
    FormResponse,
    FormUpdate,
    preserve_annotation_positions_storage,
    serialize_annotation_positions,
)
from src.services.order_service import OrderService


router = APIRouter(tags=["forms"])


def _build_invalid_annotation_positions_http_error(form: Form, exc: Exception) -> HTTPException:
    return HTTPException(
        409,
        f"表单 {form.id} 的 annotation_positions 数据非法，无法读取：{exc}",
    )


def _serialize_form_response(form: Form) -> FormResponse:
    try:
        return FormResponse.model_validate(form)
    except ValidationError as exc:
        raise _build_invalid_annotation_positions_http_error(form, exc) from exc


def _normalize_form_payload(payload: dict) -> dict:
    normalized = dict(payload)
    if "annotation_positions" in normalized:
        normalized["annotation_positions"] = serialize_annotation_positions(
            normalized["annotation_positions"]
        )
    return normalized


def _apply_form_update(form: Form, data: FormUpdate, session: Session) -> Form:
    old_order = form.order_index
    payload = _normalize_form_payload(
        data.model_dump(exclude={"order_index"}, exclude_unset=True)
    )

    for key, value in payload.items():
        setattr(form, key, value)

    if data.order_index is not None and data.order_index != old_order:
        OrderService.move_to(
            session,
            Form,
            Form.project_id == form.project_id,
            form,
            data.order_index,
        )

    session.flush()
    return form


@router.get("/projects/{project_id}/forms", response_model=List[FormResponse])
def list_forms(
    project_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    verify_project_owner(project_id, current_user, session)
    stmt = select(Form).where(Form.project_id == project_id).order_by(Form.order_index, Form.id)
    return [_serialize_form_response(form) for form in session.scalars(stmt).all()]


@router.post("/projects/{project_id}/forms", response_model=FormResponse, status_code=201)
def create_form(
    project_id: int,
    data: FormCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    verify_project_owner(project_id, current_user, session)

    from src.utils import generate_code

    dump = _normalize_form_payload(data.model_dump(exclude={"order_index"}))
    if not dump.get("code"):
        dump["code"] = generate_code("FORM")

    form = Form(project_id=project_id, **dump)

    if data.order_index is None:
        form.order_index = OrderService.get_next_order(
            session,
            Form,
            Form.project_id == project_id,
        )
        session.add(form)
    else:
        OrderService.insert_at(
            session,
            Form,
            Form.project_id == project_id,
            form,
            data.order_index,
        )

    session.flush()
    return _serialize_form_response(form)


@router.put("/forms/{form_id}", response_model=FormResponse)
def update_form(
    form_id: int,
    data: FormUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    form = verify_form_owner(form_id, current_user, session)
    return _serialize_form_response(_apply_form_update(form, data, session))


@router.patch("/forms/{form_id}", response_model=FormResponse)
def patch_form(
    form_id: int,
    data: FormUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    form = verify_form_owner(form_id, current_user, session)
    return _serialize_form_response(_apply_form_update(form, data, session))


@router.get("/forms/{form_id}/references")
def get_form_references(
    form_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """查询表单被哪些访视引用"""

    verify_form_owner(form_id, current_user, session)

    from src.models.visit import Visit
    from src.models.visit_form import VisitForm

    stmt = (
        select(Visit.name)
        .join(VisitForm, VisitForm.visit_id == Visit.id)
        .where(VisitForm.form_id == form_id)
    )
    return [{"visit_name": row[0]} for row in session.execute(stmt).all()]


@router.delete("/forms/{form_id}", status_code=204)
def delete_form(
    form_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    form = verify_form_owner(form_id, current_user, session)

    from src.models.visit_form import VisitForm

    ref = session.scalar(select(VisitForm.id).where(VisitForm.form_id == form_id).limit(1))
    if ref is not None:
        raise HTTPException(409, "该表单被访视引用，无法删除")

    OrderService.delete_and_compact(session, Form, Form.project_id == form.project_id, form)


@router.post("/projects/{project_id}/forms/batch-delete")
def batch_delete_forms(
    project_id: int,
    data: BatchDeleteRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    verify_project_owner(project_id, current_user, session)

    from src.models.visit_form import VisitForm

    ref_ids = set(
        session.scalars(
            select(VisitForm.form_id).where(VisitForm.form_id.in_(data.ids))
        ).all()
    )
    if ref_ids:
        raise HTTPException(409, "部分表单被访视引用，无法删除")

    count = BaseRepository(session, Form).batch_delete(data.ids, project_id=project_id)
    OrderService.compact_after_batch_delete(session, Form, Form.project_id == project_id)
    return {"deleted": count}


@router.post("/projects/{project_id}/forms/batch-references")
def batch_form_references(
    project_id: int,
    data: BatchDeleteRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """批量查询表单引用"""

    verify_project_owner(project_id, current_user, session)

    from src.models.visit import Visit
    from src.models.visit_form import VisitForm

    valid_form_ids = set(
        session.scalars(
            select(Form.id).where(Form.project_id == project_id, Form.id.in_(data.ids))
        ).all()
    )
    stmt = (
        select(VisitForm.form_id, Visit.name)
        .join(Visit, Visit.id == VisitForm.visit_id)
        .where(VisitForm.form_id.in_(valid_form_ids))
    )

    result = {}
    for row in session.execute(stmt).all():
        result.setdefault(row[0], []).append({"visit_name": row[1]})
    return result


@router.post("/projects/{project_id}/forms/reorder")
def reorder_forms(
    project_id: int,
    id_list: List[int],
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """批量重排序号（拖拽场景）"""

    verify_project_owner(project_id, current_user, session)
    OrderService.reorder_batch(session, Form, Form.project_id == project_id, id_list)
    return {"message": "Reordered"}


@router.post("/forms/{form_id}/copy", response_model=FormResponse, status_code=201)
def copy_form(
    form_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """复制表单及其所有字段，name 加 _copy 后缀（冲突时追加数字）"""

    src = verify_form_owner(form_id, current_user, session)

    base = src.name + "_copy"
    candidate = base
    idx = 1
    while session.scalar(
        select(Form).where(Form.project_id == src.project_id, Form.name == candidate)
    ):
        candidate = f"{base}{idx}"
        idx += 1

    from src.utils import generate_code

    try:
        annotation_positions = preserve_annotation_positions_storage(
            src.annotation_positions
        )
    except ValueError as exc:
        raise HTTPException(409, f"源表单 annotation_positions 数据非法，无法复制：{exc}") from exc

    new_form = Form(
        project_id=src.project_id,
        name=candidate,
        code=generate_code("FORM"),
        domain=src.domain,
        design_notes=src.design_notes,
        annotation_positions=annotation_positions,
        paper_orientation=src.paper_orientation,
    )

    new_form.order_index = OrderService.get_next_order(
        session,
        Form,
        Form.project_id == src.project_id,
    )
    session.add(new_form)
    session.flush()

    src_fields = list(
        session.scalars(
            select(FormField)
            .where(FormField.form_id == form_id)
            .order_by(FormField.order_index)
        ).all()
    )
    for form_field in src_fields:
        session.add(
            FormField(
                form_id=new_form.id,
                field_definition_id=form_field.field_definition_id,
                is_log_row=form_field.is_log_row,
                order_index=form_field.order_index,
                required=form_field.required,
                label_override=form_field.label_override,
                help_text=form_field.help_text,
                default_value=form_field.default_value,
                inline_mark=form_field.inline_mark,
            )
        )

    session.flush()
    session.refresh(new_form)
    return _serialize_form_response(new_form)
