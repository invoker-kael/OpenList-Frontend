import {
  Box,
  Button,
  Heading,
  Input,
  SimpleGrid,
  Text,
  VStack,
} from "@hope-ui/solid"
import {
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js"
import { useManageTitle } from "~/hooks"
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
  client_state: string
  provider_state: string
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
  completed_at?: string
  result: string
  final_state: string
  recovery_type: string
  payload_sha1: string
  remote_sha1: string
  remote_object_id: string
  remote_verified_at?: string
  retry_count: number
  verify_count: number
  last_error: string
  mime_type: string
  created_at: string
  updated_at: string
}

type HistorySummary = {
  total: number
  remote_missing_or_rehydrate: number
  results: Record<string, number>
  recoveries: Record<string, number>
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

const API = "/admin/webdav-writeback"

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
  if (seconds < 3600)
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  return `${Math.floor(seconds / 3600)}h ${Math.floor(
    (seconds % 3600) / 60,
  )}m`
}

const StatCard = (props: {
  label: string
  value: string | number
  hint?: string
}) => (
  <Box
    bgColor="$background"
    borderWidth="1px"
    borderColor="$neutral6"
    rounded="$lg"
    p="$3"
  >
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

const Field = (props: {
  label: string
  children: any
  hint?: string
}) => (
  <Box>
    <Text size="sm" mb="$1">
      {props.label}
    </Text>
    {props.children}
    <Show when={props.hint}>
      <Text size="xs" color="$neutral10" mt="$1">
        {props.hint}
      </Text>
    </Show>
  </Box>
)

const WebDAVWriteback = () => {
  useManageTitle("WebDAV Writeback")

  const [tab, setTab] = createSignal<Tab>("overview")
  const [summary, setSummary] = createSignal<Summary>()
  const [activeRows, setActiveRows] = createSignal<ActiveRow[]>([])
  const [historyRows, setHistoryRows] = createSignal<HistoryRow[]>([])
  const [historySummary, setHistorySummary] = createSignal<HistorySummary>()
  const [settings, setSettings] = createSignal<Settings>()
  const [error, setError] = createSignal("")
  const [cacheStatus, setCacheStatus] = createSignal("")
  const [historyStatus, setHistoryStatus] = createSignal("")
  const [settingsStatus, setSettingsStatus] = createSignal("")

  const [activeState, setActiveState] = createSignal("active")
  const [activeSearch, setActiveSearch] = createSignal("")

  const [historySearch, setHistorySearch] = createSignal("")
  const [historyResult, setHistoryResult] = createSignal("")
  const [historyRecovery, setHistoryRecovery] = createSignal("")
  const [historyError, setHistoryError] = createSignal("")
  const [historyAfter, setHistoryAfter] = createSignal("")
  const [historyBefore, setHistoryBefore] = createSignal("")
  const [historyLimit, setHistoryLimit] = createSignal("200")
  const [selectedHistory, setSelectedHistory] = createSignal<number[]>([])
  const [cleanupClass, setCleanupClass] = createSignal("successful")
  const [cleanupDays, setCleanupDays] = createSignal(30)

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
    if (historyResult()) params.set("result", historyResult())
    if (historyRecovery()) params.set("recovery", historyRecovery())
    if (historyError()) params.set("has_error", historyError())
    if (historyAfter())
      params.set("after", new Date(historyAfter()).toISOString())
    if (historyBefore())
      params.set("before", new Date(historyBefore()).toISOString())

    const [rows, totals] = await Promise.all([
      get<HistoryRow[]>(`/history?${params.toString()}`),
      get<HistorySummary>("/history/summary"),
    ])
    setHistoryRows(rows)
    setHistorySummary(totals)
    setSelectedHistory([])
  }

  const loadSettings = async () => {
    setSettings(await get<Settings>("/settings"))
  }

  const refreshCurrent = () =>
    run(async () => {
      await loadOverview()
      if (tab() === "active") await loadActive()
      if (tab() === "history") await loadHistory()
      if (tab() === "settings") await loadSettings()
    })

  const changeTab = (next: Tab) => {
    setTab(next)
    void run(async () => {
      await loadOverview()
      if (next === "active") await loadActive()
      if (next === "history") await loadHistory()
      if (next === "settings") await loadSettings()
    })
  }

  onMount(() => {
    void run(loadOverview)
    const timer = window.setInterval(() => {
      if (tab() === "overview") void run(loadOverview)
      if (tab() === "active") void run(loadActive)
    }, 3000)
    onCleanup(() => window.clearInterval(timer))
  })

  const previewCache = () =>
    run(async () => {
      const result = await get<CacheCleanup>("/cleanup/preview")
      setCacheStatus(
        `Eligible ${result.eligible || 0} files / ${bytes(
          result.eligible_bytes,
        )}${result.truncated ? " (preview capped)" : ""}`,
      )
    })

  const releaseCache = () => {
    if (
      !window.confirm(
        "Release only safe provider-verified completed spool cache? Canonical state, History, recovery state and provider data are preserved.",
      )
    )
      return
    void run(async () => {
      const result = await post<CacheCleanup>("/cleanup")
      setCacheStatus(
        `Released ${result.released || 0} files / ${bytes(
          result.released_bytes,
        )}`,
      )
      await loadOverview()
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
    if (!window.confirm(`Delete ${ids.length} selected History rows only?`))
      return
    void run(async () => {
      const result = await post<HistoryCleanup>("/history/cleanup", { ids })
      setHistoryStatus(`Deleted ${result.deleted} History rows.`)
      await loadHistory()
    })
  }

  const deleteHistoryClass = () => {
    const cls = cleanupClass()
    const days = cleanupDays()
    if (cls === "successful" && days <= 0) {
      setHistoryStatus("Successful History cleanup requires a positive age.")
      return
    }
    if (
      !window.confirm(
        `Delete ${cls} History${days > 0 ? ` older than ${days} days` : ""}? Current canonical/spool/provider state is untouched.`,
      )
    )
      return
    void run(async () => {
      const result = await post<HistoryCleanup>("/history/cleanup", {
        class: cls,
        older_than_days: days,
      })
      setHistoryStatus(`Deleted ${result.deleted} History rows.`)
      await loadHistory()
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
    { key: "reserve_free_space_mb", label: "ReserveFreeSpaceMB", min: 0 },
    {
      key: "max_pending_spool_mb",
      label: "MaxPendingSpoolMB",
      min: 0,
      hint: "0 = unlimited",
    },
    {
      key: "incoming_reservation_chunk_mb",
      label: "IncomingReservationChunkMB",
      min: 1,
    },
    { key: "workers", label: "Workers", min: 1 },
    { key: "upload_workers", label: "UploadWorkers", min: 1 },
    {
      key: "large_upload_workers",
      label: "LargeUploadWorkers",
      min: 1,
    },
    {
      key: "provider_probe_workers",
      label: "ProviderProbeWorkers",
      min: 1,
    },
    {
      key: "completed_cache_ttl_minutes",
      label: "CompletedCacheTTLMinutes",
      min: -1,
      hint: "-1 = disable automatic completed-cache release",
    },
    {
      key: "completed_remote_probe_seconds",
      label: "CompletedRemoteProbeSeconds",
      min: 0,
    },
    {
      key: "cloudsync_settle_millis",
      label: "CloudSyncSettleMillis",
      min: 0,
    },
    {
      key: "cloudsync_placeholder_millis",
      label: "CloudSyncPlaceholderMillis",
      min: 0,
    },
    {
      key: "retry_initial_seconds",
      label: "RetryInitialSeconds",
      min: 1,
    },
    { key: "retry_max_seconds", label: "RetryMaxSeconds", min: 1 },
    {
      key: "verify_interval_seconds",
      label: "VerifyIntervalSeconds",
      min: 1,
    },
    { key: "verify_attempts", label: "VerifyAttempts", min: 1 },
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
          ? `Saved. Restart required for: ${restart.join(", ")}`
          : "Saved and active.",
      )
      notify.success("WebDAV Writeback settings saved")
      await loadOverview()
    })

  const recoveryTotal = () =>
    Object.values(historySummary()?.recoveries || {}).reduce(
      (sum, count) => sum + count,
      0,
    )

  const tabButton = (value: Tab, label: string) => (
    <Button
      size="sm"
      variant={tab() === value ? "solid" : "outline"}
      onClick={() => changeTab(value)}
    >
      {label}
    </Button>
  )

  return (
    <VStack alignItems="stretch" spacing="$4">
      <style>{`
        .wb-toolbar{display:flex;gap:.5rem;align-items:center;flex-wrap:wrap}
        .wb-control{border:1px solid var(--hope-colors-neutral7);border-radius:.375rem;background:var(--hope-colors-background);color:inherit;padding:.45rem .6rem;min-height:2.25rem}
        .wb-table-wrap{overflow:auto;border:1px solid var(--hope-colors-neutral6);border-radius:.5rem;background:var(--hope-colors-background)}
        .wb-table{border-collapse:collapse;width:100%;min-width:1050px}
        .wb-table th,.wb-table td{padding:.55rem .65rem;border-bottom:1px solid var(--hope-colors-neutral5);text-align:left;vertical-align:top;font-size:.82rem}
        .wb-table th{background:var(--hope-colors-neutral3);color:var(--hope-colors-neutral11);white-space:nowrap}
        .wb-path{max-width:36rem;word-break:break-all}
        .wb-muted{color:var(--hope-colors-neutral10)}
        .wb-error{color:var(--hope-colors-danger10)}
        .wb-badge{display:inline-block;padding:.12rem .45rem;border-radius:999px;background:var(--hope-colors-neutral4);white-space:nowrap}
        .wb-detail{max-width:40rem;margin-top:.25rem;color:var(--hope-colors-neutral10);font-size:.75rem;line-height:1.45}
      `}</style>

      <Box class="wb-toolbar">
        <Heading size="xl" mr="auto">
          WebDAV Writeback
        </Heading>
        <Button size="sm" variant="outline" onClick={refreshCurrent}>
          Refresh
        </Button>
        <Show when={summary()}>
          <Text size="xs" color="$neutral10">
            Updated {time(summary()?.updated_at)}
          </Text>
        </Show>
      </Box>

      <Show when={error()}>
        <Box
          borderWidth="1px"
          borderColor="$danger7"
          bgColor="$danger3"
          rounded="$md"
          p="$2"
        >
          <Text color="$danger11">{error()}</Text>
        </Box>
      </Show>

      <Box class="wb-toolbar">
        {tabButton("overview", "Overview")}
        {tabButton("active", "Active")}
        {tabButton("history", "History")}
        {tabButton("settings", "Settings")}
      </Box>

      <Show when={tab() === "overview"}>
        <SimpleGrid columns={{ "@initial": 1, "@sm": 2, "@lg": 4 }} gap="$2">
          <StatCard
            label="Writeback Enabled"
            value={summary()?.enabled ? "Yes" : "No"}
          />
          <StatCard label="Receiving" value={summary()?.receiving || 0} />
          <StatCard
            label="Pending / Backlog"
            value={stateCount("queued") + stateCount("deleted")}
            hint={`durable backlog ${bytes(summary()?.backlog_bytes)}`}
          />
          <StatCard label="Uploading" value={stateCount("uploading")} />
          <StatCard label="Verifying" value={stateCount("verifying")} />
          <StatCard label="Errors" value={summary()?.errors || 0} />
          <StatCard
            label="Restart Recovery"
            value={summary()?.restart_recovery || 0}
          />
          <StatCard
            label="Missing Spool"
            value={summary()?.missing_spool || 0}
          />
          <StatCard
            label="Needs CloudSync Rehydrate"
            value={summary()?.needs_cloudsync_rehydrate || 0}
          />
          <StatCard
            label="Completed Cache"
            value={bytes(summary()?.completed_cache_bytes)}
          />
          <StatCard
            label="Receiving Reservation"
            value={bytes(summary()?.receiving_reservation_bytes)}
          />
          <StatCard
            label="Spool Disk Free"
            value={
              summary()?.disk_error
                ? "Unavailable"
                : bytes(summary()?.disk_free_bytes)
            }
            hint={
              summary()?.disk_error ||
              `used ${bytes(summary()?.disk_used_bytes)} / total ${bytes(
                summary()?.disk_total_bytes,
              )}`
            }
          />
          <StatCard
            label="MaxPendingSpool"
            value={
              summary()?.max_pending_spool_bytes
                ? bytes(summary()?.max_pending_spool_bytes)
                : "Unlimited"
            }
          />
          <StatCard
            label="ReserveFreeSpace"
            value={bytes(summary()?.reserve_free_space_bytes)}
          />
        </SimpleGrid>

        <Box
          borderWidth="1px"
          borderColor="$neutral6"
          rounded="$lg"
          p="$3"
        >
          <Heading size="base" mb="$1">
            Completed cache maintenance
          </Heading>
          <Text size="sm" color="$neutral10" mb="$2">
            Releases only provider-verified completed .data spool files. It
            never deletes canonical rows, History, active queue/recovery state,
            or provider objects.
          </Text>
          <Box class="wb-toolbar">
            <Button size="sm" variant="outline" onClick={previewCache}>
              Preview cleanup
            </Button>
            <Button size="sm" onClick={releaseCache}>
              Release completed cache
            </Button>
            <Text size="sm">{cacheStatus()}</Text>
          </Box>
        </Box>
      </Show>

      <Show when={tab() === "active"}>
        <Box class="wb-toolbar">
          <select
            class="wb-control"
            value={activeState()}
            onChange={(e) => setActiveState(e.currentTarget.value)}
          >
            <option value="active">Active</option>
            <option value="receiving">Receiving</option>
            <option value="queued">Queued</option>
            <option value="uploading">Uploading</option>
            <option value="verifying">Verifying</option>
            <option value="error">Errors</option>
          </select>
          <Input
            size="sm"
            maxW="$96"
            placeholder="Filter path"
            value={activeSearch()}
            onInput={(e) => setActiveSearch(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && void run(loadActive)}
          />
          <Button size="sm" onClick={() => void run(loadActive)}>
            Refresh Active
          </Button>
        </Box>
        <Text size="sm" color="$neutral10">
          Live work, retry/recovery and errors only. Completed generations are
          retained in History; no synthetic upload percentage is generated.
        </Text>
        <div class="wb-table-wrap">
          <table class="wb-table">
            <thead>
              <tr>
                <th>Path</th>
                <th>Size</th>
                <th>State</th>
                <th>Recovery</th>
                <th>Retry</th>
                <th>Verify</th>
                <th>Started</th>
                <th>Updated</th>
                <th>Retry At</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              <Show
                when={activeRows().length}
                fallback={
                  <tr>
                    <td colSpan={10} class="wb-muted">
                      No active writeback work.
                    </td>
                  </tr>
                }
              >
                <For each={activeRows()}>
                  {(row) => (
                    <tr>
                      <td class="wb-path">
                        <strong>{row.path}</strong>
                        <details>
                          <summary>Advanced</summary>
                          <div class="wb-detail">
                            Generation {row.generation} · Canonical{" "}
                            {row.client_state || "-"} · ETag {row.etag || "-"}
                            <br />
                            RemoteGeneration {row.remote_generation} ·
                            RemoteVerified {time(row.remote_verified_at)}
                            <br />
                            PayloadSHA1 {row.payload_sha1 || "-"}
                            <br />
                            RemoteSHA1 {row.remote_sha1 || "-"}
                            <br />
                            RemoteObjectID {row.remote_object_id || "-"}
                          </div>
                        </details>
                      </td>
                      <td>{bytes(row.size)}</td>
                      <td>
                        <span class="wb-badge">{row.provider_state || "-"}</span>
                      </td>
                      <td>{row.recovery_state || "-"}</td>
                      <td>{row.retry_count}</td>
                      <td>{row.verify_count}</td>
                      <td>{time(row.started_at)}</td>
                      <td>{time(row.updated_at)}</td>
                      <td>{time(row.retry_at)}</td>
                      <td class="wb-error">{row.last_error}</td>
                    </tr>
                  )}
                </For>
              </Show>
            </tbody>
          </table>
        </div>
      </Show>

      <Show when={tab() === "history"}>
        <Box class="wb-toolbar">
          <Input
            size="sm"
            maxW="$80"
            placeholder="Filter path"
            value={historySearch()}
            onInput={(e) => setHistorySearch(e.currentTarget.value)}
            onKeyDown={(e) => e.key === "Enter" && void run(loadHistory)}
          />
          <select
            class="wb-control"
            value={historyResult()}
            onChange={(e) => setHistoryResult(e.currentTarget.value)}
          >
            <option value="">All results</option>
            <option value="completed">Completed</option>
            <option value="deleted">Deleted</option>
            <option value="remote_missing">Remote Missing</option>
            <option value="recovery_required">Recovery Required</option>
          </select>
          <select
            class="wb-control"
            value={historyRecovery()}
            onChange={(e) => setHistoryRecovery(e.currentTarget.value)}
          >
            <option value="">All recovery</option>
            <option value="restart_recovery">Restart recovery</option>
            <option value="missing_spool_provider_recovered">
              Missing spool recovered
            </option>
            <option value="cloudsync_rehydrate_required">
              CloudSync rehydrate required
            </option>
          </select>
          <select
            class="wb-control"
            value={historyError()}
            onChange={(e) => setHistoryError(e.currentTarget.value)}
          >
            <option value="">Any error</option>
            <option value="true">Has Error</option>
            <option value="false">No Error</option>
          </select>
          <input
            class="wb-control"
            type="datetime-local"
            value={historyAfter()}
            onInput={(e) => setHistoryAfter(e.currentTarget.value)}
            title="After"
          />
          <input
            class="wb-control"
            type="datetime-local"
            value={historyBefore()}
            onInput={(e) => setHistoryBefore(e.currentTarget.value)}
            title="Before"
          />
          <select
            class="wb-control"
            value={historyLimit()}
            onChange={(e) => setHistoryLimit(e.currentTarget.value)}
          >
            <option value="100">100</option>
            <option value="200">200</option>
            <option value="500">500</option>
          </select>
          <Button size="sm" onClick={() => void run(loadHistory)}>
            Refresh History
          </Button>
        </Box>

        <SimpleGrid columns={{ "@initial": 1, "@sm": 2, "@lg": 4 }} gap="$2">
          <StatCard
            label="History rows"
            value={historySummary()?.total || 0}
          />
          <StatCard
            label="Completed"
            value={historySummary()?.results?.completed || 0}
          />
          <StatCard label="Recovery evidence" value={recoveryTotal()} />
          <StatCard
            label="Remote missing / rehydrate"
            value={historySummary()?.remote_missing_or_rehydrate || 0}
          />
        </SimpleGrid>

        <Box
          borderWidth="1px"
          borderColor="$neutral6"
          rounded="$lg"
          p="$3"
        >
          <Heading size="base" mb="$1">
            Delete History
          </Heading>
          <Text size="sm" color="$neutral10" mb="$2">
            Deletes only WebDAVWritebackHistory rows. It cannot change the
            current generation/canonical state, delete spool/provider data,
            trigger re-upload, or affect PROPFIND.
          </Text>
          <Box class="wb-toolbar">
            <Button
              size="sm"
              colorScheme="danger"
              variant="outline"
              onClick={deleteSelectedHistory}
            >
              Delete selected ({selectedHistory().length})
            </Button>
            <select
              class="wb-control"
              value={cleanupClass()}
              onChange={(e) => setCleanupClass(e.currentTarget.value)}
            >
              <option value="successful">Successful History</option>
              <option value="recovery">Recovery History</option>
              <option value="error">Error History</option>
              <option value="remote_missing">Remote Missing</option>
            </select>
            <input
              class="wb-control"
              type="number"
              min="0"
              value={cleanupDays()}
              onInput={(e) => setCleanupDays(Number(e.currentTarget.value))}
              title="Older than days; required for successful History"
            />
            <Button
              size="sm"
              colorScheme="danger"
              variant="outline"
              onClick={deleteHistoryClass}
            >
              Delete by class
            </Button>
            <Text size="sm">{historyStatus()}</Text>
          </Box>
        </Box>

        <div class="wb-table-wrap">
          <table class="wb-table">
            <thead>
              <tr>
                <th />
                <th>Path</th>
                <th>Generation</th>
                <th>Size</th>
                <th>Result</th>
                <th>Recovery</th>
                <th>Retry</th>
                <th>Verify</th>
                <th>Duration</th>
                <th>Completed</th>
                <th>Remote Verified</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              <Show
                when={historyRows().length}
                fallback={
                  <tr>
                    <td colSpan={12} class="wb-muted">
                      No matching History.
                    </td>
                  </tr>
                }
              >
                <For each={historyRows()}>
                  {(row) => (
                    <tr>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedHistory().includes(row.id)}
                          onChange={(e) =>
                            toggleHistory(row.id, e.currentTarget.checked)
                          }
                        />
                      </td>
                      <td class="wb-path">
                        <strong>{row.path}</strong>
                        <details>
                          <summary>Advanced</summary>
                          <div class="wb-detail">
                            Ack {time(row.ack_time)} · Durable{" "}
                            {time(row.durable_at)} · Final event{" "}
                            {time(row.updated_at)}
                            <br />
                            PayloadSHA1 {row.payload_sha1 || "-"}
                            <br />
                            RemoteSHA1 {row.remote_sha1 || "-"}
                            <br />
                            RemoteObjectID {row.remote_object_id || "-"}
                          </div>
                        </details>
                      </td>
                      <td>{row.generation}</td>
                      <td>{bytes(row.size)}</td>
                      <td>
                        <span class="wb-badge">{row.result || "-"}</span>
                      </td>
                      <td>{row.recovery_type || "-"}</td>
                      <td>{row.retry_count}</td>
                      <td>{row.verify_count}</td>
                      <td>{duration(row.started_at, row.completed_at)}</td>
                      <td>{time(row.completed_at)}</td>
                      <td>{time(row.remote_verified_at)}</td>
                      <td class="wb-error">{row.last_error}</td>
                    </tr>
                  )}
                </For>
              </Show>
            </tbody>
          </table>
        </div>
      </Show>

      <Show when={tab() === "settings"}>
        <Show when={settings()} fallback={<Text>Loading settings…</Text>}>
          {(cfg) => (
            <VStack alignItems="stretch" spacing="$3">
              <Box
                borderWidth="1px"
                borderColor="$neutral6"
                rounded="$lg"
                p="$3"
              >
                <Heading size="base" mb="$1">
                  Writeback settings
                </Heading>
                <Text size="sm" color="$neutral10" mb="$3">
                  SpoolDir is read-only. Worker topology/Enabled changes may
                  require restart. CompletedRemoteProbeSeconds controls how
                  long released completed state can rely on fresh provider
                  evidence; the reconciliation algorithm is unchanged.
                </Text>

                <SimpleGrid
                  columns={{ "@initial": 1, "@md": 2, "@xl": 3 }}
                  gap="$3"
                >
                  <Field label="Enabled">
                    <label class="wb-control">
                      <input
                        type="checkbox"
                        checked={cfg().enabled}
                        onChange={(e) =>
                          setSettings({
                            ...cfg(),
                            enabled: e.currentTarget.checked,
                          })
                        }
                      />{" "}
                      Enable durable WebDAV writeback
                    </label>
                  </Field>
                  <Field label="SpoolDir" hint="Read only">
                    <Input size="sm" value={cfg().spool_dir} readOnly />
                  </Field>

                  <For each={numericSettings}>
                    {(item) => (
                      <Field label={item.label} hint={item.hint}>
                        <Input
                          size="sm"
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
                      </Field>
                    )}
                  </For>
                </SimpleGrid>

                <Box class="wb-toolbar" mt="$3">
                  <Button size="sm" onClick={saveSettings}>
                    Save settings
                  </Button>
                  <Text size="sm">{settingsStatus()}</Text>
                </Box>
              </Box>
            </VStack>
          )}
        </Show>
      </Show>
    </VStack>
  )
}

export default WebDAVWriteback
