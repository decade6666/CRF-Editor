// 旧行为套件的 API 边界仍由各 spec 自己脚本化；这里显式提供其固定、相互一致的设计快照标签。
// 不用于 C4 冲突测试（那些用真实 useApi + fetch 响应头验证，不允许自动获取最新标签）。
export function installDesignMetadataFixture(vi, api, { revision = '"fixture-design-state"' } = {}) {
  vi.spyOn(api, 'cachedGetWithMetadata').mockImplementation(async (url) => ({ data: await api.cachedGet(url), revision }));
  vi.spyOn(api, 'getWithMetadata').mockImplementation(async (url) => ({ data: await api.get(url), revision }));
  for (const method of ['post', 'put', 'patch']) {
    vi.spyOn(api, `${method}WithMetadata`).mockImplementation(async (url, body, options) => {
      if (options?.revision !== revision) throw new Error('测试命令必须显式携带已加载的固定设计标签');
      const data = method === 'patch'
        ? await api.patch(url, body, { invalidate: options.invalidate || [] })
        : await api[method](url, body);
      return { data, revision };
    });
  }
  vi.spyOn(api, 'delWithMetadata').mockImplementation(async (url, options) => {
    if (options?.revision !== revision) throw new Error('测试删除必须显式携带已加载的固定设计标签');
    return { data: await api.del(url), revision };
  });
}
