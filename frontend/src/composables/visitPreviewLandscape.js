export function shouldUseLandscapePreview(renderGroups) {
  return renderGroups.some(group => group.type === 'inline' && group.fields.length > 4)
}
