"""Visits Router"""

from typing import List

from fastapi import APIRouter, Depends, HTTPException

from pydantic import BaseModel, Field

from sqlalchemy.orm import Session, selectinload



from src.database import get_session

from src.dependencies import get_current_user, verify_form_owner, verify_project_owner

from src.models.user import User

from src.models.visit import Visit

from src.repositories.base_repository import BaseRepository

from src.schemas.visit import VisitCreate, VisitUpdate, VisitResponse

from src.schemas import BatchDeleteRequest

from src.services.order_service import OrderService



router = APIRouter(tags=["visits"])





class VisitFormSequenceUpdate(BaseModel):

    sequence: int = Field(..., ge=1, description="目标序号（从 1 开始）")





@router.get("/projects/{project_id}/visits", response_model=List[VisitResponse])

def list_visits(project_id: int, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):

    verify_project_owner(project_id, current_user, session)

    from sqlalchemy import select

    stmt = select(Visit).where(Visit.project_id == project_id).order_by(Visit.sequence)

    return list(session.scalars(stmt).all())





@router.post("/projects/{project_id}/visits", response_model=VisitResponse, status_code=201)

def create_visit(project_id: int, data: VisitCreate, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):

    verify_project_owner(project_id, current_user, session)

    from src.utils import generate_code

    dump = data.model_dump(exclude={'sequence'})

    if not dump.get("code"):

        dump["code"] = generate_code("VISIT")



    visit = Visit(project_id=project_id, **dump)



    if data.sequence is None:

        visit.sequence = OrderService.get_next_sequence(session, Visit, Visit.project_id == project_id)

        session.add(visit)

    else:

        OrderService.insert_at_sequence(session, Visit, Visit.project_id == project_id, visit, data.sequence)



    session.flush()

    return visit





@router.put("/projects/{project_id}/visits/{visit_id}", response_model=VisitResponse)

def update_visit(project_id: int, visit_id: int, data: VisitUpdate, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):

    verify_project_owner(project_id, current_user, session)

    repo = BaseRepository(session, Visit)

    visit = repo.get_by_id(visit_id)

    if not visit:

        raise HTTPException(404, "访视不存在")

    if visit.project_id != project_id:

        raise HTTPException(403, "无权修改该项目的访视")



    old_seq = visit.sequence



    for k, v in data.model_dump(exclude={'sequence'}, exclude_unset=True).items():

        setattr(visit, k, v)



    if data.sequence is not None and data.sequence != old_seq:

        OrderService.move_to_sequence(session, Visit, Visit.project_id == visit.project_id, visit, data.sequence)



    session.flush()

    return visit





@router.delete("/visits/{visit_id}", status_code=204)

def delete_visit(visit_id: int, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):

    repo = BaseRepository(session, Visit)

    visit = repo.get_by_id(visit_id)

    if not visit:

        raise HTTPException(404, "访视不存在")

    verify_project_owner(visit.project_id, current_user, session)

    OrderService.delete_and_compact_sequence(session, Visit, Visit.project_id == visit.project_id, visit)





@router.post("/projects/{project_id}/visits/batch-delete")

def batch_delete_visits(project_id: int, data: BatchDeleteRequest, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):

    verify_project_owner(project_id, current_user, session)

    count = BaseRepository(session, Visit).batch_delete(data.ids, project_id=project_id)

    OrderService.compact_after_batch_delete_sequence(session, Visit, Visit.project_id == project_id)

    return {"deleted": count}





@router.post("/projects/{project_id}/visits/reorder")

def reorder_visits(project_id: int, id_list: List[int], session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):

    """批量重排序号（拖拽场景）"""

    verify_project_owner(project_id, current_user, session)

    OrderService.reorder_batch_sequence(session, Visit, Visit.project_id == project_id, id_list)

    return {"message": "Reordered"}





@router.post("/visits/{visit_id}/copy", response_model=VisitResponse, status_code=201)

def copy_visit(visit_id: int, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):

    """复制访视，name 加 _copy 后缀（冲突时追加数字），sequence 取当前最大值+1"""

    from sqlalchemy import select

    repo = BaseRepository(session, Visit)

    src = repo.get_by_id(visit_id)

    if not src:

        raise HTTPException(404, "访视不存在")

    verify_project_owner(src.project_id, current_user, session)

    # 生成不冲突的 name

    base = src.name + "_copy"

    candidate = base

    idx = 1

    while session.scalar(select(Visit).where(Visit.project_id == src.project_id, Visit.name == candidate)):

        candidate = f"{base}{idx}"

        idx += 1

    from src.utils import generate_code

    # sequence 取当前最大值+1

    new_visit = Visit(project_id=src.project_id, name=candidate, code=generate_code("VISIT"), sequence=OrderService.get_next_sequence(session, Visit, Visit.project_id == src.project_id))

    return repo.create(new_visit)





