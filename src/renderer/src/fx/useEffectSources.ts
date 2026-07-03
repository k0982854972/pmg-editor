/**
 * State hook behind the meshdesc effect-source slots (max 5 loaded effect
 * XML files): dialog-based add, per-slot remove, persistence to
 * localStorage `fx.meshdescEffectSources` (migrating the legacy single-path
 * `fx.meshdescEffectSource` key), auto-reload of persisted paths on mount,
 * and auto-loading the sources that define an opened meshdesc's
 * effect_names via the main-process emitter index (window.api.
 * buildEffectIndex). Pure planning logic lives in effectSources.ts.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { EffectDocument } from '../../../core/fx/effectXml'
import { parseEffectXml } from '../../../core/fx/effectXml'
import type { MeshdescDocument } from '../../../core/fx/meshdesc'
import {
  collectReferencedEffectNames,
  MAX_EFFECT_SOURCES,
  partitionSourcesByUsefulness,
  planEffectSourceAutoLoad
} from './effectSources'
import { emitterNamesOf } from './meshdescPreviewModel'

export interface EffectSourceEntry {
  readonly path: string
  readonly doc: EffectDocument
}

export interface EffectSourcesHandle {
  readonly sources: readonly EffectSourceEntry[]
  /** Auto-load / add-failure status line (Traditional Chinese) or null. */
  readonly status: string | null
  readonly addSourceViaDialog: () => Promise<void>
  readonly removeSource: (index: number) => void
  /** Auto-loads the sources defining the meshdesc's effect_names. */
  readonly autoLoadForMeshdesc: (doc: MeshdescDocument) => void
}

const SOURCES_STORAGE_KEY = 'fx.meshdescEffectSources'
const LEGACY_SOURCE_STORAGE_KEY = 'fx.meshdescEffectSource'
const DATA_ROOT_STORAGE_KEY = 'fx.dataRoot'

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : '未知錯誤')

/** Persisted source paths; migrates the legacy single-path key. */
const readStoredSourcePaths = (): readonly string[] => {
  try {
    const raw = localStorage.getItem(SOURCES_STORAGE_KEY)
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        return parsed
          .filter((entry): entry is string => typeof entry === 'string' && entry !== '')
          .slice(0, MAX_EFFECT_SOURCES)
      }
      return []
    }
    const legacy = localStorage.getItem(LEGACY_SOURCE_STORAGE_KEY)
    return legacy !== null && legacy !== '' ? [legacy] : []
  } catch {
    return []
  }
}

const storeSourcePaths = (paths: readonly string[]): void => {
  try {
    localStorage.setItem(SOURCES_STORAGE_KEY, JSON.stringify(paths))
  } catch {
    // Persistence is best-effort; the in-memory list still applies.
  }
}

const readDataRoot = (): string => {
  try {
    return localStorage.getItem(DATA_ROOT_STORAGE_KEY)?.trim() ?? ''
  } catch {
    return ''
  }
}

const loadSourceAt = async (path: string): Promise<EffectSourceEntry | null> => {
  try {
    const result = await window.api.openFxPath(path)
    if (!result) return null
    return { path: result.path, doc: parseEffectXml(new Uint8Array(result.data)) }
  } catch {
    return null
  }
}

const lowercaseEmitterNameSet = (sources: readonly EffectSourceEntry[]): Set<string> =>
  new Set(sources.flatMap((source) => emitterNamesOf(source.doc).map((name) => name.toLowerCase())))

const hasPath = (sources: readonly EffectSourceEntry[], path: string): boolean =>
  sources.some((source) => source.path.toLowerCase() === path.toLowerCase())

/** Composes the auto-load status line from the outcome parts. */
const autoLoadStatusText = (
  loadedCount: number,
  evictedCount: number,
  missingNames: readonly string[],
  isTruncated: boolean
): string | null => {
  const parts: string[] = []
  if (loadedCount > 0) parts.push(`✓ 自動載入 ${loadedCount} 個特效來源`)
  if (evictedCount > 0) parts.push(`↻ 已汰換 ${evictedCount} 個未引用來源`)
  if (missingNames.length > 0) parts.push(`✗ 找不到定義：${missingNames.join('、')}`)
  if (isTruncated) parts.push(`⚠ 來源超過上限，已載入前 ${MAX_EFFECT_SOURCES} 個`)
  return parts.length > 0 ? parts.join('；') : null
}

