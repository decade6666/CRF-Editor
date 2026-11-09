"""Agent 访问属主管理 DTO（封闭 schema，元数据-only 响应）。"""

from typing import List, Optional

from pydantic import BaseModel, Field

PERMISSION_PATTERN = r"^(read|read_write)$"


class AgentCredentialCreate(BaseModel):
    """发放凭据请求。"""

    model_config = {"extra": "forbid"}

    name: str = Field(min_length=1, max_length=255)
    permission: str = Field(pattern=PERMISSION_PATTERN, default="read")
    expires_hours: float = Field(gt=0, le=168, default=24)


class AgentCredentialResponse(BaseModel):
    """凭据元数据响应；绝不包含令牌。"""

    model_config = {"from_attributes": True}

    id: int
    project_id: int
    name: str
    permission: str
    expires_at: str
    revoked: bool
    created_at: str


class AgentCredentialIssuedResponse(AgentCredentialResponse):
    """发放成功响应：令牌仅此一次返回。"""

    token: str


class AgentChangeImpactItem(BaseModel):
    """共享提案影响行（受影响表单/实例）。"""

    form_id: int
    form_oid: Optional[str] = None
    form_name: str
    visit_names: List[str] = Field(default_factory=list)
    instance_ids: List[int] = Field(default_factory=list)
    attribute_changes: List[dict] = Field(default_factory=list)


class AgentChangeProposalDetail(BaseModel):
    """完整提案详情（不可变内容 + 审批状态 + 服务端执行指示）。"""

    change_id: int
    definition_id: int
    tool_name: str
    status: str
    approval_state: Optional[str] = None
    applied: bool = False
    patch: dict
    impact: List[AgentChangeImpactItem] = Field(default_factory=list)
    semantic_diff: List[dict] = Field(default_factory=list)
    base_fingerprint: str
    proposal_digest: str
    expires_at: Optional[str] = None
    created_at: str


class AgentChangeSummary(BaseModel):
    """提案列表摘要行（applied 来自持久化应用证据，非内部命令状态）。"""

    change_id: int
    definition_id: int
    tool_name: str
    approval_state: Optional[str] = None
    status: Optional[str] = None
    applied: bool = False
    created_at: str
    expires_at: Optional[str] = None


class AgentChangeListResponse(BaseModel):
    """提案分页列表。"""

    changes: List[AgentChangeSummary]
    total: int
    offset: int
    has_more: bool


class AgentChangeDecisionRequest(BaseModel):
    """审批/驳回请求：绑定展示的提案摘要。"""

    model_config = {"extra": "forbid"}

    proposal_digest: str
