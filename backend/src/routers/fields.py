"""Fields Router - field_definitions + form_fields"""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException

from sqlalchemy.orm import Session, selectinload

from sqlalchemy import select

from pydantic import BaseModel, field_validator


from src.database import get_session

from src.dependencies import (
    get_current_user,
    verify_field_definition_owner,
    verify_form_field_owner,
    verify_form_owner,
    verify_project_codelist_owner,
    verify_project_owner,
    verify_project_unit_owner,
)

from src.models.field_definition import FieldDefinition

from src.models.form import Form

from src.models.form_field import FormField

from src.models.user import User

from src.repositories.field_definition_repository import FieldDefinitionRepository

from src.repositories.form_field_repository import FormFieldRepository

from src.services.field_type_policy import (
    MULTISELECT_REJECT_MSG,
    allows_multiselect,
    is_multiselect_field_type,
)

from src.repositories.base_repository import BaseRepository

from src.schemas.field import (
    FieldDefinitionCreate,
    FieldDefinitionUpdate,
    FieldDefinitionResponse,
    FormFieldCreate,
    FormFieldResponse,
)

from src.schemas import BatchDeleteRequest

from src.schemas.field_profile import FieldProfileCommand, FieldProfileResponse

from src.services.field_profile_service import (
    create_field_profile,
    update_binding_profile,
)

from src.services.field_cleanup_service import (
    batch_delete_form_fields_and_cleanup_label_definitions,
    delete_form_field_and_cleanup_label_definition,
)
from src.services.order_service import OrderService


router = APIRouter(tags=["fields"])


# ── 字段库 ──────────────────────────────────────────────────────────────────


@router.get("/projects/{project_id}/field-definitions", response_model=List[FieldDefinitionResponse])
def list_field_definitions(
    project_id: int, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)
):

    verify_project_owner(project_id, current_user, session)

    return FieldDefinitionRepository(session).get_by_project_id(project_id)


def _reject_disallowed_multiselect(project, field_type):

    if is_multiselect_field_type(field_type) and not allows_multiselect(getattr(project, "db_type", None)):
        raise HTTPException(400, MULTISELECT_REJECT_MSG)


@router.post("/projects/{project_id}/field-definitions", response_model=FieldDefinitionResponse, status_code=201)
def create_field_definition(
    project_id: int,
    data: FieldDefinitionCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):

    project = verify_project_owner(project_id, current_user, session)

    _reject_disallowed_multiselect(project, data.field_type)
    if data.codelist_id is not None:
        verify_project_codelist_owner(data.codelist_id, project_id, current_user, session)
    if data.unit_id is not None:
        verify_project_unit_owner(data.unit_id, project_id, current_user, session)

    repo = FieldDefinitionRepository(session)

    dump = data.model_dump(exclude={"order_index"})

    fd = FieldDefinition(project_id=project_id, **dump)

    if data.order_index is None:
        fd.order_index = OrderService.get_next_order(session, FieldDefinition, FieldDefinition.project_id == project_id)

        session.add(fd)

    else:
        OrderService.insert_at(session, FieldDefinition, FieldDefinition.project_id == project_id, fd, data.order_index)

    session.flush()

    return fd


@router.put("/projects/{project_id}/field-definitions/{fd_id}", response_model=FieldDefinitionResponse)
def update_field_definition(
    project_id: int,
    fd_id: int,
    data: FieldDefinitionUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):

    project = verify_project_owner(project_id, current_user, session)

    repo = FieldDefinitionRepository(session)

    fd = verify_field_definition_owner(fd_id, current_user, session)

    if fd.project_id != project_id:
        raise HTTPException(403, "无权修改该项目的字段定义")

    if data.field_type is not None and data.field_type != fd.field_type:
        _reject_disallowed_multiselect(project, data.field_type)

    if data.codelist_id is not None:
        verify_project_codelist_owner(data.codelist_id, project_id, current_user, session)
    if data.unit_id is not None:
        verify_project_unit_owner(data.unit_id, project_id, current_user, session)

    old_order = fd.order_index

    for k, v in data.model_dump(exclude={"order_index"}, exclude_unset=True).items():
        setattr(fd, k, v)

    if data.order_index is not None and data.order_index != old_order:
        OrderService.move_to(
            session, FieldDefinition, FieldDefinition.project_id == fd.project_id, fd, data.order_index
        )

    session.flush()

    return fd


