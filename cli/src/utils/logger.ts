/**
 * Simple CLI logger helpers
 * ---------------------------------------------------------------------------
 * Purpose: centralize logging helpers so every CLI command prints consistently.
 */

export function logInfo(message: string, data?: unknown) {
  if (data === undefined) {
    console.log(`[info] ${message}`)
    return
  }
  console.log(`[info] ${message}`, data)
}

export function logWarn(message: string, data?: unknown) {
  if (data === undefined) {
    console.warn(`[warn] ${message}`)
    return
  }
  console.warn(`[warn] ${message}`, data)
}

export function logError(message: string, error?: unknown) {
  if (error === undefined) {
    console.error(`[error] ${message}`)
    return
  }
  console.error(`[error] ${message}`, error)
}

export function logTable(rows: unknown[]) {
  console.table(rows)
}
