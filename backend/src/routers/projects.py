"""Projects Router"""
from typing import List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from pathlib import Path
import shutil

from src.database import get_session
from src.config import get_config
from src.models.project import Project
from src.repositories.project_repository import ProjectRepository
from src.schemas.project import ProjectCreate, ProjectUpdate, ProjectResponse

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=List[ProjectResponse])
def list_projects(session: Session = Depends(get_session)):
    return ProjectRepository(session).get_all()


@router.post("", response_model=ProjectResponse, status_code=201)
def create_project(data: ProjectCreate, session: Session = Depends(get_session)):
    repo = ProjectRepository(session)
    project = repo.create(Project(**data.model_dump()))
    return project


@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(project_id: int, session: Session = Depends(get_session)):
    project = ProjectRepository(session).get_by_id(project_id)
    if not project:
        raise HTTPException(404, "项目不存在")
    return project


@router.put("/{project_id}", response_model=ProjectResponse)
def update_project(project_id: int, data: ProjectUpdate, session: Session = Depends(get_session)):
    repo = ProjectRepository(session)
    project = repo.get_by_id(project_id)
    if not project:
        raise HTTPException(404, "项目不存在")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(project, k, v)
    repo.update(project)
    return project


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: int, session: Session = Depends(get_session)):
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    # 显式加载所有子关系，确保 ORM cascade 能正确级联删除
    stmt = (
        select(Project)
        .where(Project.id == project_id)
        .options(
            selectinload(Project.forms),
            selectinload(Project.visits),
            selectinload(Project.units),
            selectinload(Project.codelists),
            selectinload(Project.field_definitions),
        )
    )
    project = session.scalars(stmt).first()
    if not project:
        raise HTTPException(404, "项目不存在")
    session.delete(project)
    session.flush()


@router.get("/{project_id}/logo")
def get_logo(project_id: int, session: Session = Depends(get_session)):
    from fastapi.responses import FileResponse as FR
    project = ProjectRepository(session).get_by_id(project_id)
    if not project or not project.company_logo_path:
        raise HTTPException(404, "无Logo")
    logo_path = Path(get_config().upload_path) / "logos" / project.company_logo_path
    if not logo_path.exists():
        raise HTTPException(404, "文件不存在")
    return FR(str(logo_path))


@router.post("/{project_id}/logo", response_model=ProjectResponse)
def upload_logo(project_id: int, file: UploadFile = File(...), session: Session = Depends(get_session)):
    import uuid
    from src.utils import is_safe_file_upload

    repo = ProjectRepository(session)
    project = repo.get_by_id(project_id)
    if not project:
        raise HTTPException(404, "项目不存在")

    # 读取文件内容（前8KB足够魔数检测，避免内存溢出）
    file_content = file.file.read(8192)
    file.file.seek(0)  # 重置指针，后续还要读完整内容

    # 文件安全校验
    allowed_types = ["image/jpeg", "image/png", "image/gif", "image/bmp", "image/webp", "image/svg+xml"]
    is_valid, error_msg = is_safe_file_upload(
        filename=file.filename,
        content=file_content,
        allowed_mime_types=allowed_types,
        max_size_mb=5,
    )
    if not is_valid:
        raise HTTPException(status_code=400, detail=f"文件不安全: {error_msg}")

    # 使用UUID生成安全文件名，保留扩展名
    _, ext = file.filename.rsplit(".", 1) if "." in file.filename else ("", "jpg")
    safe_filename = f"{uuid.uuid4().hex}.{ext.lower()}"

    upload_dir = Path(get_config().upload_path) / "logos"
    upload_dir.mkdir(parents=True, exist_ok=True)

    # 删除旧logo（如果存在）
    if project.company_logo_path:
        old_logo = upload_dir / project.company_logo_path
        if old_logo.exists():
            old_logo.unlink()

    # 保存新文件
    file.file.seek(0)  # 确保从头读取
    with open(upload_dir / safe_filename, "wb") as f:
        shutil.copyfileobj(file.file, f)

    project.company_logo_path = safe_filename
    repo.update(project)
    return project