@router.get("/field-definitions/{fd_id}/references")
def get_field_definition_references(
    fd_id: int, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)
):
    """查询字段定义被哪些表单引用"""

    verify_field_definition_owner(fd_id, current_user, session)

    stmt = (
        select(Form.name, Form.code)
        .join(FormField, FormField.form_id == Form.id)
        .where(FormField.field_definition_id == fd_id)
    )

    return [{"form_name": r[0], "form_code": r[1]} for r in session.execute(stmt).all()]


@router.delete("/field-definitions/{fd_id}", status_code=204)
def delete_field_definition(
    fd_id: int, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)
):

    repo = FieldDefinitionRepository(session)

    fd = verify_field_definition_owner(fd_id, current_user, session)

    ref = session.scalar(select(FormField.id).where(FormField.field_definition_id == fd_id).limit(1))

    if ref is not None:
        raise HTTPException(409, "该字段被表单引用，无法删除")

    OrderService.delete_and_compact(session, FieldDefinition, FieldDefinition.project_id == fd.project_id, fd)


@router.post("/projects/{project_id}/field-definitions/batch-delete")
def batch_delete_field_definitions(
    project_id: int,
    data: BatchDeleteRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):

    verify_project_owner(project_id, current_user, session)

    ref_ids = set(
        session.scalars(select(FormField.field_definition_id).where(FormField.field_definition_id.in_(data.ids))).all()
    )

    if ref_ids:
        raise HTTPException(409, "部分字段被表单引用，无法删除")

    count = FieldDefinitionRepository(session).batch_delete(data.ids, project_id=project_id)

    OrderService.compact_after_batch_delete(session, FieldDefinition, FieldDefinition.project_id == project_id)

    return {"deleted": count}


