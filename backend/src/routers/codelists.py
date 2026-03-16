"""Codelists Router"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select

from src.database import get_session
from src.models.codelist import CodeList, CodeListOption
from src.repositories.base_repository import BaseRepository
from src.schemas.codelist import (
    CodeListCreate, CodeListUpdate, CodeListResponse,
    CodeListOptionCreate, CodeListOptionUpdate, CodeListOptionResponse
)
from src.schemas import BatchDeleteRequest
from src.services.order_service import OrderService

router = APIRouter(tags=["codelists"])


def _get_codelist_with_project_check(session: Session, cl_id: int, project_id: int) -> CodeList:
    """获取字典并校验项目归属"""
    repo = BaseRepository(session, CodeList)
    cl = repo.get_by_id(cl_id)
    if not cl:
        raise HTTPException(404, "编码字典不存在")
    if cl.project_id != project_id:
        raise HTTPException(403, "无权操作该字典")
    return cl


@router.get("/projects/{project_id}/codelists", response_model=List[CodeListResponse])
def list_codelists(project_id: int, session: Session = Depends(get_session)):
    from sqlalchemy.orm import selectinload
    stmt = (
        select(CodeList)
        .where(CodeList.project_id == project_id)
        .options(selectinload(CodeList.options))
        .order_by(CodeList.order_index.asc().nullslast(), CodeList.id)
    )
    codelists = list(session.scalars(stmt).all())
    # 确保 options 按 order_index 排序
    for cl in codelists:
        cl.options = sorted(cl.options, key=lambda opt: (opt.order_index or 999999, opt.id))
    return codelists


@router.post("/projects/{project_id}/codelists", response_model=CodeListResponse, status_code=201)
def create_codelist(project_id: int, data: CodeListCreate, session: Session = Depends(get_session)):
    from src.utils import generate_code
    dump = data.model_dump()
    if not dump.get("code"):
        dump["code"] = generate_code("CL")

    cl = CodeList(project_id=project_id, **{k: v for k, v in dump.items() if k != 'order_index'})
    if data.order_index is None:
        cl.order_index = OrderService.get_next_order(session, CodeList, CodeList.project_id == project_id)
        session.add(cl)
    else:
        OrderService.insert_at(session, CodeList, CodeList.project_id == project_id, cl, data.order_index)

    session.flush()
    return cl


@router.put("/projects/{project_id}/codelists/{cl_id}", response_model=CodeListResponse)
def update_codelist(project_id: int, cl_id: int, data: CodeListUpdate, session: Session = Depends(get_session)):
    repo = BaseRepository(session, CodeList)
    cl = repo.get_by_id(cl_id)
    if not cl:
        raise HTTPException(404, "编码字典不存在")
    if cl.project_id != project_id:
        raise HTTPException(403, "无权操作该字典")

    old_order = cl.order_index

    for k, v in data.model_dump(exclude={'order_index'}, exclude_unset=True).items():
        setattr(cl, k, v)

    if data.order_index is not None and data.order_index != old_order:
        OrderService.move_to(session, CodeList, CodeList.project_id == project_id, cl, data.order_index)

    session.flush()
    return cl


@router.get("/projects/{project_id}/codelists/{cl_id}/references")
def get_codelist_references(project_id: int, cl_id: int, session: Session = Depends(get_session)):
    """查询字典被哪些表单的哪些字段引用"""
    _get_codelist_with_project_check(session, cl_id, project_id)

    from src.models.field_definition import FieldDefinition
    from src.models.form_field import FormField
    from src.models.form import Form
    stmt = (
        select(Form.name, Form.code, FieldDefinition.label, FieldDefinition.variable_name)
        .join(FormField, FormField.form_id == Form.id)
        .join(FieldDefinition, FieldDefinition.id == FormField.field_definition_id)
        .where(FieldDefinition.codelist_id == cl_id)
    )
    return [{"form_name": r[0], "form_code": r[1], "field_label": r[2], "field_var": r[3]} for r in session.execute(stmt).all()]


@router.delete("/projects/{project_id}/codelists/{cl_id}", status_code=204)
def delete_codelist(project_id: int, cl_id: int, session: Session = Depends(get_session)):
    repo = BaseRepository(session, CodeList)
    cl = repo.get_by_id(cl_id)
    if not cl:
        raise HTTPException(404, "编码字典不存在")
    if cl.project_id != project_id:
        raise HTTPException(403, "无权操作该字典")
    from src.models.field_definition import FieldDefinition
    ref = session.scalar(select(FieldDefinition.id).where(FieldDefinition.codelist_id == cl_id).limit(1))
    if ref is not None:
        raise HTTPException(409, "该字典被字段引用，无法删除")
    OrderService.delete_and_compact(session, CodeList, CodeList.project_id == project_id, cl)


@router.post("/projects/{project_id}/codelists/batch-delete")
def batch_delete_codelists(project_id: int, data: BatchDeleteRequest, session: Session = Depends(get_session)):
    from src.models.field_definition import FieldDefinition
    ref_ids = set(session.scalars(select(FieldDefinition.codelist_id).where(FieldDefinition.codelist_id.in_(data.ids))).all())
    if ref_ids:
        raise HTTPException(409, "部分字典被字段引用，无法删除")
    count = BaseRepository(session, CodeList).batch_delete(data.ids, project_id=project_id)
    OrderService.compact_after_batch_delete(session, CodeList, CodeList.project_id == project_id)
    return {"deleted": count}


@router.post("/projects/{project_id}/codelists/batch-references")
def batch_codelist_references(project_id: int, data: BatchDeleteRequest, session: Session = Depends(get_session)):
    """批量查询字典引用"""
    # 先按 project_id 过滤 codelists
    valid_cl_ids = set(session.scalars(
        select(CodeList.id)
        .where(CodeList.project_id == project_id)
        .where(CodeList.id.in_(data.ids))
    ).all())

    # 只查询有效的 codelist 引用
    from src.models.field_definition import FieldDefinition
    from src.models.form_field import FormField
    from src.models.form import Form
    stmt = (
        select(FieldDefinition.codelist_id, Form.name, Form.code, FieldDefinition.label, FieldDefinition.variable_name)
        .join(FormField, FormField.form_id == Form.id)
        .join(FieldDefinition, FieldDefinition.id == FormField.field_definition_id)
        .where(FieldDefinition.codelist_id.in_(valid_cl_ids))
    )
    result = {}
    for r in session.execute(stmt).all():
        result.setdefault(r[0], []).append({"form_name": r[1], "form_code": r[2], "field_label": r[3], "field_var": r[4]})
    return result


@router.post("/projects/{project_id}/codelists/{cl_id}/options", response_model=CodeListOptionResponse, status_code=201)
def add_option(project_id: int, cl_id: int, data: CodeListOptionCreate, session: Session = Depends(get_session)):
    _get_codelist_with_project_check(session, cl_id, project_id)

    dump = data.model_dump(exclude={'order_index'})
    opt = CodeListOption(codelist_id=cl_id, **dump)

    if data.order_index is None:
        opt.order_index = OrderService.get_next_order(session, CodeListOption, CodeListOption.codelist_id == cl_id)
        session.add(opt)
    else:
        OrderService.insert_at(session, CodeListOption, CodeListOption.codelist_id == cl_id, opt, data.order_index)

    session.flush()
    return opt


@router.put("/projects/{project_id}/codelists/{cl_id}/options/{opt_id}", response_model=CodeListOptionResponse)
def update_option(project_id: int, cl_id: int, opt_id: int, data: CodeListOptionUpdate, session: Session = Depends(get_session)):
    repo = BaseRepository(session, CodeListOption)
    opt = repo.get_by_id(opt_id)
    if not opt:
        raise HTTPException(404, "选项不存在")
    if opt.codelist_id != cl_id:
        raise HTTPException(404, "选项不属于该字典")

    _get_codelist_with_project_check(session, cl_id, project_id)

    old_order = opt.order_index

    for k, v in data.model_dump(exclude={'order_index'}, exclude_unset=True).items():
        setattr(opt, k, v)

    if data.order_index is not None and data.order_index != old_order:
        OrderService.move_to(session, CodeListOption, CodeListOption.codelist_id == opt.codelist_id, opt, data.order_index)

    session.flush()
    return opt


@router.delete("/projects/{project_id}/codelists/{cl_id}/options/{opt_id}", status_code=204)
def delete_option(project_id: int, cl_id: int, opt_id: int, session: Session = Depends(get_session)):
    repo = BaseRepository(session, CodeListOption)
    opt = repo.get_by_id(opt_id)
    if not opt:
        raise HTTPException(404, "选项不存在")
    if opt.codelist_id != cl_id:
        raise HTTPException(404, "选项不属于该字典")

    _get_codelist_with_project_check(session, cl_id, project_id)
    OrderService.delete_and_compact(session, CodeListOption, CodeListOption.codelist_id == opt.codelist_id, opt)


@router.post("/projects/{project_id}/codelists/{cl_id}/options/batch-delete")
def batch_delete_options(project_id: int, cl_id: int, data: BatchDeleteRequest, session: Session = Depends(get_session)):
    _get_codelist_with_project_check(session, cl_id, project_id)

    # 只删除属于该字典的选项
    opts_to_delete = session.scalars(
        select(CodeListOption)
        .where(CodeListOption.id.in_(data.ids))
        .where(CodeListOption.codelist_id == cl_id)
    ).all()

    count = len(opts_to_delete)
    for opt in opts_to_delete:
        session.delete(opt)

    OrderService.compact_after_batch_delete(session, CodeListOption, CodeListOption.codelist_id == cl_id)
    return {"deleted": count}


@router.post("/projects/{project_id}/codelists/{cl_id}/options/reorder")
def reorder_options(project_id: int, cl_id: int, id_list: List[int], session: Session = Depends(get_session)):
    """批量重排序号（拖拽场景）"""
    _get_codelist_with_project_check(session, cl_id, project_id)
    OrderService.reorder_batch(session, CodeListOption, CodeListOption.codelist_id == cl_id, id_list)
    return {"message": "Reordered"}


@router.post("/projects/{project_id}/codelists/reorder")
def reorder_codelists(project_id: int, id_list: List[int], session: Session = Depends(get_session)):
    """批量重排序号（拖拽场景）"""
    OrderService.reorder_batch(session, CodeList, CodeList.project_id == project_id, id_list)
    return {"message": "Reordered"}
