export function shouldResetExportDownload(previousProjectId, nextProjectId) {
  if (previousProjectId == null) {
    return false
  }

  return previousProjectId !== nextProjectId
}

export function canUseClipboardWriteText(clipboard, isSecureContext) {
  return Boolean(isSecureContext && typeof clipboard?.writeText === 'function')
}

export function resolveDownloadLink(downloadUrl, origin) {
  if (!downloadUrl) {
    return ''
  }

  if (!origin) {
    return downloadUrl
  }

  return new URL(downloadUrl, origin).toString()
}

export function getDownloadFilename(contentDisposition, fallbackFilename) {
  if (!contentDisposition) {
    return fallbackFilename
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1])
    } catch {
      return fallbackFilename
    }
  }

  const plainMatch = contentDisposition.match(/filename="?([^";]+)"?/i)
  if (plainMatch?.[1]) {
    return plainMatch[1]
  }

  return fallbackFilename
}
