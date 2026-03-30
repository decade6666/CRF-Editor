"""Units Router"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select

from src.database import get_session
from src.dependencies import get_current_user, verify_project_owner
from src.models.unit import Unit
from src.models.user import User
from src.repositories.base_repository import BaseRepository
from src.schemas.unit import UnitCreate, UnitUpdate, UnitResponse
from src.schemas import BatchDeleteRequest
from src.services.order_service import OrderService

router = APIRouter(tags=["units"])


@router.get("/projects/{project_id}/units", response_model=List[UnitResponse])
def list_units(project_id: int, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    verify_project_owner(project_id, current_user, session)
    stmt = select(Unit).where(Unit.project_id == project_id).order_by(Unit.order_index, Unit.id)
    return list(session.scalars(stmt).all())


@router.post("/projects/{project_id}/units", response_model=UnitResponse, status_code=201)
def create_unit(project_id: int, data: UnitCreate, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    verify_project_owner(project_id, current_user, session)
    from src.utils import generate_code
    dump = data.model_dump(exclude={'order_index'})
    if not dump.get("code"):
        dump["code"] = generate_code("UNIT")

    unit = Unit(project_id=project_id, **dump)

    if data.order_index is None:
        unit.order_index = OrderService.get_next_order(session, Unit, Unit.project_id == project_id)
        session.add(unit)
    else:
        OrderService.insert_at(session, Unit, Unit.project_id == project_id, unit, data.order_index)

    session.flush()
    return unit


@router.put("/units/{unit_id}", response_model=UnitResponse)
def update_unit(unit_id: int, data: UnitUpdate, session: Session = Depends(get_session)):
    repo = BaseRepository(session, Unit)
    unit = repo.get_by_id(unit_id)
    if not unit:
        raise HTTPException(404, "单位不存在")

    old_order = unit.order_index

    for k, v in data.model_dump(exclude={'order_index'}, exclude_unset=True).items():
        setattr(unit, k, v)

    if data.order_index is not None and data.order_index != old_order:
        OrderService.move_to(session, Unit, Unit.project_id == unit.project_id, unit, data.order_index)

    session.flush()
    return unit


@router.get("/units/{unit_id}/references")
def get_unit_references(unit_id: int, session: Session = Depends(get_session)):
    """查询单位被哪些表单的哪些字段引用"""
    from src.models.field_definition import FieldDefinition
    from src.models.form_field import FormField
    from src.models.form import Form
    stmt = (
        select(Form.name, Form.code, FieldDefinition.label, FieldDefinition.variable_name)
        .join(FormField, FormField.form_id == Form.id)
        .join(FieldDefinition, FieldDefinition.id == FormField.field_definition_id)
        .where(FieldDefinition.unit_id == unit_id)
    )
    return [{"form_name": r[0], "form_code": r[1], "field_label": r[2], "field_var": r[3]} for r in session.execute(stmt).all()]


@router.delete("/units/{unit_id}", status_code=204)
def delete_unit(unit_id: int, session: Session = Depends(get_session)):
    repo = BaseRepository(session, Unit)
    unit = repo.get_by_id(unit_id)
    if not unit:
        raise HTTPException(404, "单位不存在")
    # 服务端引用检查：防止前端漏检导致静默删除
    from src.models.field_definition import FieldDefinition
    ref_count = session.scalar(select(FieldDefinition.id).where(FieldDefinition.unit_id == unit_id).limit(1))
    if ref_count is not None:
        raise HTTPException(409, "该单位被字段引用，无法删除")
    OrderService.delete_and_compact(session, Unit, Unit.project_id == unit.project_id, unit)


@router.post("/projects/{project_id}/units/batch-delete")
def batch_delete_units(project_id: int, data: BatchDeleteRequest, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    verify_project_owner(project_id, current_user, session)
    from src.models.field_definition import FieldDefinition
    ref_ids = set(session.scalars(select(FieldDefinition.unit_id).where(FieldDefinition.unit_id.in_(data.ids))).all())
    if ref_ids:
        raise HTTPException(409, "部分单位被字段引用，无法删除")
    count = BaseRepository(session, Unit).batch_delete(data.ids, project_id=project_id)
    OrderService.compact_after_batch_delete(session, Unit, Unit.project_id == project_id)
    return {"deleted": count}


@router.post("/projects/{project_id}/units/batch-references")
def batch_unit_references(project_id: int, data: BatchDeleteRequest, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    """批量查询单位引用"""
    verify_project_owner(project_id, current_user, session)
    from src.models.field_definition import FieldDefinition
    from src.models.form_field import FormField
    from src.models.form import Form
    stmt = (
        select(FieldDefinition.unit_id, Form.name, Form.code, FieldDefinition.label, FieldDefinition.variable_name)
        .join(FormField, FormField.form_id == Form.id)
        .join(FieldDefinition, FieldDefinition.id == FormField.field_definition_id)
        .where(FieldDefinition.unit_id.in_(data.ids))
    )
    result = {}
    for r in session.execute(stmt).all():
        result.setdefault(r[0], []).append({"form_name": r[1], "form_code": r[2], "field_label": r[3], "field_var": r[4]})
    return result


@router.post("/projects/{project_id}/units/reorder")
def reorder_units(project_id: int, id_list: List[int], session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):
    """批量重排序号（拖拽场景）"""
    verify_project_owner(project_id, current_user, session)
    OrderService.reorder_batch(session, Unit, Unit.project_id == project_id, id_list)
    return {"message": "Reordered"}

