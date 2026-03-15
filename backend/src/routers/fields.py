"""Fields Router - field_definitions + form_fields"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select
from pydantic import BaseModel

from src.database import get_session
from src.models.field_definition import FieldDefinition
from src.models.form_field import FormField
from src.repositories.field_definition_repository import FieldDefinitionRepository
from src.repositories.form_field_repository import FormFieldRepository
from src.repositories.base_repository import BaseRepository
from src.schemas.field import (
    FieldDefinitionCreate, FieldDefinitionUpdate, FieldDefinitionResponse,
    FormFieldCreate, FormFieldUpdate, FormFieldResponse
)
from src.schemas import BatchDeleteRequest
from src.services.order_service import OrderService

router = APIRouter(tags=["fields"])


# ── 字段库 ──────────────────────────────────────────────────────────────────

@router.get("/projects/{project_id}/field-definitions", response_model=List[FieldDefinitionResponse])
def list_field_definitions(project_id: int, session: Session = Depends(get_session)):
    return FieldDefinitionRepository(session).get_by_project_id(project_id)


@router.post("/projects/{project_id}/field-definitions", response_model=FieldDefinitionResponse, status_code=201)
def create_field_definition(project_id: int, data: FieldDefinitionCreate, session: Session = Depends(get_session)):
    repo = FieldDefinitionRepository(session)
    dump = data.model_dump(exclude={'order_index'})
    fd = FieldDefinition(project_id=project_id, **dump)

    if data.order_index is None:
        fd.order_index = OrderService.get_next_order(session, FieldDefinition, FieldDefinition.project_id == project_id)
        session.add(fd)
    else:
        OrderService.insert_at(session, FieldDefinition, FieldDefinition.project_id == project_id, fd, data.order_index)

    session.flush()
    return fd


@router.put("/projects/{project_id}/field-definitions/{fd_id}", response_model=FieldDefinitionResponse)
def update_field_definition(project_id: int, fd_id: int, data: FieldDefinitionUpdate, session: Session = Depends(get_session)):
    repo = FieldDefinitionRepository(session)
    fd = repo.get_by_id(fd_id)
    if not fd:
        raise HTTPException(404, "字段定义不存在")
    if fd.project_id != project_id:
        raise HTTPException(403, "无权修改该项目的字段定义")

    old_order = fd.order_index

    for k, v in data.model_dump(exclude={'order_index'}, exclude_unset=True).items():
        setattr(fd, k, v)

    if data.order_index is not None and data.order_index != old_order:
        OrderService.move_to(session, FieldDefinition, FieldDefinition.project_id == fd.project_id, fd, data.order_index)

    session.flush()
    return fd


@router.get("/field-definitions/{fd_id}/references")
def get_field_definition_references(fd_id: int, session: Session = Depends(get_session)):
    """查询字段定义被哪些表单引用"""
    from src.models.form import Form
    from src.models.form_field import FormField
    stmt = (
        select(Form.name, Form.code)
        .join(FormField, FormField.form_id == Form.id)
        .where(FormField.field_definition_id == fd_id)
    )
    return [{"form_name": r[0], "form_code": r[1]} for r in session.execute(stmt).all()]


@router.delete("/field-definitions/{fd_id}", status_code=204)
def delete_field_definition(fd_id: int, session: Session = Depends(get_session)):
    repo = FieldDefinitionRepository(session)
    fd = repo.get_by_id(fd_id)
    if not fd:
        raise HTTPException(404, "字段定义不存在")
    ref = session.scalar(select(FormField.id).where(FormField.field_definition_id == fd_id).limit(1))
    if ref is not None:
        raise HTTPException(409, "该字段被表单引用，无法删除")
    OrderService.delete_and_compact(session, FieldDefinition, FieldDefinition.project_id == fd.project_id, fd)


@router.post("/projects/{project_id}/field-definitions/batch-delete")
def batch_delete_field_definitions(project_id: int, data: BatchDeleteRequest, session: Session = Depends(get_session)):
    ref_ids = set(session.scalars(select(FormField.field_definition_id).where(FormField.field_definition_id.in_(data.ids))).all())
    if ref_ids:
        raise HTTPException(409, "部分字段被表单引用，无法删除")
    count = FieldDefinitionRepository(session).batch_delete(data.ids, project_id=project_id)
    OrderService.compact_after_batch_delete(session, FieldDefinition, FieldDefinition.project_id == project_id)
    return {"deleted": count}


@router.post("/projects/{project_id}/field-definitions/batch-references")
def batch_field_definition_references(project_id: int, data: BatchDeleteRequest, session: Session = Depends(get_session)):
    """批量查询字段定义引用"""
    from src.models.form import Form
    stmt = (
        select(FormField.field_definition_id, Form.name, Form.code)
        .join(Form, Form.id == FormField.form_id)
        .where(FormField.field_definition_id.in_(data.ids))
    )
    result = {}
    for r in session.execute(stmt).all():
        result.setdefault(r[0], []).append({"form_name": r[1], "form_code": r[2]})
    return result


@router.post("/projects/{project_id}/field-definitions/reorder")
def reorder_field_definitions(project_id: int, id_list: List[int], session: Session = Depends(get_session)):
    """批量重排序号（拖拽场景）"""
    OrderService.reorder_batch(session, FieldDefinition, FieldDefinition.project_id == project_id, id_list)
    return {"message": "Reordered"}


# ── 表单字段实例 ─────────────────────────────────────────────────────────────

@router.get("/forms/{form_id}/fields", response_model=List[FormFieldResponse])
def list_form_fields(form_id: int, session: Session = Depends(get_session)):
    return FormFieldRepository(session).get_by_form_id(form_id)


@router.post("/forms/{form_id}/fields", response_model=FormFieldResponse, status_code=201)
def add_form_field(form_id: int, data: FormFieldCreate, session: Session = Depends(get_session)):
    repo = FormFieldRepository(session)
    # 日志行不关联字段定义，跳过重复检查
    if data.field_definition_id is not None:
        existing = session.scalar(select(FormField).where(FormField.form_id == form_id, FormField.field_definition_id == data.field_definition_id))
        if existing:
            raise HTTPException(409, "该字段已在表单中")
    sort_order = data.sort_order if data.sort_order is not None else repo.get_max_sort_order(form_id) + 1
    payload = data.model_dump(exclude={"sort_order"})
    return repo.create(FormField(form_id=form_id, sort_order=sort_order, **payload))


@router.put("/form-fields/{ff_id}", response_model=FormFieldResponse)
def update_form_field(ff_id: int, data: FormFieldUpdate, session: Session = Depends(get_session)):
    repo = FormFieldRepository(session)
    ff = repo.get_by_id(ff_id)
    if not ff:
        raise HTTPException(404, "表单字段不存在")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(ff, k, v)
    repo.update(ff)
    return ff


@router.delete("/form-fields/{ff_id}", status_code=204)
def delete_form_field(ff_id: int, session: Session = Depends(get_session)):
    repo = FormFieldRepository(session)
    ff = repo.get_by_id(ff_id)
    if not ff:
        raise HTTPException(404, "表单字段不存在")
    repo.delete(ff)


class InlineMarkUpdate(BaseModel):
    inline_mark: int


@router.patch("/form-fields/{ff_id}/inline-mark", response_model=FormFieldResponse)
def update_inline_mark(ff_id: int, data: InlineMarkUpdate, session: Session = Depends(get_session)):
    repo = FormFieldRepository(session)
    if not repo.update_inline_mark(ff_id, data.inline_mark):
        raise HTTPException(404, "表单字段不存在")
    return repo.get_by_id(ff_id)


class ReorderRequest(BaseModel):
    ordered_ids: List[int]


@router.post("/forms/{form_id}/fields/reorder", status_code=204)
def reorder_form_fields(form_id: int, data: ReorderRequest, session: Session = Depends(get_session)):
    FormFieldRepository(session).reorder(form_id, data.ordered_ids)


@router.post("/forms/{form_id}/fields/batch-delete")
def batch_delete_form_fields(form_id: int, data: BatchDeleteRequest, session: Session = Depends(get_session)):
    count = FormFieldRepository(session).batch_delete(data.ids)
    return {"deleted": count}


@router.post("/field-definitions/{fd_id}/copy", response_model=FieldDefinitionResponse, status_code=201)
def copy_field_definition(fd_id: int, session: Session = Depends(get_session)):
    """复制字段定义，variable_name 加 _copy 后缀（冲突时追加数字）"""
    repo = FieldDefinitionRepository(session)
    src = repo.get_by_id(fd_id)
    if not src:
        raise HTTPException(404, "字段定义不存在")
    # 生成不冲突的 variable_name
    base = src.variable_name + "_copy"
    candidate = base
    idx = 1
    while session.scalar(select(FieldDefinition).where(
        FieldDefinition.project_id == src.project_id,
        FieldDefinition.variable_name == candidate
    )):
        candidate = f"{base}{idx}"
        idx += 1
    new_fd = FieldDefinition(
        project_id=src.project_id,
        variable_name=candidate,
        label=src.label,
        field_type=src.field_type,
        integer_digits=src.integer_digits,
        decimal_digits=src.decimal_digits,
        date_format=src.date_format,
        codelist_id=src.codelist_id,
        unit_id=src.unit_id,
        is_multi_record=src.is_multi_record,
        table_type=src.table_type,
    )
    # 追加到末尾
    new_fd.order_index = OrderService.get_next_order(session, FieldDefinition, FieldDefinition.project_id == src.project_id)
    session.add(new_fd)
    session.flush()
    return new_fd