export function useEffectSources(): EffectSourcesHandle {
  const [sources, setSources] = useState<readonly EffectSourceEntry[]>([])
  const [status, setStatus] = useState<string | null>(null)
  // Latest sources for async flows; kept in sync with every state update.
  const sourcesRef = useRef<readonly EffectSourceEntry[]>([])
  // Guards stale auto-load results when another meshdesc opens quickly.
  const autoLoadRequestRef = useRef(0)

  const applySources = useCallback((next: readonly EffectSourceEntry[]): void => {
    sourcesRef.current = next
    setSources(next)
    storeSourcePaths(next.map((source) => source.path))
  }, [])

  // Auto-reload the persisted source files on mount (order preserved,
  // stale paths silently skipped; storage is not rewritten on failures).
  useEffect(() => {
    let isCancelled = false
    const storedPaths = readStoredSourcePaths()
    if (storedPaths.length === 0) return undefined
    Promise.all(storedPaths.map(loadSourceAt)).then((loaded) => {
      if (isCancelled) return
      const entries = loaded.filter((entry): entry is EffectSourceEntry => entry !== null)
      sourcesRef.current = entries
      setSources(entries)
    })
    return () => {
      isCancelled = true
    }
  }, [])

  const addSourceViaDialog = useCallback(async (): Promise<void> => {
    try {
      const result = await window.api.openFx()
      if (!result) return
      const current = sourcesRef.current
      if (current.length >= MAX_EFFECT_SOURCES || hasPath(current, result.path)) return
      const doc = parseEffectXml(new Uint8Array(result.data))
      applySources([...current, { path: result.path, doc }])
    } catch (error) {
      setStatus(`✗ 載入特效來源失敗：${messageOf(error)}`)
    }
  }, [applySources])

  const removeSource = useCallback(
    (index: number): void => {
      applySources(sourcesRef.current.filter((_, sourceIndex) => sourceIndex !== index))
    },
    [applySources]
  )

  const autoLoadForMeshdesc = useCallback(
    (doc: MeshdescDocument): void => {
      const requestId = autoLoadRequestRef.current + 1
      autoLoadRequestRef.current = requestId
      const run = async (): Promise<void> => {
        const referencedNames = collectReferencedEffectNames(doc)
        const resolvableNames = lowercaseEmitterNameSet(sourcesRef.current)
        const unresolved = referencedNames.filter(
          (name) => !resolvableNames.has(name.toLowerCase())
        )
        if (unresolved.length === 0) {
          setStatus(null)
          return
        }
        const dataRoot = readDataRoot()
        if (dataRoot === '') {
          setStatus('✗ 尚未設定資料根目錄（無法自動載入）')
          return
        }
        setStatus('索引中…')
        const index = await window.api.buildEffectIndex(dataRoot)
        if (autoLoadRequestRef.current !== requestId) return
        if (!index) {
          setStatus('✗ 找不到特效目錄（gfx/fx/effect）')
          return
        }
        const current = sourcesRef.current
        // Sources still resolving names of THIS meshdesc are protected; the
        // rest (leftovers from a previous file) may be evicted for room.
        const { useful, unused } = partitionSourcesByUsefulness(
          current.map((entry) => ({
            entry,
            path: entry.path,
            names: new Set(emitterNamesOf(entry.doc).map((name) => name.toLowerCase()))
          })),
          referencedNames
        )
        const plan = planEffectSourceAutoLoad({
          referencedNames: unresolved,
          resolvableNames: lowercaseEmitterNameSet(current),
          loadedPaths: current.map((source) => source.path),
          indexEntries: index.entries,
          freeSlots: MAX_EFFECT_SOURCES - useful.length
        })
        const loaded = (await Promise.all(plan.paths.map(loadSourceAt))).filter(
          (entry): entry is EffectSourceEntry => entry !== null
        )
        if (autoLoadRequestRef.current !== requestId) return
        // useful first, then newly loaded, then old unused ones while room remains
        const next: EffectSourceEntry[] = useful.map((source) => source.entry)
        for (const entry of loaded) {
          if (next.length >= MAX_EFFECT_SOURCES) break
          if (!hasPath(next, entry.path)) next.push(entry)
        }
        for (const source of unused) {
          if (next.length >= MAX_EFFECT_SOURCES) break
          if (!hasPath(next, source.entry.path)) next.push(source.entry)
        }
        const loadedCount = loaded.filter((entry) => hasPath(next, entry.path)).length
        const evictedCount = unused.filter((source) => !hasPath(next, source.entry.path)).length
        const hasChanged =
          next.length !== current.length ||
          next.some((entry, i) => entry.path !== current[i]?.path)
        if (hasChanged) applySources(next)
        setStatus(autoLoadStatusText(loadedCount, evictedCount, plan.missingNames, plan.isTruncated))
      }
      run().catch((error) => {
        if (autoLoadRequestRef.current === requestId) {
          setStatus(`✗ 自動載入失敗：${messageOf(error)}`)
        }
      })
    },
    [applySources]
  )

  return { sources, status, addSourceViaDialog, removeSource, autoLoadForMeshdesc }
}
