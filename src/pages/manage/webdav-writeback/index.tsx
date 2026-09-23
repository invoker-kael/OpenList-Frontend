import {
  Badge,
  Box,
  Button,
  Checkbox,
  FormControl,
  FormLabel,
  Heading,
  HStack,
  Input,
  Select,
  SelectContent,
  SelectListbox,
  SelectOption,
  SelectOptionText,
  SelectTrigger,
  SelectValue,
  SimpleGrid,
  Switch as HopeSwitch,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  VStack,
} from "@hope-ui/solid"
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js"
import { useManageTitle, useT } from "~/hooks"
import { Resp } from "~/types"
import { handleResp, notify, r } from "~/utils"

type Tab = "overview" | "active" | "history" | "settings"

type StateSummary = {
  count: number
  bytes: number
}

type Summary = {
  enabled: boolean
  workers: number
  receiving: number
  receiving_expected_bytes: number
  receiving_reservation_bytes: number
  backlog_bytes: number
  completed_cache_bytes: number
  max_pending_spool_bytes: number
  reserve_free_space_bytes: number
  completed_cache_ttl_minutes: number
  disk_total_bytes: number
  disk_used_bytes: number
  disk_free_bytes: number
  disk_error?: string
  missing_spool: number
  restart_recovery: number
  waiting_provider_verification: number
  needs_cloudsync_rehydrate: number
  automatic_recovery: number
  remote_hash_mismatch: number
  errors: number
  states: Record<string, StateSummary>
  updated_at: string
}

type ActiveRow = {
  id: string
  path: string
  name: string
  is_dir: boolean
  size: number
  received_bytes?: number
  provider_uploaded_bytes?: number
  client_state: string
  provider_state: string
  effective_status: string
  operator_action?: string
  generation: number
  remote_generation: number
  etag: string
  payload_sha1: string
  remote_sha1: string
  remote_object_id: string
  retry_count: number
  verify_count: number
  active_receivers?: number
  last_error: string
  resolution_reason?: string
  retry_at?: string
  recovery_state?: string
  remote_verified_at?: string
  ack_time?: string
  durable_at?: string
  completed_at?: string
  started_at?: string
  created_at: string
  updated_at: string
}

type HistoryRow = {
  id: number
  path: string
  parent: string
  name: string
  generation: number
  size: number
  is_dir: boolean
  started_at?: string
  ack_time?: string
  durable_at?: string
  provider_upload_started_at?: string
  provider_upload_completed_at?: string
  completed_at?: string
  result: string
  final_state: string
  recovery_type: string
  effective_status: string
  operator_action?: string
  current_generation?: number
  current_provider_state?: string
  current_recovery_state?: string
  current_ack_time?: string
  current_completed_at?: string
  payload_sha1: string
  remote_sha1: string
  remote_object_id: string
  remote_verified_at?: string
  retry_count: number
  verify_count: number
  last_error: string
  resolution_reason?: string
  mime_type: string
  created_at: string
  updated_at: string
}

type Settings = {
  enabled: boolean
  reserve_free_space_mb: number
  max_pending_spool_mb: number
  incoming_reservation_chunk_mb: number
  workers: number
  upload_workers: number
  large_upload_workers: number
  provider_probe_workers: number
  completed_cache_ttl_minutes: number
  completed_remote_probe_seconds: number
  cloudsync_settle_millis: number
  cloudsync_placeholder_millis: number
  retry_initial_seconds: number
  retry_max_seconds: number
  verify_interval_seconds: number
  verify_attempts: number
  spool_dir: string
  restart_required_fields?: string[]
}

type CacheCleanup = {
  eligible: number
  eligible_bytes: number
  released: number
  released_bytes: number
  truncated?: boolean
}

type HistoryCleanup = {
  deleted: number
}

type Choice = {
  value: string
  label: string
}

type SortDirection = "asc" | "desc"
type ActiveSortKey =
  | "path"
  | "size"
  | "progress"
  | "status"
  | "action"
  | "state"
  | "recovery"
  | "retry"
  | "verify"
  | "started"
  | "updated"
  | "retry_at"
  | "error"
type HistorySortKey =
  | "path"
  | "status"
  | "action"
  | "current_generation"
  | "current_state"
  | "size"
  | "updated"
  | "completed"

const API = "/admin/webdav-writeback"
const AUTO_REFRESH_CHOICES = [
  "1",
  "2",
  "3",
  "5",
  "10",
  "15",
  "20",
  "30",
  "45",
  "60",
]

const unwrap = async <T,>(request: Promise<Resp<T>>): Promise<T> => {
  const resp = await request
  return await new Promise<T>((resolve, reject) => {
    handleResp(
      resp,
      resolve,
      (message) => reject(new Error(message)),
      true,
      false,
    )
  })
}

const get = <T,>(path: string) =>
  unwrap<T>(r.get(API + path) as unknown as Promise<Resp<T>>)

const post = <T,>(path: string, body: unknown = {}) =>
  unwrap<T>(r.post(API + path, body) as unknown as Promise<Resp<T>>)

