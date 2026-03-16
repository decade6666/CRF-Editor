"""Forms Router"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select

from src.database import get_session
from src.models.form import Form
from src.models.form_field import FormField
from src.repositories.base_repository import BaseRepository
from src.schemas.form import FormCreate, FormUpdate, FormResponse
from src.schemas import BatchDeleteRequest
from src.services.order_service import OrderService

router = APIRouter(tags=["forms"])


@router.get("/projects/{project_id}/forms", response_model=List[FormResponse])
def list_forms(project_id: int, session: Session = Depends(get_session)):
    stmt = select(Form).where(Form.project_id == project_id).order_by(Form.order_index, Form.id)
    return list(session.scalars(stmt).all())


@router.post("/projects/{project_id}/forms", response_model=FormResponse, status_code=201)
def create_form(project_id: int, data: FormCreate, session: Session = Depends(get_session)):
    from src.utils import generate_code
    dump = data.model_dump(exclude={'order_index'})
    if not dump.get("code"):
        dump["code"] = generate_code("FORM")

    form = Form(project_id=project_id, **dump)

    if data.order_index is None:
        form.order_index = OrderService.get_next_order(session, Form, Form.project_id == project_id)
        session.add(form)
    else:
        OrderService.insert_at(session, Form, Form.project_id == project_id, form, data.order_index)

    session.flush()
    return form


@router.put("/forms/{form_id}", response_model=FormResponse)
def update_form(form_id: int, data: FormUpdate, session: Session = Depends(get_session)):
    repo = BaseRepository(session, Form)
    form = repo.get_by_id(form_id)
    if not form:
        raise HTTPException(404, "表单不存在")

    old_order = form.order_index

    for k, v in data.model_dump(exclude={'order_index'}, exclude_unset=True).items():
        setattr(form, k, v)

    if data.order_index is not None and data.order_index != old_order:
        OrderService.move_to(session, Form, Form.project_id == form.project_id, form, data.order_index)

    session.flush()
    return form


@router.get("/forms/{form_id}/references")
def get_form_references(form_id: int, session: Session = Depends(get_session)):
    """查询表单被哪些访视引用"""
    from src.models.visit_form import VisitForm
    from src.models.visit import Visit
    stmt = (
        select(Visit.name)
        .join(VisitForm, VisitForm.visit_id == Visit.id)
        .where(VisitForm.form_id == form_id)
    )
    return [{"visit_name": r[0]} for r in session.execute(stmt).all()]


@router.delete("/forms/{form_id}", status_code=204)
def delete_form(form_id: int, session: Session = Depends(get_session)):
    repo = BaseRepository(session, Form)
    form = repo.get_by_id(form_id)
    if not form:
        raise HTTPException(404, "表单不存在")
    from src.models.visit_form import VisitForm
    ref = session.scalar(select(VisitForm.id).where(VisitForm.form_id == form_id).limit(1))
    if ref is not None:
        raise HTTPException(409, "该表单被访视引用，无法删除")
    OrderService.delete_and_compact(session, Form, Form.project_id == form.project_id, form)


@router.post("/projects/{project_id}/forms/batch-delete")
def batch_delete_forms(project_id: int, data: BatchDeleteRequest, session: Session = Depends(get_session)):
    from src.models.visit_form import VisitForm
    ref_ids = set(session.scalars(select(VisitForm.form_id).where(VisitForm.form_id.in_(data.ids))).all())
    if ref_ids:
        raise HTTPException(409, "部分表单被访视引用，无法删除")
    count = BaseRepository(session, Form).batch_delete(data.ids, project_id=project_id)
    OrderService.compact_after_batch_delete(session, Form, Form.project_id == project_id)
    return {"deleted": count}


@router.post("/projects/{project_id}/forms/batch-references")
def batch_form_references(project_id: int, data: BatchDeleteRequest, session: Session = Depends(get_session)):
    """批量查询表单引用"""
    from src.models.visit_form import VisitForm
    from src.models.visit import Visit
    stmt = (
        select(VisitForm.form_id, Visit.name)
        .join(Visit, Visit.id == VisitForm.visit_id)
        .where(VisitForm.form_id.in_(data.ids))
    )
    result = {}
    for r in session.execute(stmt).all():
        result.setdefault(r[0], []).append({"visit_name": r[1]})
    return result


@router.post("/projects/{project_id}/forms/reorder")
def reorder_forms(project_id: int, id_list: List[int], session: Session = Depends(get_session)):
    """批量重排序号（拖拽场景）"""
    OrderService.reorder_batch(session, Form, Form.project_id == project_id, id_list)
    return {"message": "Reordered"}


@router.post("/forms/{form_id}/copy", response_model=FormResponse, status_code=201)
def copy_form(form_id: int, session: Session = Depends(get_session)):
    """复制表单及其所有字段，name 加 _copy 后缀（冲突时追加数字）"""
    repo = BaseRepository(session, Form)
    src = repo.get_by_id(form_id)
    if not src:
        raise HTTPException(404, "表单不存在")
    # 生成不冲突的 name
    base = src.name + "_copy"
    candidate = base
    idx = 1
    while session.scalar(select(Form).where(Form.project_id == src.project_id, Form.name == candidate)):
        candidate = f"{base}{idx}"
        idx += 1
    from src.utils import generate_code
    new_form = Form(project_id=src.project_id, name=candidate, code=generate_code("FORM"), domain=src.domain, design_notes=src.design_notes)
    # 追加到末尾
    new_form.order_index = OrderService.get_next_order(session, Form, Form.project_id == src.project_id)
    session.add(new_form)
    session.flush()
    # 复制所有 form_fields，保持 sort_order
    src_fields = list(session.scalars(
        select(FormField).where(FormField.form_id == form_id).order_by(FormField.sort_order)
    ).all())
    for ff in src_fields:
        session.add(FormField(
            form_id=new_form.id,
            field_definition_id=ff.field_definition_id,
            is_log_row=ff.is_log_row,
            sort_order=ff.sort_order,
            required=ff.required,
            label_override=ff.label_override,
            help_text=ff.help_text,
            default_value=ff.default_value,
            inline_mark=ff.inline_mark,
        ))
    session.flush()
    session.refresh(new_form)
    return new_form
