"""共享 FastAPI 依赖"""
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from src.database import get_session
from src.models.user import User
from src.services.auth_service import decode_token

_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def get_current_user(
    token: str = Depends(_oauth2_scheme),
    session: Session = Depends(get_session),
) -> User:
    """从 Bearer token 解码并返回当前用户，失败返回 401。"""
    try:
        identity = decode_token(token)
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="未授权")

    user = session.get(User, identity.user_id)
    if not user or user.username != identity.username:
        raise HTTPException(status_code=401, detail="未授权")
    return user


def require_admin(
    current_user: User = Depends(get_current_user),
) -> User:
    """校验当前用户为管理员，不满足则 403。"""
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="需要管理员权限")
    return current_user


def verify_project_owner(project_id: int, current_user: User, session: Session):
    """校验项目存在且属于 current_user，返回 Project；失败抛 404/403。"""
    from src.models.project import Project
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在")
    if project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权访问此项目")
    return project


def verify_form_owner(form_id: int, current_user: User, session: Session):
    """校验表单存在且属于当前用户。"""
    from src.models.form import Form
    form = session.get(Form, form_id)
    if not form:
        raise HTTPException(status_code=404, detail="表单不存在")
    verify_project_owner(form.project_id, current_user, session)
    return form


def verify_field_definition_owner(fd_id: int, current_user: User, session: Session):
    """校验字段定义存在且属于当前用户。"""
    from src.models.field_definition import FieldDefinition
    field_definition = session.get(FieldDefinition, fd_id)
    if not field_definition:
        raise HTTPException(status_code=404, detail="字段定义不存在")
    verify_project_owner(field_definition.project_id, current_user, session)
    return field_definition


def verify_form_field_owner(ff_id: int, current_user: User, session: Session):
    """校验表单字段实例存在且属于当前用户。"""
    from src.models.form_field import FormField
    form_field = session.get(FormField, ff_id)
    if not form_field:
        raise HTTPException(status_code=404, detail="表单字段不存在")
    verify_form_owner(form_field.form_id, current_user, session)
    return form_field


def verify_project_codelist_owner(codelist_id: int, project_id: int, current_user: User, session: Session):
    """校验编码字典属于指定项目且当前用户可访问。"""
    from src.models.codelist import CodeList
    codelist = session.get(CodeList, codelist_id)
    if not codelist:
        raise HTTPException(status_code=404, detail="编码字典不存在")
    verify_project_owner(project_id, current_user, session)
    if codelist.project_id != project_id:
        raise HTTPException(status_code=403, detail="无权使用该项目外的编码字典")
    return codelist


def verify_project_unit_owner(unit_id: int, project_id: int, current_user: User, session: Session):
    """校验单位属于指定项目且当前用户可访问。"""
    from src.models.unit import Unit
    unit = session.get(Unit, unit_id)
    if not unit:
        raise HTTPException(status_code=404, detail="单位不存在")
    verify_project_owner(project_id, current_user, session)
    if unit.project_id != project_id:
        raise HTTPException(status_code=403, detail="无权使用该项目外的单位")
    return unit