@router.get("/projects/{project_id}/visit-form-matrix")

def visit_form_matrix(project_id: int, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):

    """返回访视-表单分布矩阵数据"""

    verify_project_owner(project_id, current_user, session)

    from sqlalchemy import select

    from src.models.form import Form

    stmt = select(Visit).where(Visit.project_id == project_id).order_by(Visit.sequence).options(selectinload(Visit.visit_forms))

    visits = list(session.scalars(stmt).all())

    forms_stmt = select(Form).where(Form.project_id == project_id).order_by(Form.order_index, Form.name)

    forms = list(session.scalars(forms_stmt).all())

    matrix = {v.id: {vf.form_id: vf.sequence for vf in v.visit_forms} for v in visits}

    return {

        "visits": [{"id": v.id, "name": v.name, "sequence": v.sequence} for v in visits],

        "forms": [{"id": f.id, "name": f.name} for f in forms],

        "matrix": matrix,

    }





@router.post("/visits/{visit_id}/forms/{form_id}", status_code=201)

def add_visit_form(visit_id: int, form_id: int, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):

    """将表单加入访视"""

    from sqlalchemy import select, func

    from src.models.visit_form import VisitForm

    visit = session.get(Visit, visit_id)
    if not visit:
        raise HTTPException(404, "访视不存在")
    verify_project_owner(visit.project_id, current_user, session)
    form = verify_form_owner(form_id, current_user, session)
    if form.project_id != visit.project_id:
        raise HTTPException(403, "无权跨项目关联访视与表单")

    existing = session.scalar(select(VisitForm).where(VisitForm.visit_id == visit_id, VisitForm.form_id == form_id))

    if existing:

        return {"id": existing.id}

    max_seq = session.scalar(select(func.max(VisitForm.sequence)).where(VisitForm.visit_id == visit_id)) or 0

    vf = VisitForm(visit_id=visit_id, form_id=form_id, sequence=max_seq + 1)

    session.add(vf)

    session.flush()  # flush 让 DB 分配 id，此时 vf.id 已有值

    new_id = vf.id   # 在 commit/事务关闭前保存 id

    return {"id": new_id}





@router.put("/visits/{visit_id}/forms/{form_id}")

def update_visit_form_sequence(

    visit_id: int,

    form_id: int,

    body: VisitFormSequenceUpdate,

    session: Session = Depends(get_session),

    current_user: User = Depends(get_current_user),

):

    """更新访视-表单关联的 sequence"""

    from sqlalchemy import select

    from src.models.visit_form import VisitForm

    visit = session.get(Visit, visit_id)
    if not visit:
        raise HTTPException(404, "访视不存在")
    verify_project_owner(visit.project_id, current_user, session)
    form = verify_form_owner(form_id, current_user, session)
    if form.project_id != visit.project_id:
        raise HTTPException(403, "无权跨项目关联访视与表单")

    vf = session.scalar(select(VisitForm).where(VisitForm.visit_id == visit_id, VisitForm.form_id == form_id))

    if not vf:

        raise HTTPException(404, "关联不存在")

    try:

        OrderService.move_to_sequence(session, VisitForm, VisitForm.visit_id == visit_id, vf, body.sequence)

    except ValueError:

        raise HTTPException(400, "sequence 越界，请检查目标序号是否在有效范围内")

    session.flush()

    return {"id": vf.id, "sequence": vf.sequence}





@router.delete("/visits/{visit_id}/forms/{form_id}", status_code=204)

def remove_visit_form(visit_id: int, form_id: int, session: Session = Depends(get_session), current_user: User = Depends(get_current_user)):

    """从访视移除表单"""

    from sqlalchemy import select

    from src.models.visit_form import VisitForm

    visit = session.get(Visit, visit_id)
    if not visit:
        raise HTTPException(404, "访视不存在")
    verify_project_owner(visit.project_id, current_user, session)
    form = verify_form_owner(form_id, current_user, session)
    if form.project_id != visit.project_id:
        raise HTTPException(403, "无权跨项目关联访视与表单")

    vf = session.scalar(select(VisitForm).where(VisitForm.visit_id == visit_id, VisitForm.form_id == form_id))

    if vf:

        OrderService.delete_and_compact_sequence(session, VisitForm, VisitForm.visit_id == visit_id, vf)