@router.post("/projects/{project_id}/field-definitions/batch-references")
def batch_field_definition_references(
    project_id: int,
    data: BatchDeleteRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """批量查询字段定义引用"""

    verify_project_owner(project_id, current_user, session)

    from src.models.form import Form

    valid_fd_ids = set(
        session.scalars(
            select(FieldDefinition.id).where(FieldDefinition.project_id == project_id, FieldDefinition.id.in_(data.ids))
        ).all()
    )
    stmt = (
        select(FormField.field_definition_id, Form.name, Form.code)
        .join(Form, Form.id == FormField.form_id)
        .where(FormField.field_definition_id.in_(valid_fd_ids))
    )

    result = {}

    for r in session.execute(stmt).all():
        result.setdefault(r[0], []).append({"form_name": r[1], "form_code": r[2]})

    return result


@router.post("/projects/{project_id}/field-definitions/reorder")
def reorder_field_definitions(
    project_id: int,
    id_list: List[int],
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """批量重排序号（拖拽场景）"""

    verify_project_owner(project_id, current_user, session)

    OrderService.reorder_batch(session, FieldDefinition, FieldDefinition.project_id == project_id, id_list)

    return {"message": "Reordered"}


# ── 表单字段实例 ─────────────────────────────────────────────────────────────


@router.get("/forms/{form_id}/fields", response_model=List[FormFieldResponse])
def list_form_fields(
    form_id: int, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)
):

    verify_form_owner(form_id, current_user, session)

    return FormFieldRepository(session).get_by_form_id(form_id)


@router.post("/forms/{form_id}/fields", response_model=FormFieldResponse, status_code=201)
def add_form_field(
    form_id: int,
    data: FormFieldCreate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):

    form = verify_form_owner(form_id, current_user, session)

    if data.field_definition_id is not None:
        field_definition = verify_field_definition_owner(data.field_definition_id, current_user, session)
        if field_definition.project_id != form.project_id:
            raise HTTPException(403, "无权向该表单添加其他项目的字段定义")

    repo = FormFieldRepository(session)

    # 日志行不关联字段定义，跳过重复检查

    if data.field_definition_id is not None:
        existing = session.scalar(
            select(FormField).where(
                FormField.form_id == form_id, FormField.field_definition_id == data.field_definition_id
            )
        )

        if existing:
            raise HTTPException(409, "该字段已在表单中")

    payload = data.model_dump(exclude={"order_index"})
    form_field = FormField(form_id=form_id, **payload)

    if data.order_index is None:
        form_field.order_index = repo.get_max_order_index(form_id) + 1
        return repo.create(form_field)

    OrderService.insert_at(session, FormField, FormField.form_id == form_id, form_field, data.order_index)
    session.flush()
    return form_field


@router.post("/forms/{form_id}/field-profile", response_model=FieldProfileResponse, status_code=201)
def create_form_field_profile(
    form_id: int,
    command: FieldProfileCommand,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """新增字段草稿落库：定义创建/恢复 + 实例创建，单事务原子。"""

    form = verify_form_owner(form_id, current_user, session)

    project = verify_project_owner(form.project_id, current_user, session)

    result = create_field_profile(session, project, form, current_user, command)

    result["form_field"] = result.pop("form_field_obj", None)

    return result


@router.put("/form-fields/{ff_id}/binding-profile", response_model=FieldProfileResponse)
def update_form_field_binding_profile(
    ff_id: int,
    command: FieldProfileCommand,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):
    """已有字段：共享更新 / 换绑 / OID 分叉 / 实例部分更新 / 撤销删除，单事务原子。"""

    ff = verify_form_field_owner(ff_id, current_user, session)

    form = session.get(Form, ff.form_id)

    if form is None:
        raise HTTPException(404, "表单不存在")

    project = verify_project_owner(form.project_id, current_user, session)

    result = update_binding_profile(session, ff, project, current_user, command)

    result["form_field"] = result.pop("form_field_obj", None)

    return result


@router.delete("/form-fields/{ff_id}", status_code=204)
def delete_form_field(
    ff_id: int, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)
):

    ff = verify_form_field_owner(ff_id, current_user, session)

    delete_form_field_and_cleanup_label_definition(session, ff)


class ReorderRequest(BaseModel):
    ordered_ids: List[int]


@router.post("/forms/{form_id}/fields/reorder", status_code=204)
def reorder_form_fields(
    form_id: int,
    data: ReorderRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):

    verify_form_owner(form_id, current_user, session)

    FormFieldRepository(session).reorder(form_id, data.ordered_ids)


@router.post("/forms/{form_id}/fields/batch-delete")
def batch_delete_form_fields(
    form_id: int,
    data: BatchDeleteRequest,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user),
):

    verify_form_owner(form_id, current_user, session)

    form_fields = list(
        session.scalars(
            select(FormField)
            .where(FormField.form_id == form_id, FormField.id.in_(data.ids))
            .options(selectinload(FormField.field_definition))
        ).all()
    )
    scoped_ids = {form_field.id for form_field in form_fields}
    if scoped_ids != set(data.ids):
        raise HTTPException(403, "无权批量删除该表单外的字段")

    count = batch_delete_form_fields_and_cleanup_label_definitions(session, form_fields)

    return {"deleted": count}


@router.post("/field-definitions/{fd_id}/copy", response_model=FieldDefinitionResponse, status_code=201)
def copy_field_definition(
    fd_id: int, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)
):
    """复制字段定义，variable_name 加 _copy 后缀（冲突时追加数字）"""

    repo = FieldDefinitionRepository(session)

    src = verify_field_definition_owner(fd_id, current_user, session)

    # 生成不冲突的 variable_name

    base = src.variable_name + "_copy"

    candidate = base

    idx = 1

    while session.scalar(
        select(FieldDefinition).where(
            FieldDefinition.project_id == src.project_id, FieldDefinition.variable_name == candidate
        )
    ):
        candidate = f"{base}{idx}"

        idx += 1

    new_fd = FieldDefinition(
        project_id=src.project_id,
        variable_name=candidate,
        label=src.label,
        field_type=src.field_type,
        checkbox_label=src.checkbox_label,
        integer_digits=src.integer_digits,
        decimal_digits=src.decimal_digits,
        date_format=src.date_format,
        codelist_id=(None if src.field_type == "复选" else src.codelist_id),
        unit_id=src.unit_id,
        is_multi_record=src.is_multi_record,
        table_type=src.table_type,
    )

    # 追加到末尾

    new_fd.order_index = OrderService.get_next_order(
        session, FieldDefinition, FieldDefinition.project_id == src.project_id
    )

    session.add(new_fd)

    session.flush()

    return new_fd