const bytes = (raw?: number) => {
  let value = Number(raw || 0)
  if (!value) return "0 B"
  const units = ["B", "KiB", "MiB", "GiB", "TiB"]
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${i ? value.toFixed(2) : value.toFixed(0)} ${units[i]}`
}

const time = (raw?: string) => (raw ? new Date(raw).toLocaleString() : "-")

const duration = (start?: string, end?: string) => {
  if (!start || !end) return "-"
  const ms = new Date(end).getTime() - new Date(start).getTime()
  if (ms < 0) return "-"
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
}

const StatCard = (props: {
  label: string
  value: string | number
  hint?: string
}) => (
  <Box w="$full" borderWidth="1px" borderColor="$neutral6" rounded="$lg" p="$3">
    <Text size="sm" color="$neutral10">
      {props.label}
    </Text>
    <Heading size="lg" mt="$1">
      {props.value}
    </Heading>
    <Show when={props.hint}>
      <Text size="xs" color="$neutral10" mt="$1">
        {props.hint}
      </Text>
    </Show>
  </Box>
)

const SortControls = (props: {
  onSort: (direction: SortDirection) => void
  ascLabel: string
  descLabel: string
}) => (
  <HStack spacing="$2" mb="$2">
    <Button variant="outline" onClick={() => props.onSort("asc")}>
      {props.ascLabel}
    </Button>
    <Button variant="outline" onClick={() => props.onSort("desc")}>
      {props.descLabel}
    </Button>
  </HStack>
)

const HeaderFilter = (props: {
  label: string
  active?: boolean
  sortDirection?: SortDirection
  onSort?: (direction: SortDirection) => void
  sortAscLabel?: string
  sortDescLabel?: string
  children: any
}) => (
  <details>
    <summary
      style={{
        cursor: "pointer",
        "white-space": "nowrap",
        "user-select": "none",
      }}
    >
      {props.label} {props.sortDirection === "asc" ? "↑" : ""}
      {props.sortDirection === "desc" ? "↓" : ""} {props.active ? "•" : "▾"}
    </summary>
    <Box mt="$2" minW="$48">
      <Show when={props.onSort}>
        <SortControls
          onSort={props.onSort!}
          ascLabel={props.sortAscLabel || "↑"}
          descLabel={props.sortDescLabel || "↓"}
        />
      </Show>
      {props.children}
    </Box>
  </details>
)

const SortableHeader = (props: {
  label: string
  sortDirection?: SortDirection
  onSort: (direction: SortDirection) => void
  ascLabel: string
  descLabel: string
}) => (
  <details>
    <summary
      style={{
        cursor: "pointer",
        "white-space": "nowrap",
        "user-select": "none",
      }}
    >
      {props.label} {props.sortDirection === "asc" ? "↑" : ""}
      {props.sortDirection === "desc" ? "↓" : ""} ▾
    </summary>
    <Box mt="$2" minW="$40">
      <SortControls
        onSort={props.onSort}
        ascLabel={props.ascLabel}
        descLabel={props.descLabel}
      />
    </Box>
  </details>
)

const ChoiceSelect = (props: {
  value: string
  onChange: (value: string) => void
  choices: Choice[]
  minW?: string
}) => (
  <Select
    value={props.value}
    onChange={(value) => props.onChange((value as string) || "")}
  >
    <SelectTrigger minW={props.minW || "$48"}>
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectListbox>
        <For each={props.choices}>
          {(choice) => (
            <SelectOption value={choice.value}>
              <SelectOptionText>{choice.label}</SelectOptionText>
            </SelectOption>
          )}
        </For>
      </SelectListbox>
    </SelectContent>
  </Select>
)

type ColumnWidths = Record<string, number>

const COLUMN_WIDTH_MIN = 56
const ACTIVE_COLUMN_WIDTHS: ColumnWidths = {
  path: 420,
  size: 100,
  progress: 150,
  status: 140,
  action: 160,
  state: 130,
  recovery: 150,
  retry: 80,
  verify: 80,
  started: 180,
  updated: 180,
  retry_at: 180,
  error: 360,
}
const HISTORY_COLUMN_WIDTHS: ColumnWidths = {
  select: 56,
  path: 420,
  status: 150,
  action: 170,
  current_generation: 130,
  current_state: 150,
  size: 100,
  updated: 180,
  completed: 180,
}

const loadColumnWidths = (
  storageKey: string,
  defaults: ColumnWidths,
): ColumnWidths => {
  if (typeof window === "undefined") return { ...defaults }
  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return { ...defaults }
    const stored = JSON.parse(raw) as Record<string, unknown>
    return Object.fromEntries(
      Object.entries(defaults).map(([key, fallback]) => {
        const value = Number(stored[key])
        return [
          key,
          Number.isFinite(value) ? Math.max(COLUMN_WIDTH_MIN, value) : fallback,
        ]
      }),
    )
  } catch {
    return { ...defaults }
  }
}

const saveColumnWidths = (storageKey: string, widths: ColumnWidths) => {
  if (typeof window === "undefined") return
  window.localStorage.setItem(storageKey, JSON.stringify(widths))
}

const totalColumnWidth = (widths: ColumnWidths) =>
  Object.values(widths).reduce((sum, width) => sum + width, 0)

const beginColumnResize = (
  event: MouseEvent,
  width: number,
  onResize: (width: number) => void,
) => {
  event.preventDefault()
  event.stopPropagation()

  const startX = event.clientX
  const startWidth = width
  const previousCursor = document.body.style.cursor
  const previousUserSelect = document.body.style.userSelect
  document.body.style.cursor = "col-resize"
  document.body.style.userSelect = "none"

  const onMove = (moveEvent: MouseEvent) => {
    onResize(
      Math.max(
        COLUMN_WIDTH_MIN,
        Math.round(startWidth + moveEvent.clientX - startX),
      ),
    )
  }
  const onUp = () => {
    window.removeEventListener("mousemove", onMove)
    document.body.style.cursor = previousCursor
    document.body.style.userSelect = previousUserSelect
  }

  window.addEventListener("mousemove", onMove)
  window.addEventListener("mouseup", onUp, { once: true })
}

const ResizableTh = (props: {
  width: number
  onResize: (width: number) => void
  children?: any
}) => (
  <Th
    style={{
      position: "relative",
      width: `${props.width}px`,
      "min-width": `${props.width}px`,
      "max-width": `${props.width}px`,
    }}
  >
    {props.children}
    <div
      aria-hidden="true"
      onMouseDown={(event) =>
        beginColumnResize(event, props.width, props.onResize)
      }
      style={{
        position: "absolute",
        top: "0",
        right: "-4px",
        width: "8px",
        height: "100%",
        cursor: "col-resize",
        "z-index": "2",
        "border-right": "1px solid var(--hope-colors-neutral6)",
      }}
    />
  </Th>
)

const WebDAVWriteback = () => {
  const t = useT()
  useManageTitle("webdav_writeback.title")

  const [tab, setTab] = createSignal<Tab>("overview")
  const [summary, setSummary] = createSignal<Summary>()
  const [activeRows, setActiveRows] = createSignal<ActiveRow[]>([])
  const [historyRows, setHistoryRows] = createSignal<HistoryRow[]>([])
  const [settings, setSettings] = createSignal<Settings>()
  const [error, setError] = createSignal("")
  const [lastUpdated, setLastUpdated] = createSignal<Date>()
  const [refreshing, setRefreshing] = createSignal(false)
  const [autoRefreshEnabled, setAutoRefreshEnabled] = createSignal(true)
  const [autoRefreshSeconds, setAutoRefreshSeconds] = createSignal("3")
  const [cacheStatus, setCacheStatus] = createSignal("")
  const [historyStatus, setHistoryStatus] = createSignal("")
  const [settingsStatus, setSettingsStatus] = createSignal("")

  const [activeState, setActiveState] = createSignal("active")
  const [activeSearch, setActiveSearch] = createSignal("")
  const [activeSortKey, setActiveSortKey] =
    createSignal<ActiveSortKey>("updated")
  const [activeSortDirection, setActiveSortDirection] =
    createSignal<SortDirection>("desc")

  const [historySearch, setHistorySearch] = createSignal("")
  const [historySortKey, setHistorySortKey] =
    createSignal<HistorySortKey>("updated")
  const [historySortDirection, setHistorySortDirection] =
    createSignal<SortDirection>("desc")
  const [historyGroup, setHistoryGroup] = createSignal("all")
  const [historyFinalStatus, setHistoryFinalStatus] = createSignal("all")
  const [historyAction, setHistoryAction] = createSignal("all")
  const [historyCurrentState, setHistoryCurrentState] = createSignal("all")
  const [historyGeneration, setHistoryGeneration] = createSignal("")
  const [historyResult, setHistoryResult] = createSignal("all")
  const [historyRecovery, setHistoryRecovery] = createSignal("all")
  const [historyError, setHistoryError] = createSignal("all")
  const [historyAfter, setHistoryAfter] = createSignal("")
  const [historyBefore, setHistoryBefore] = createSignal("")
  const [historyLimit, setHistoryLimit] = createSignal("200")
  const [selectedHistory, setSelectedHistory] = createSignal<number[]>([])
  const [cleanupClass, setCleanupClass] = createSignal("successful")
  const [cleanupDays, setCleanupDays] = createSignal(30)

  const activeColumnStorageKey = "webdav-writeback-active-column-widths-v1"
  const historyColumnStorageKey = "webdav-writeback-history-column-widths-v1"
  const [activeColumnWidths, setActiveColumnWidths] = createSignal<ColumnWidths>(
    loadColumnWidths(activeColumnStorageKey, ACTIVE_COLUMN_WIDTHS),
  )
  const [historyColumnWidths, setHistoryColumnWidths] =
    createSignal<ColumnWidths>(
      loadColumnWidths(historyColumnStorageKey, HISTORY_COLUMN_WIDTHS),
    )

  const setColumnWidth = (
    storageKey: string,
    setter: (value: ColumnWidths) => void,
    current: () => ColumnWidths,
    key: string,
    width: number,
  ) => {
    const next = { ...current(), [key]: Math.max(COLUMN_WIDTH_MIN, width) }
    setter(next)
    saveColumnWidths(storageKey, next)
  }

  const setActiveColumnWidth = (key: string, width: number) =>
    setColumnWidth(
      activeColumnStorageKey,
      setActiveColumnWidths,
      activeColumnWidths,
      key,
      width,
    )
  const setHistoryColumnWidth = (key: string, width: number) =>
    setColumnWidth(
      historyColumnStorageKey,
      setHistoryColumnWidths,
      historyColumnWidths,
      key,
      width,
    )
  const resetActiveColumnWidths = () => {
    const next = { ...ACTIVE_COLUMN_WIDTHS }
    setActiveColumnWidths(next)
    saveColumnWidths(activeColumnStorageKey, next)
  }
  const resetHistoryColumnWidths = () => {
    const next = { ...HISTORY_COLUMN_WIDTHS }
    setHistoryColumnWidths(next)
    saveColumnWidths(historyColumnStorageKey, next)
  }
  const activeTableWidth = createMemo(() =>
    totalColumnWidth(activeColumnWidths()),
  )
  const historyTableWidth = createMemo(() =>
    totalColumnWidth(historyColumnWidths()),
  )

  const translateValue = (
    group: "state" | "result" | "recovery" | "cleanup" | "status" | "action",
    value?: string,
  ) => (value ? t(`webdav_writeback.${group}.${value}`, undefined, value) : "-")

  const stateColor = (value?: string) => {
    switch (value) {
      case "completed":
        return "success"
      case "uploading":
      case "verifying":
      case "receiving":
        return "info"
      case "error":
      case "recovery_required":
      case "remote_missing":
        return "danger"
      case "queued":
        return "warning"
      default:
        return "neutral"
    }
  }

  const cloudSyncStatus = (status?: string, action?: string) => {
    if (action === "restart_cloudsync_required") return "waiting_reupload"
    switch (status) {
      case "receiving":
      case "reupload_receiving":
        return "receiving"
      case "completed":
      case "recovered":
        return "completed"
      case "deleted":
        return "deleted"
      default:
        return "syncing"
    }
  }

  const cloudSyncStatusColor = (value?: string) => {
    switch (value) {
      case "completed":
        return "success"
      case "waiting_reupload":
        return "danger"
      case "receiving":
      case "syncing":
        return "info"
      default:
        return "neutral"
    }
  }

  const cloudSyncStatusLabel = (value?: string) =>
    t(`webdav_writeback.cloudsync_status.${value || "syncing"}`)

  const activeProgress = (row: ActiveRow) => {
    if (row.size <= 0) return undefined
    if (row.effective_status === "receiving") {
      return Math.max(
        0,
        Math.min(100, ((row.received_bytes || 0) / row.size) * 100),
      )
    }
    if (row.provider_state === "uploading") {
      return Math.max(
        0,
        Math.min(100, ((row.provider_uploaded_bytes || 0) / row.size) * 100),
      )
    }
    return undefined
  }

  const run = async (fn: () => Promise<void>) => {
    try {
      setError("")
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const stateCount = (state: string) => summary()?.states?.[state]?.count || 0

  const loadOverview = async () => {
    setSummary(await get<Summary>("/summary"))
  }

  const loadActive = async () => {
    const params = new URLSearchParams({
      state: activeState(),
      limit: "200",
    })
    if (activeSearch().trim()) params.set("q", activeSearch().trim())
    setActiveRows(await get<ActiveRow[]>(`/list?${params.toString()}`))
  }

  const loadHistory = async () => {
    const params = new URLSearchParams({ limit: historyLimit() })
    if (historySearch().trim()) params.set("q", historySearch().trim())
    if (historyGroup() !== "all") params.set("status_group", historyGroup())
    if (historyFinalStatus() !== "all")
      params.set("status", historyFinalStatus())
    if (historyAction() !== "all")
      params.set("action_required", historyAction())
    if (historyCurrentState() !== "all")
      params.set("current_state", historyCurrentState())
    if (historyGeneration().trim())
      params.set("generation", historyGeneration().trim())
    if (historyResult() !== "all") params.set("result", historyResult())
    if (historyRecovery() !== "all") params.set("recovery", historyRecovery())
    if (historyError() !== "all") params.set("has_error", historyError())
    if (historyAfter())
      params.set("after", new Date(historyAfter()).toISOString())
    if (historyBefore())
      params.set("before", new Date(historyBefore()).toISOString())

    const [rows, currentSummary] = await Promise.all([
      get<HistoryRow[]>(`/history?${params.toString()}`),
      get<Summary>("/summary"),
    ])
    setHistoryRows(rows)
    setSummary(currentSummary)
  }

  const loadSettings = async () => {
    setSettings(await get<Settings>("/settings"))
  }

  const refreshVisible = async () => {
    if (refreshing() || document.visibilityState !== "visible") return
    setRefreshing(true)
    try {
      switch (tab()) {
        case "overview":
          await loadOverview()
          break
        case "active":
          await Promise.all([loadOverview(), loadActive()])
          break
        case "history":
          await loadHistory()
          break
        case "settings":
          return
      }
      setLastUpdated(new Date())
    } finally {
      setRefreshing(false)
    }
  }

  createEffect(() => {
    const currentTab = tab()
    if (currentTab === "active") {
      activeState()
      activeSearch()
    } else if (currentTab === "history") {
      historySearch()
      historyGroup()
      historyFinalStatus()
      historyAction()
      historyCurrentState()
      historyGeneration()
      historyResult()
      historyRecovery()
      historyError()
      historyAfter()
      historyBefore()
      historyLimit()
    }

    const timer = window.setTimeout(() => {
      void run(async () => {
        if (currentTab === "settings") {
          await loadSettings()
          setLastUpdated(new Date())
          return
        }
        await refreshVisible()
      })
    }, 250)
    onCleanup(() => window.clearTimeout(timer))
  })

  createEffect(() => {
    const enabled = autoRefreshEnabled()
    const seconds = Number(autoRefreshSeconds())
    if (!enabled || !Number.isFinite(seconds) || seconds <= 0) return
    const timer = window.setInterval(() => {
      void run(refreshVisible)
    }, seconds * 1000)
    onCleanup(() => window.clearInterval(timer))
  })

  onMount(() => {
    const onVisibility = () => {
      if (autoRefreshEnabled() && document.visibilityState === "visible")
        void run(refreshVisible)
    }
    document.addEventListener("visibilitychange", onVisibility)
    onCleanup(() => {
      document.removeEventListener("visibilitychange", onVisibility)
    })
  })

  const previewCache = () =>
    run(async () => {
      const result = await get<CacheCleanup>("/cleanup/preview")
      setCacheStatus(
        `${t("webdav_writeback.cache.eligible")} ${result.eligible || 0} ${t(
          "webdav_writeback.cache.files",
        )} / ${bytes(result.eligible_bytes)}${
          result.truncated
            ? ` (${t("webdav_writeback.cache.preview_capped")})`
            : ""
        }`,
      )
    })

  const releaseCache = () => {
    if (!window.confirm(t("webdav_writeback.cache.confirm_release"))) return
    void run(async () => {
      const result = await post<CacheCleanup>("/cleanup")
      setCacheStatus(
        `${t("webdav_writeback.cache.released")} ${result.released || 0} ${t(
          "webdav_writeback.cache.files",
        )} / ${bytes(result.released_bytes)}`,
      )
      await loadOverview()
      setLastUpdated(new Date())
    })
  }

  const toggleHistory = (id: number, checked: boolean) => {
    setSelectedHistory((current) =>
      checked
        ? current.includes(id)
          ? current
          : [...current, id]
        : current.filter((item) => item !== id),
    )
  }

  const deleteSelectedHistory = () => {
    const ids = selectedHistory()
    if (!ids.length) return
    if (
      !window.confirm(
        `${t("webdav_writeback.history.confirm_selected")} ${ids.length}`,
      )
    )
      return
    void run(async () => {
      const result = await post<HistoryCleanup>("/history/cleanup", { ids })
      setHistoryStatus(
        `${t("webdav_writeback.history.deleted_rows")} ${result.deleted}`,
      )
      setSelectedHistory([])
      await loadHistory()
      setLastUpdated(new Date())
    })
  }

  const deleteHistoryClass = () => {
    const cls = cleanupClass()
    const days = cleanupDays()
    if (cls === "successful" && days <= 0) {
      setHistoryStatus(t("webdav_writeback.history.success_age_required"))
      return
    }
    const age =
      days > 0 ? ` · ${days} ${t("webdav_writeback.history.days")}` : ""
    if (
      !window.confirm(
        `${t("webdav_writeback.history.confirm_class")} ${translateValue(
          "cleanup",
          cls,
        )}${age}. ${t("webdav_writeback.history.confirm_class_safety")}`,
      )
    )
      return
    void run(async () => {
      const result = await post<HistoryCleanup>("/history/cleanup", {
        class: cls,
        older_than_days: days,
      })
      setHistoryStatus(
        `${t("webdav_writeback.history.deleted_rows")} ${result.deleted}`,
      )
      await loadHistory()
      setLastUpdated(new Date())
    })
  }

  type NumericSetting = Exclude<
    keyof Settings,
    "enabled" | "spool_dir" | "restart_required_fields"
  >

  const numericSettings: Array<{
    key: NumericSetting
    label: string
    min: number
    hint?: string
  }> = [
    {
      key: "reserve_free_space_mb",
      label: "webdav_writeback.settings.reserve_free_space_mb",
      min: 0,
    },
    {
      key: "max_pending_spool_mb",
      label: "webdav_writeback.settings.max_pending_spool_mb",
      min: 0,
      hint: "webdav_writeback.settings.unlimited_hint",
    },
    {
      key: "incoming_reservation_chunk_mb",
      label: "webdav_writeback.settings.incoming_reservation_chunk_mb",
      min: 1,
    },
    {
      key: "workers",
      label: "webdav_writeback.settings.workers",
      min: 1,
    },
    {
      key: "upload_workers",
      label: "webdav_writeback.settings.upload_workers",
      min: 1,
    },
    {
      key: "large_upload_workers",
      label: "webdav_writeback.settings.large_upload_workers",
      min: 1,
    },
    {
      key: "provider_probe_workers",
      label: "webdav_writeback.settings.provider_probe_workers",
      min: 1,
    },
    {
      key: "completed_cache_ttl_minutes",
      label: "webdav_writeback.settings.completed_cache_ttl_minutes",
      min: -1,
      hint: "webdav_writeback.settings.completed_cache_ttl_hint",
    },
    {
      key: "completed_remote_probe_seconds",
      label: "webdav_writeback.settings.completed_remote_probe_seconds",
      min: 0,
    },
    {
      key: "cloudsync_settle_millis",
      label: "webdav_writeback.settings.cloudsync_settle_millis",
      min: 0,
    },
    {
      key: "cloudsync_placeholder_millis",
      label: "webdav_writeback.settings.cloudsync_placeholder_millis",
      min: 0,
    },
    {
      key: "retry_initial_seconds",
      label: "webdav_writeback.settings.retry_initial_seconds",
      min: 1,
    },
    {
      key: "retry_max_seconds",
      label: "webdav_writeback.settings.retry_max_seconds",
      min: 1,
    },
    {
      key: "verify_interval_seconds",
      label: "webdav_writeback.settings.verify_interval_seconds",
      min: 1,
    },
    {
      key: "verify_attempts",
      label: "webdav_writeback.settings.verify_attempts",
      min: 1,
    },
  ]

  const updateNumericSetting = (key: NumericSetting, value: string) => {
    const current = settings()
    if (!current) return
    setSettings({ ...current, [key]: Number(value) })
  }

  const saveSettings = () =>
    run(async () => {
      const current = settings()
      if (!current) return
      const { spool_dir, restart_required_fields, ...payload } = current
      void spool_dir
      void restart_required_fields
      const saved = await post<Settings>("/settings", payload)
      setSettings(saved)
      const restart = saved.restart_required_fields || []
      setSettingsStatus(
        restart.length
          ? `${t("webdav_writeback.settings.saved_restart")} ${restart.join(
              ", ",
            )}`
          : t("webdav_writeback.settings.saved_active"),
      )
      notify.success(t("webdav_writeback.settings.saved_notice"))
      setLastUpdated(new Date())
    })

  const activeChoices = (): Choice[] => [
    { value: "active", label: t("webdav_writeback.common.all") },
    {
      value: "receiving",
      label: t("webdav_writeback.cloudsync_status.receiving"),
    },
    { value: "syncing", label: t("webdav_writeback.cloudsync_status.syncing") },
    {
      value: "waiting_reupload",
      label: t("webdav_writeback.cloudsync_status.waiting_reupload"),
    },
  ]

  const historyCloudSyncStatus = () => {
    if (historyGroup() === "completed") return "completed"
    if (historyGroup() === "waiting_reupload") return "waiting_reupload"
    if (historyFinalStatus() === "deleted") return "deleted"
    return "all"
  }

  const historyCloudSyncStatusChoices = (): Choice[] => [
    { value: "all", label: t("webdav_writeback.common.all_final_status") },
    {
      value: "completed",
      label: t("webdav_writeback.cloudsync_status.completed"),
    },
    {
      value: "waiting_reupload",
      label: t("webdav_writeback.cloudsync_status.waiting_reupload"),
    },
    { value: "deleted", label: t("webdav_writeback.cloudsync_status.deleted") },
  ]

  const setHistoryCloudSyncStatus = (value: string) => {
    setHistoryGroup("all")
    setHistoryFinalStatus("all")
    setHistoryAction("all")
    switch (value) {
      case "completed":
      case "waiting_reupload":
        setHistoryGroup(value)
        break
      case "deleted":
        setHistoryFinalStatus("deleted")
        break
    }
  }

  const historyTerminalStatus = (status?: string) => {
    switch (status) {
      case "completed":
      case "recovered":
        return "completed"
      case "deleted":
        return "deleted"
      default:
        return "waiting_reupload"
    }
  }

  const compareSortValue = (
    a: string | number | undefined,
    b: string | number | undefined,
  ) => {
    if (typeof a === "number" || typeof b === "number") {
      return Number(a || 0) - Number(b || 0)
    }
    return String(a || "").localeCompare(String(b || ""), undefined, {
      numeric: true,
      sensitivity: "base",
    })
  }

  const activeSortValue = (row: ActiveRow, key: ActiveSortKey) => {
    switch (key) {
      case "path":
        return row.path
      case "size":
        return row.size
      case "progress":
        return activeProgress(row) ?? -1
      case "status":
        return cloudSyncStatus(
          row.effective_status || row.provider_state,
          row.operator_action,
        )
      case "action":
        return row.operator_action || ""
      case "state":
        return row.provider_state
      case "recovery":
        return row.recovery_state || ""
      case "retry":
        return row.retry_count
      case "verify":
        return row.verify_count
      case "started":
        return row.started_at ? new Date(row.started_at).getTime() : 0
      case "retry_at":
        return row.retry_at ? new Date(row.retry_at).getTime() : 0
      case "error":
        return row.last_error || ""
      default:
        return row.updated_at ? new Date(row.updated_at).getTime() : 0
    }
  }

  const historySortValue = (row: HistoryRow, key: HistorySortKey) => {
    switch (key) {
      case "path":
        return row.path
      case "status":
        return historyTerminalStatus(row.effective_status || row.result)
      case "action":
        return row.operator_action || ""
      case "current_generation":
        return row.current_generation || 0
      case "current_state":
        return row.current_provider_state || ""
      case "size":
        return row.size
      case "completed": {
        const completed = row.current_completed_at || row.completed_at
        return completed ? new Date(completed).getTime() : 0
      }
      default:
        return row.updated_at ? new Date(row.updated_at).getTime() : 0
    }
  }

  const sortedActiveRows = createMemo(() => {
    const key = activeSortKey()
    const direction = activeSortDirection()
    return [...activeRows()].sort((a, b) => {
      const primary = compareSortValue(
        activeSortValue(a, key),
        activeSortValue(b, key),
      )
      if (primary !== 0) return direction === "asc" ? primary : -primary
      const pathOrder = a.path.localeCompare(b.path, undefined, {
        numeric: true,
        sensitivity: "base",
      })
      if (pathOrder !== 0) return pathOrder
      return a.id.localeCompare(b.id, undefined, { numeric: true })
    })
  })

  const sortedHistoryRows = createMemo(() => {
    const key = historySortKey()
    const direction = historySortDirection()
    return [...historyRows()].sort((a, b) => {
      const primary = compareSortValue(
        historySortValue(a, key),
        historySortValue(b, key),
      )
      if (primary !== 0) return direction === "asc" ? primary : -primary
      const pathOrder = a.path.localeCompare(b.path, undefined, {
        numeric: true,
        sensitivity: "base",
      })
      if (pathOrder !== 0) return pathOrder
      return a.id - b.id
    })
  })

  const setActiveSort = (key: ActiveSortKey, direction: SortDirection) => {
    setActiveSortKey(key)
    setActiveSortDirection(direction)
  }

  const setHistorySort = (key: HistorySortKey, direction: SortDirection) => {
    setHistorySortKey(key)
    setHistorySortDirection(direction)
  }

  const historyActionChoices = (): Choice[] => [
    { value: "all", label: t("webdav_writeback.common.all_actions") },
    { value: "true", label: t("webdav_writeback.common.action_required") },
    { value: "false", label: t("webdav_writeback.common.no_action_required") },
  ]

  const historyCurrentStateChoices = (): Choice[] => [
    { value: "all", label: t("webdav_writeback.common.all_current_states") },
    { value: "queued", label: t("webdav_writeback.state.queued") },
    { value: "uploading", label: t("webdav_writeback.state.uploading") },
    { value: "verifying", label: t("webdav_writeback.state.verifying") },
    { value: "completed", label: t("webdav_writeback.state.completed") },
    { value: "deleted", label: t("webdav_writeback.state.deleted") },
  ]

  const resetHistoryFilters = () => {
    setHistorySearch("")
    setHistoryGroup("all")
    setHistoryFinalStatus("all")
    setHistoryAction("all")
    setHistoryCurrentState("all")
    setHistoryGeneration("")
    setHistoryResult("all")
    setHistoryRecovery("all")
    setHistoryError("all")
    setHistoryAfter("")
    setHistoryBefore("")
    setHistoryLimit("200")
  }

  const historyResultChoices = (): Choice[] => [
    { value: "all", label: t("webdav_writeback.common.all_results") },
    { value: "completed", label: t("webdav_writeback.result.completed") },
    { value: "deleted", label: t("webdav_writeback.result.deleted") },
    {
      value: "remote_missing",
      label: t("webdav_writeback.result.remote_missing"),
    },
    {
      value: "recovery_required",
      label: t("webdav_writeback.result.recovery_required"),
    },
  ]

  const historyRecoveryChoices = (): Choice[] => [
    { value: "all", label: t("webdav_writeback.common.all_recovery") },
    {
      value: "restart_recovery",
      label: t("webdav_writeback.recovery.restart_recovery"),
    },
    {
      value: "missing_spool_provider_recovered",
      label: t("webdav_writeback.recovery.missing_spool_provider_recovered"),
    },
    {
      value: "cloudsync_rehydrate_required",
      label: t("webdav_writeback.recovery.cloudsync_rehydrate_required"),
    },
  ]

  const errorChoices = (): Choice[] => [
    { value: "all", label: t("webdav_writeback.common.any_error") },
    { value: "true", label: t("webdav_writeback.common.has_error") },
    { value: "false", label: t("webdav_writeback.common.no_error") },
  ]

  const cleanupChoices = (): Choice[] => [
    { value: "successful", label: t("webdav_writeback.cleanup.successful") },
    { value: "recovery", label: t("webdav_writeback.cleanup.recovery") },
    { value: "error", label: t("webdav_writeback.cleanup.error") },
    {
      value: "remote_missing",
      label: t("webdav_writeback.cleanup.remote_missing"),
    },
  ]

  return (
    <VStack spacing="$3" alignItems="start" w="$full">
      <HStack
        w="$full"
        justifyContent="space-between"
        alignItems="center"
        wrap="wrap"
      >
        <Heading size="xl">{t("webdav_writeback.title")}</Heading>
        <HStack spacing="$2" wrap="wrap">
          <HopeSwitch
            checked={autoRefreshEnabled()}
            onChange={(e: Event) =>
              setAutoRefreshEnabled(
                (e.currentTarget as HTMLInputElement).checked,
              )
            }
          >
            {t("webdav_writeback.common.auto_refresh")}
          </HopeSwitch>
          <ChoiceSelect
            value={autoRefreshSeconds()}
            onChange={setAutoRefreshSeconds}
            minW="$28"
            choices={AUTO_REFRESH_CHOICES.map((value) => ({
              value,
              label: value + "s",
            }))}
          />
          <Badge colorScheme={autoRefreshEnabled() ? "success" : "neutral"}>
            {autoRefreshEnabled()
              ? t("webdav_writeback.common.auto_refresh") +
                " · " +
                autoRefreshSeconds() +
                "s"
              : t("webdav_writeback.common.auto_refresh_off")}
          </Badge>
          <Show when={lastUpdated()}>
            <Text size="xs" color="$neutral10">
              {t("webdav_writeback.common.updated")}{" "}
              {time(lastUpdated()?.toISOString())}
            </Text>
          </Show>
        </HStack>
      </HStack>

      <Show when={error()}>
        <Box
          w="$full"
          borderWidth="1px"
          borderColor="$danger7"
          bgColor="$danger3"
          rounded="$md"
          p="$2"
        >
          <Text color="$danger11">{error()}</Text>
        </Box>
      </Show>

      <HStack spacing="$2" wrap="wrap">
        <For
          each={
            [
              ["overview", "webdav_writeback.tabs.overview"],
              ["active", "webdav_writeback.tabs.active"],
              ["history", "webdav_writeback.tabs.history"],
              ["settings", "webdav_writeback.tabs.settings"],
            ] as const
          }
        >
          {(item) => (
            <Button
              colorScheme={tab() === item[0] ? "accent" : "neutral"}
              variant={tab() === item[0] ? "solid" : "outline"}
              onClick={() => setTab(item[0])}
            >
              {t(item[1])}
            </Button>
          )}
        </For>
      </HStack>

      <Show when={tab() === "overview"}>
        <SimpleGrid
          w="$full"
          columns={{ "@initial": 1, "@sm": 2, "@lg": 4 }}
          gap="$2"
        >
          <StatCard
            label={t("webdav_writeback.overview.writeback_enabled")}
            value={summary()?.enabled ? t("global.yes") : t("global.no")}
          />
          <StatCard
            label={t("webdav_writeback.overview.receiving")}
            value={summary()?.receiving || 0}
          />
          <StatCard
            label={t("webdav_writeback.overview.pending_backlog")}
            value={stateCount("queued") + stateCount("deleted")}
            hint={`${t("webdav_writeback.overview.durable_backlog")} ${bytes(
              summary()?.backlog_bytes,
            )}`}
          />
          <StatCard
            label={t("webdav_writeback.overview.uploading")}
            value={stateCount("uploading")}
          />
          <StatCard
            label={t("webdav_writeback.overview.verifying")}
            value={stateCount("verifying")}
          />
          <StatCard
            label={t("webdav_writeback.overview.action_required")}
            value={summary()?.needs_cloudsync_rehydrate || 0}
            hint={t("webdav_writeback.overview.needs_rehydrate")}
          />
          <StatCard
            label={t("webdav_writeback.overview.automatic_recovery")}
            value={summary()?.automatic_recovery || 0}
          />
          <StatCard
            label={t("webdav_writeback.overview.remote_hash_mismatch")}
            value={summary()?.remote_hash_mismatch || 0}
          />
          <StatCard
            label={t("webdav_writeback.overview.normal_completed")}
            value={
              stateCount("completed") - (summary()?.remote_hash_mismatch || 0)
            }
          />
          <StatCard
            label={t("webdav_writeback.overview.completed_cache")}
            value={bytes(summary()?.completed_cache_bytes)}
          />
          <StatCard
            label={t("webdav_writeback.overview.receiving_reservation")}
            value={bytes(summary()?.receiving_reservation_bytes)}
          />
          <StatCard
            label={t("webdav_writeback.overview.spool_disk_free")}
            value={
              summary()?.disk_error
                ? t("webdav_writeback.common.unavailable")
                : bytes(summary()?.disk_free_bytes)
            }
            hint={
              summary()?.disk_error ||
              `${t("webdav_writeback.overview.used")} ${bytes(
                summary()?.disk_used_bytes,
              )} / ${t("webdav_writeback.overview.total")} ${bytes(
                summary()?.disk_total_bytes,
              )}`
            }
          />
          <StatCard
            label={t("webdav_writeback.overview.max_pending_spool")}
            value={
              summary()?.max_pending_spool_bytes
                ? bytes(summary()?.max_pending_spool_bytes)
                : t("webdav_writeback.common.unlimited")
            }
          />
          <StatCard
            label={t("webdav_writeback.overview.reserve_free_space")}
            value={bytes(summary()?.reserve_free_space_bytes)}
          />
        </SimpleGrid>

        <Box
          w="$full"
          borderWidth="1px"
          borderColor="$neutral6"
          rounded="$lg"
          p="$3"
        >
          <Heading size="base" mb="$1">
            {t("webdav_writeback.cache.title")}
          </Heading>
          <Text size="sm" color="$neutral10" mb="$2">
            {t("webdav_writeback.cache.description")}
          </Text>
          <HStack spacing="$2" wrap="wrap">
            <Button variant="outline" onClick={previewCache}>
              {t("webdav_writeback.cache.preview")}
            </Button>
            <Button onClick={releaseCache}>
              {t("webdav_writeback.cache.release")}
            </Button>
            <Text size="sm">{cacheStatus()}</Text>
          </HStack>
        </Box>
      </Show>

      <Show when={tab() === "active"}>
        <HStack w="$full" spacing="$2" wrap="wrap">
          <Input
            maxW="$96"
            placeholder={t("webdav_writeback.common.filter_path")}
            value={activeSearch()}
            onInput={(e) => setActiveSearch(e.currentTarget.value)}
          />
          <Button variant="outline" onClick={resetActiveColumnWidths}>
            {t("webdav_writeback.common.reset_column_widths")}
          </Button>
        </HStack>

        <Box w="$full" overflowX="auto">
          <Table
            highlightOnHover
            dense
            style={{
              "table-layout": "fixed",
              width: `${activeTableWidth()}px`,
              "min-width": `${activeTableWidth()}px`,
            }}
          >
            <Thead>
              <Tr>
                <ResizableTh
                  width={activeColumnWidths().path}
                  onResize={(width) => setActiveColumnWidth("path", width)}
                >
                  <SortableHeader
                    label={t("webdav_writeback.table.path")}
                    sortDirection={
                      activeSortKey() === "path"
                        ? activeSortDirection()
                        : undefined
                    }
                    onSort={(direction) => setActiveSort("path", direction)}
                    ascLabel={t("webdav_writeback.common.sort_asc")}
                    descLabel={t("webdav_writeback.common.sort_desc")}
                  />
                </ResizableTh>
                <ResizableTh
                  width={activeColumnWidths().size}
                  onResize={(width) => setActiveColumnWidth("size", width)}
                >
                  <SortableHeader
                    label={t("webdav_writeback.table.size")}
                    sortDirection={
                      activeSortKey() === "size"
                        ? activeSortDirection()
                        : undefined
                    }
                    onSort={(direction) => setActiveSort("size", direction)}
                    ascLabel={t("webdav_writeback.common.sort_asc")}
                    descLabel={t("webdav_writeback.common.sort_desc")}
                  />
                </ResizableTh>
                <ResizableTh
                  width={activeColumnWidths().progress}
                  onResize={(width) => setActiveColumnWidth("progress", width)}
                >
                  <SortableHeader
                    label={t("webdav_writeback.table.progress")}
                    sortDirection={
                      activeSortKey() === "progress"
                        ? activeSortDirection()
                        : undefined
                    }
                    onSort={(direction) => setActiveSort("progress", direction)}
                    ascLabel={t("webdav_writeback.common.sort_asc")}
                    descLabel={t("webdav_writeback.common.sort_desc")}
                  />
                </ResizableTh>
                <ResizableTh
                  width={activeColumnWidths().status}
                  onResize={(width) => setActiveColumnWidth("status", width)}
                >
                  <HeaderFilter
                    label={t("webdav_writeback.table.final_status")}
                    active={activeState() !== "active"}
                    sortDirection={
                      activeSortKey() === "status"
                        ? activeSortDirection()
                        : undefined
                    }
                    onSort={(direction) => setActiveSort("status", direction)}
                    sortAscLabel={t("webdav_writeback.common.sort_asc")}
                    sortDescLabel={t("webdav_writeback.common.sort_desc")}
                  >
                    <ChoiceSelect
                      value={activeState()}
                      onChange={setActiveState}
                      choices={activeChoices()}
                    />
                  </HeaderFilter>
                </ResizableTh>
                <ResizableTh
                  width={activeColumnWidths().action}
                  onResize={(width) => setActiveColumnWidth("action", width)}
                >
                  <SortableHeader
                    label={t("webdav_writeback.table.action")}
                    sortDirection={
                      activeSortKey() === "action"
                        ? activeSortDirection()
                        : undefined
                    }
                    onSort={(direction) => setActiveSort("action", direction)}
                    ascLabel={t("webdav_writeback.common.sort_asc")}
                    descLabel={t("webdav_writeback.common.sort_desc")}
                  />
                </ResizableTh>
                <ResizableTh
                  width={activeColumnWidths().state}
                  onResize={(width) => setActiveColumnWidth("state", width)}
                >
                  <SortableHeader
                    label={t("webdav_writeback.table.state")}
                    sortDirection={
                      activeSortKey() === "state"
                        ? activeSortDirection()
                        : undefined
                    }
                    onSort={(direction) => setActiveSort("state", direction)}
                    ascLabel={t("webdav_writeback.common.sort_asc")}
                    descLabel={t("webdav_writeback.common.sort_desc")}
                  />
                </ResizableTh>
                <ResizableTh
                  width={activeColumnWidths().recovery}
                  onResize={(width) => setActiveColumnWidth("recovery", width)}
                >
                  <SortableHeader
                    label={t("webdav_writeback.table.recovery")}
                    sortDirection={
                      activeSortKey() === "recovery"
                        ? activeSortDirection()
                        : undefined
                    }
                    onSort={(direction) => setActiveSort("recovery", direction)}
                    ascLabel={t("webdav_writeback.common.sort_asc")}
                    descLabel={t("webdav_writeback.common.sort_desc")}
                  />
                </ResizableTh>
                <ResizableTh
                  width={activeColumnWidths().retry}
                  onResize={(width) => setActiveColumnWidth("retry", width)}
                >
                  <SortableHeader
                    label={t("webdav_writeback.table.retry")}
                    sortDirection={
                      activeSortKey() === "retry"
                        ? activeSortDirection()
                        : undefined
                    }
                    onSort={(direction) => setActiveSort("retry", direction)}
                    ascLabel={t("webdav_writeback.common.sort_asc")}
                    descLabel={t("webdav_writeback.common.sort_desc")}
                  />
                </ResizableTh>
                <ResizableTh
                  width={activeColumnWidths().verify}
                  onResize={(width) => setActiveColumnWidth("verify", width)}
                >
                  <SortableHeader
                    label={t("webdav_writeback.table.verify")}
                    sortDirection={
                      activeSortKey() === "verify"
                        ? activeSortDirection()
                        : undefined
                    }
                    onSort={(direction) => setActiveSort("verify", direction)}
                    ascLabel={t("webdav_writeback.common.sort_asc")}
                    descLabel={t("webdav_writeback.common.sort_desc")}
                  />
                </ResizableTh>
                <ResizableTh
                  width={activeColumnWidths().started}
                  onResize={(width) => setActiveColumnWidth("started", width)}
                >
                  <SortableHeader
                    label={t("webdav_writeback.table.started")}
                    sortDirection={
                      activeSortKey() === "started"
                        ? activeSortDirection()
                        : undefined
                    }
                    onSort={(direction) => setActiveSort("started", direction)}
                    ascLabel={t("webdav_writeback.common.sort_asc")}
                    descLabel={t("webdav_writeback.common.sort_desc")}
                  />
                </ResizableTh>
                <ResizableTh
                  width={activeColumnWidths().updated}
                  onResize={(width) => setActiveColumnWidth("updated", width)}
                >
                  <SortableHeader
                    label={t("webdav_writeback.table.updated")}
                    sortDirection={
                      activeSortKey() === "updated"
                        ? activeSortDirection()
                        : undefined
                    }
                    onSort={(direction) => setActiveSort("updated", direction)}
                    ascLabel={t("webdav_writeback.common.sort_asc")}
                    descLabel={t("webdav_writeback.common.sort_desc")}
                  />
                </ResizableTh>
                <ResizableTh
                  width={activeColumnWidths().retry_at}
                  onResize={(width) => setActiveColumnWidth("retry_at", width)}
                >
                  <SortableHeader
                    label={t("webdav_writeback.table.retry_at")}
                    sortDirection={
                      activeSortKey() === "retry_at"
                        ? activeSortDirection()
                        : undefined
                    }
                    onSort={(direction) => setActiveSort("retry_at", direction)}
                    ascLabel={t("webdav_writeback.common.sort_asc")}
                    descLabel={t("webdav_writeback.common.sort_desc")}
                  />
                </ResizableTh>
                <ResizableTh
                  width={activeColumnWidths().error}
                  onResize={(width) => setActiveColumnWidth("error", width)}
                >
                  <SortableHeader
                    label={t("webdav_writeback.table.error")}
                    sortDirection={
                      activeSortKey() === "error"
                        ? activeSortDirection()
                        : undefined
                    }
                    onSort={(direction) => setActiveSort("error", direction)}
                    ascLabel={t("webdav_writeback.common.sort_asc")}
                    descLabel={t("webdav_writeback.common.sort_desc")}
                  />
                </ResizableTh>
              </Tr>
            </Thead>
            <Tbody>
              <Show
                when={sortedActiveRows().length}
                fallback={
                  <Tr>
                    <Td colSpan={13}>
                      <Text color="$neutral10">
                        {t("webdav_writeback.active.empty")}
                      </Text>
                    </Td>
                  </Tr>
                }
              >
                <For each={sortedActiveRows()}>
                  {(row) => (
                    <Tr>
                      <Td>
                        <Text
                          title={row.path}
                          css={{
                            "white-space": "nowrap",
                            overflow: "hidden",
                            "text-overflow": "ellipsis",
                          }}
                        >
                          {row.path}
                        </Text>
                        <details>
                          <summary>
                            {t("webdav_writeback.common.advanced")}
                          </summary>
                          <Text size="xs" color="$neutral10">
                            {t("webdav_writeback.advanced.generation")}{" "}
                            {row.generation} · Canonical{" "}
                            {row.client_state || "-"}
                            <br />
                            ETag {row.etag || "-"}
                            <br />
                            RemoteGeneration {row.remote_generation} ·
                            RemoteVerified {time(row.remote_verified_at)}
                            <br />
                            PayloadSHA1 {row.payload_sha1 || "-"}
                            <br />
                            RemoteSHA1 {row.remote_sha1 || "-"}
                            <br />
                            RemoteObjectID {row.remote_object_id || "-"}
                            <br />
                            {t(
                              "webdav_writeback.advanced.resolution_reason",
                            )}{" "}
                            {row.resolution_reason
                              ? translateValue("status", row.resolution_reason)
                              : "-"}
                          </Text>
                        </details>
                      </Td>
                      <Td>{bytes(row.size)}</Td>
                      <Td>
                        <Show
                          when={activeProgress(row) !== undefined}
                          fallback="-"
                        >
                          <VStack alignItems="start" spacing="$1" minW="$32">
                            <Text size="xs">
                              {Math.round(activeProgress(row) || 0)}%
                            </Text>
                            <Box
                              w="$full"
                              h="$2"
                              bgColor="$neutral5"
                              rounded="$full"
                              overflow="hidden"
                            >
                              <Box
                                h="$full"
                                bgColor="$accent9"
                                rounded="$full"
                                style={{
                                  width: `${activeProgress(row) || 0}%`,
                                }}
                              />
                            </Box>
                          </VStack>
                        </Show>
                      </Td>
                      <Td>
                        <Badge
                          colorScheme={
                            cloudSyncStatusColor(
                              cloudSyncStatus(
                                row.effective_status || row.provider_state,
                                row.operator_action,
                              ),
                            ) as any
                          }
                        >
                          {cloudSyncStatusLabel(
                            cloudSyncStatus(
                              row.effective_status || row.provider_state,
                              row.operator_action,
                            ),
                          )}
                        </Badge>
                      </Td>
                      <Td>
                        <Text
                          color={
                            row.operator_action ? "$danger10" : "$neutral10"
                          }
                        >
                          {row.operator_action
                            ? translateValue("action", row.operator_action)
                            : t("webdav_writeback.action.none")}
                        </Text>
                      </Td>
                      <Td>
                        <Badge
                          colorScheme={stateColor(row.provider_state) as any}
                        >
                          {translateValue("state", row.provider_state)}
                        </Badge>
                      </Td>
                      <Td>
                        {row.recovery_state
                          ? translateValue("recovery", row.recovery_state)
                          : "-"}
                      </Td>
                      <Td>{row.retry_count}</Td>
                      <Td>{row.verify_count}</Td>
                      <Td>{time(row.started_at)}</Td>
                      <Td>{time(row.updated_at)}</Td>
                      <Td>{time(row.retry_at)}</Td>
                      <Td>
                        <Text color={row.last_error ? "$danger10" : undefined}>
                          {row.last_error || "-"}
                        </Text>
                      </Td>
                    </Tr>
                  )}
                </For>
              </Show>
            </Tbody>
          </Table>
        </Box>
      </Show>

      <Show when={tab() === "history"}>
        <HStack w="$full" spacing="$2" wrap="wrap">
          <Input
            maxW="$96"
            placeholder={t("webdav_writeback.common.filter_path")}
            value={historySearch()}
            onInput={(e) => setHistorySearch(e.currentTarget.value)}
          />
          <Button variant="outline" onClick={resetHistoryColumnWidths}>
            {t("webdav_writeback.common.reset_column_widths")}
          </Button>
          <details>
            <summary style={{ cursor: "pointer", "white-space": "nowrap" }}>
              {t("webdav_writeback.common.advanced_filters")} ▾
            </summary>
            <HStack mt="$2" spacing="$2" wrap="wrap">
              <Input
                type="number"
                min="1"
                maxW="$32"
                placeholder={t("webdav_writeback.common.generation")}
                value={historyGeneration()}
                onInput={(e) => setHistoryGeneration(e.currentTarget.value)}
              />
              <ChoiceSelect
                value={historyResult()}
                onChange={setHistoryResult}
                choices={historyResultChoices()}
              />
              <ChoiceSelect
                value={historyRecovery()}
                onChange={setHistoryRecovery}
                choices={historyRecoveryChoices()}
              />
              <ChoiceSelect
                value={historyError()}
                onChange={setHistoryError}
                choices={errorChoices()}
              />
              <Input
                type="datetime-local"
                value={historyAfter()}
                onInput={(e) => setHistoryAfter(e.currentTarget.value)}
                aria-label={t("webdav_writeback.common.after")}
              />
              <Input
                type="datetime-local"
                value={historyBefore()}
                onInput={(e) => setHistoryBefore(e.currentTarget.value)}
                aria-label={t("webdav_writeback.common.before")}
              />
              <ChoiceSelect
                value={historyLimit()}
                onChange={setHistoryLimit}
                minW="$24"
                choices={["100", "200", "500"].map((value) => ({
                  value,
                  label: value,
                }))}
              />
              <Button variant="outline" onClick={resetHistoryFilters}>
                {t("webdav_writeback.common.reset_filters")}
              </Button>
            </HStack>
          </details>
        </HStack>

        <Box
          w="$full"
          borderWidth="1px"
          borderColor="$neutral6"
          rounded="$lg"
          p="$3"
        >
          <Heading size="base" mb="$1">
            {t("webdav_writeback.history.delete_title")}
          </Heading>
          <HStack spacing="$2" wrap="wrap">
            <Button
              colorScheme="danger"
              variant="outline"
              disabled={!selectedHistory().length}
              onClick={deleteSelectedHistory}
            >
              {t("webdav_writeback.history.delete_selected")} (
              {selectedHistory().length})
            </Button>
            <ChoiceSelect
              value={cleanupClass()}
              onChange={setCleanupClass}
              choices={cleanupChoices()}
            />
            <Input
              type="number"
              min="0"
              maxW="$32"
              value={cleanupDays()}
              onInput={(e) => setCleanupDays(Number(e.currentTarget.value))}
              aria-label={t("webdav_writeback.history.older_than_days")}
            />
            <Button
              colorScheme="danger"
              variant="outline"
              onClick={deleteHistoryClass}
            >
              {t("webdav_writeback.history.delete_by_class")}
            </Button>
            <Text size="sm">{historyStatus()}</Text>
          </HStack>
        </Box>

        <Box w="$full" overflowX="auto">
          <Table
            highlightOnHover
            dense
            style={{
              "table-layout": "fixed",
              width: `${historyTableWidth()}px`,
              "min-width": `${historyTableWidth()}px`,
            }}
          >
            <Thead>
              <Tr>
                <ResizableTh
                  width={historyColumnWidths().select}
                  onResize={(width) => setHistoryColumnWidth("select", width)}
                />
                <ResizableTh
                  width={historyColumnWidths().path}
                  onResize={(width) => setHistoryColumnWidth("path", width)}
                >
                  <SortableHeader
                    label={t("webdav_writeback.table.path")}
                    sortDirection={
                      historySortKey() === "path"
                        ? historySortDirection()
                        : undefined
                    }
                    onSort={(direction) => setHistorySort("path", direction)}
                    ascLabel={t("webdav_writeback.common.sort_asc")}
                    descLabel={t("webdav_writeback.common.sort_desc")}
                  />
                </ResizableTh>
                <ResizableTh
                  width={historyColumnWidths().status}
                  onResize={(width) => setHistoryColumnWidth("status", width)}
                >
                  <HeaderFilter
                    label={t("webdav_writeback.table.final_status")}
                    active={historyCloudSyncStatus() !== "all"}
                    sortDirection={
                      historySortKey() === "status"
                        ? historySortDirection()
                        : undefined
                    }
                    onSort={(direction) => setHistorySort("status", direction)}
                    sortAscLabel={t("webdav_writeback.common.sort_asc")}
                    sortDescLabel={t("webdav_writeback.common.sort_desc")}
                  >
                    <ChoiceSelect
                      value={historyCloudSyncStatus()}
                      onChange={setHistoryCloudSyncStatus}
                      choices={historyCloudSyncStatusChoices()}
                    />
                  </HeaderFilter>
                </ResizableTh>
                <ResizableTh
                  width={historyColumnWidths().action}
                  onResize={(width) => setHistoryColumnWidth("action", width)}
                >
                  <HeaderFilter
                    label={t("webdav_writeback.table.action")}
                    active={historyAction() !== "all"}
                    sortDirection={
                      historySortKey() === "action"
                        ? historySortDirection()
                        : undefined
                    }
                    onSort={(direction) => setHistorySort("action", direction)}
                    sortAscLabel={t("webdav_writeback.common.sort_asc")}
                    sortDescLabel={t("webdav_writeback.common.sort_desc")}
                  >
                    <ChoiceSelect
                      value={historyAction()}
                      onChange={setHistoryAction}
                      choices={historyActionChoices()}
                    />
                  </HeaderFilter>
                </ResizableTh>
                <ResizableTh
                  width={historyColumnWidths().current_generation}
                  onResize={(width) => setHistoryColumnWidth("current_generation", width)}
                >
                  <SortableHeader
                    label={t("webdav_writeback.table.current_generation")}
                    sortDirection={
                      historySortKey() === "current_generation"
                        ? historySortDirection()
                        : undefined
                    }
                    onSort={(direction) =>
                      setHistorySort("current_generation", direction)
                    }
                    ascLabel={t("webdav_writeback.common.sort_asc")}
                    descLabel={t("webdav_writeback.common.sort_desc")}
                  />
                </ResizableTh>
                <ResizableTh
                  width={historyColumnWidths().current_state}
                  onResize={(width) => setHistoryColumnWidth("current_state", width)}
                >
                  <HeaderFilter
                    label={t("webdav_writeback.table.current_state")}
                    active={historyCurrentState() !== "all"}
                    sortDirection={
                      historySortKey() === "current_state"
                        ? historySortDirection()
                        : undefined
                    }
                    onSort={(direction) =>
                      setHistorySort("current_state", direction)
                    }
                    sortAscLabel={t("webdav_writeback.common.sort_asc")}
                    sortDescLabel={t("webdav_writeback.common.sort_desc")}
                  >
                    <ChoiceSelect
                      value={historyCurrentState()}
                      onChange={setHistoryCurrentState}
                      choices={historyCurrentStateChoices()}
                    />
                  </HeaderFilter>
                </ResizableTh>
                <ResizableTh
                  width={historyColumnWidths().size}
                  onResize={(width) => setHistoryColumnWidth("size", width)}
                >
                  <SortableHeader
                    label={t("webdav_writeback.table.size")}
                    sortDirection={
                      historySortKey() === "size"
                        ? historySortDirection()
                        : undefined
                    }
                    onSort={(direction) => setHistorySort("size", direction)}
                    ascLabel={t("webdav_writeback.common.sort_asc")}
                    descLabel={t("webdav_writeback.common.sort_desc")}
                  />
                </ResizableTh>
                <ResizableTh
                  width={historyColumnWidths().updated}
                  onResize={(width) => setHistoryColumnWidth("updated", width)}
                >
                  <SortableHeader
                    label={t("webdav_writeback.table.updated")}
                    sortDirection={
                      historySortKey() === "updated"
                        ? historySortDirection()
                        : undefined
                    }
                    onSort={(direction) => setHistorySort("updated", direction)}
                    ascLabel={t("webdav_writeback.common.sort_asc")}
                    descLabel={t("webdav_writeback.common.sort_desc")}
                  />
                </ResizableTh>
                <ResizableTh
                  width={historyColumnWidths().completed}
                  onResize={(width) => setHistoryColumnWidth("completed", width)}
                >
                  <SortableHeader
                    label={t("webdav_writeback.table.completed")}
                    sortDirection={
                      historySortKey() === "completed"
                        ? historySortDirection()
                        : undefined
                    }
                    onSort={(direction) =>
                      setHistorySort("completed", direction)
                    }
                    ascLabel={t("webdav_writeback.common.sort_asc")}
                    descLabel={t("webdav_writeback.common.sort_desc")}
                  />
                </ResizableTh>
              </Tr>
            </Thead>
            <Tbody>
              <Show
                when={sortedHistoryRows().length}
                fallback={
                  <Tr>
                    <Td colSpan={12}>
                      <Text color="$neutral10">
                        {t("webdav_writeback.history.empty")}
                      </Text>
                    </Td>
                  </Tr>
                }
              >
                <For each={sortedHistoryRows()}>
                  {(row) => (
                    <Tr>
                      <Td>
                        <Checkbox
                          checked={selectedHistory().includes(row.id)}
                          onChange={(e: any) =>
                            toggleHistory(row.id, e.currentTarget.checked)
                          }
                        />
                      </Td>
                      <Td>
                        <Text
                          title={row.path}
                          css={{
                            "white-space": "nowrap",
                            overflow: "hidden",
                            "text-overflow": "ellipsis",
                          }}
                        >
                          {row.path}
                        </Text>
                        <details>
                          <summary>
                            {t("webdav_writeback.common.advanced")}
                          </summary>
                          <Text size="xs" color="$neutral10">
                            {t("webdav_writeback.advanced.generation")}{" "}
                            {row.generation}
                            <br />
                            {t(
                              "webdav_writeback.advanced.historical_result",
                            )}{" "}
                            {translateValue("result", row.result)}
                            <br />
                            {t("webdav_writeback.advanced.raw_status")}{" "}
                            {translateValue(
                              "status",
                              row.effective_status || row.result,
                            )}
                            <br />
                            {t(
                              "webdav_writeback.advanced.historical_recovery",
                            )}{" "}
                            {row.recovery_type
                              ? translateValue("recovery", row.recovery_type)
                              : "-"}
                            <br />
                            {t(
                              "webdav_writeback.advanced.historical_error",
                            )}{" "}
                            {row.last_error || "-"}
                            <br />
                            {t(
                              "webdav_writeback.advanced.resolution_reason",
                            )}{" "}
                            {row.resolution_reason
                              ? translateValue("status", row.resolution_reason)
                              : "-"}
                            <br />
                            Retry {row.retry_count} · Verify {row.verify_count}
                            <br />
                            {t(
                              "webdav_writeback.advanced.provider_upload_duration",
                            )}{" "}
                            {duration(
                              row.provider_upload_started_at,
                              row.provider_upload_completed_at,
                            )}
                            {" · "}
                            {t(
                              "webdav_writeback.advanced.end_to_end_duration",
                            )}{" "}
                            {duration(row.started_at, row.completed_at)}
                            <br />
                            Ack {time(row.ack_time)} · Durable{" "}
                            {time(row.durable_at)}
                            <br />
                            {t("webdav_writeback.advanced.final_event")}{" "}
                            {time(row.updated_at)}
                            <br />
                            {t(
                              "webdav_writeback.advanced.current_recovery",
                            )}{" "}
                            {row.current_recovery_state
                              ? translateValue(
                                  "recovery",
                                  row.current_recovery_state,
                                )
                              : "-"}
                            <br />
                            PayloadSHA1 {row.payload_sha1 || "-"}
                            <br />
                            RemoteSHA1 {row.remote_sha1 || "-"}
                            <br />
                            RemoteObjectID {row.remote_object_id || "-"}
                          </Text>
                        </details>
                      </Td>
                      <Td>
                        <Badge
                          colorScheme={
                            cloudSyncStatusColor(
                              historyTerminalStatus(
                                row.effective_status || row.result,
                              ),
                            ) as any
                          }
                        >
                          {cloudSyncStatusLabel(
                            historyTerminalStatus(
                              row.effective_status || row.result,
                            ),
                          )}
                        </Badge>
                      </Td>
                      <Td>
                        <Text
                          color={
                            row.operator_action ? "$danger10" : "$neutral10"
                          }
                        >
                          {row.operator_action
                            ? translateValue("action", row.operator_action)
                            : t("webdav_writeback.action.none")}
                        </Text>
                      </Td>
                      <Td>{row.current_generation || "-"}</Td>
                      <Td>
                        {row.current_provider_state
                          ? translateValue("state", row.current_provider_state)
                          : "-"}
                      </Td>
                      <Td>{bytes(row.size)}</Td>
                      <Td>{time(row.updated_at)}</Td>
                      <Td>
                        {time(row.current_completed_at || row.completed_at)}
                      </Td>
                    </Tr>
                  )}
                </For>
              </Show>
            </Tbody>
          </Table>
        </Box>
      </Show>

      <Show when={tab() === "settings"}>
        <Show
          when={settings()}
          fallback={<Text>{t("webdav_writeback.common.loading")}</Text>}
        >
          {(cfg) => (
            <VStack w="$full" alignItems="start" spacing="$3">
              <Box
                w="$full"
                borderWidth="1px"
                borderColor="$neutral6"
                rounded="$lg"
                p="$3"
              >
                <Heading size="base" mb="$1">
                  {t("webdav_writeback.settings.title")}
                </Heading>
                <Text size="sm" color="$neutral10" mb="$3">
                  {t("webdav_writeback.settings.description")}
                </Text>

                <SimpleGrid
                  w="$full"
                  columns={{ "@initial": 1, "@md": 2, "@xl": 3 }}
                  gap="$3"
                >
                  <FormControl>
                    <FormLabel>
                      {t("webdav_writeback.settings.enabled")}
                    </FormLabel>
                    <HopeSwitch
                      checked={cfg().enabled}
                      onChange={(e: Event) =>
                        setSettings({
                          ...cfg(),
                          enabled: (e.currentTarget as HTMLInputElement)
                            .checked,
                        })
                      }
                    >
                      {t("webdav_writeback.settings.enable_writeback")}
                    </HopeSwitch>
                  </FormControl>

                  <FormControl>
                    <FormLabel>SpoolDir</FormLabel>
                    <Input value={cfg().spool_dir} readOnly />
                    <Text size="xs" color="$neutral10" mt="$1">
                      {t("webdav_writeback.settings.read_only")}
                    </Text>
                  </FormControl>

                  <For each={numericSettings}>
                    {(item) => (
                      <FormControl>
                        <FormLabel>{t(item.label)}</FormLabel>
                        <Input
                          type="number"
                          min={item.min}
                          value={cfg()[item.key]}
                          onInput={(e) =>
                            updateNumericSetting(
                              item.key,
                              e.currentTarget.value,
                            )
                          }
                        />
                        <Show when={item.hint}>
                          <Text size="xs" color="$neutral10" mt="$1">
                            {t(item.hint!)}
                          </Text>
                        </Show>
                      </FormControl>
                    )}
                  </For>
                </SimpleGrid>

                <HStack mt="$3" spacing="$2" wrap="wrap">
                  <Button onClick={saveSettings}>{t("global.save")}</Button>
                  <Text size="sm">{settingsStatus()}</Text>
                </HStack>
              </Box>
            </VStack>
          )}
        </Show>
      </Show>
    </VStack>
  )
}

export default WebDAVWriteback
