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

type Choice = {
  value: string
  label: string
}

const API = "/admin/webdav-writeback"
const AUTO_REFRESH_MS = 3000

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

const WebDAVWriteback = () => {
  const t = useT()
  useManageTitle("webdav_writeback.title")

  const [tab, setTab] = createSignal<Tab>("overview")
  const [summary, setSummary] = createSignal<Summary>()
  const [activeRows, setActiveRows] = createSignal<ActiveRow[]>([])
  const [historyRows, setHistoryRows] = createSignal<HistoryRow[]>([])
  const [historySummary, setHistorySummary] = createSignal<HistorySummary>()
  const [settings, setSettings] = createSignal<Settings>()
  const [error, setError] = createSignal("")
  const [lastUpdated, setLastUpdated] = createSignal<Date>()
  const [refreshing, setRefreshing] = createSignal(false)
  const [cacheStatus, setCacheStatus] = createSignal("")
  const [historyStatus, setHistoryStatus] = createSignal("")
  const [settingsStatus, setSettingsStatus] = createSignal("")

  const [activeState, setActiveState] = createSignal("active")
  const [activeSearch, setActiveSearch] = createSignal("")

  const [historySearch, setHistorySearch] = createSignal("")
  const [historyResult, setHistoryResult] = createSignal("all")
  const [historyRecovery, setHistoryRecovery] = createSignal("all")
  const [historyError, setHistoryError] = createSignal("all")
  const [historyAfter, setHistoryAfter] = createSignal("")
  const [historyBefore, setHistoryBefore] = createSignal("")
  const [historyLimit, setHistoryLimit] = createSignal("200")
  const [selectedHistory, setSelectedHistory] = createSignal<number[]>([])
  const [cleanupClass, setCleanupClass] = createSignal("successful")
  const [cleanupDays, setCleanupDays] = createSignal(30)

  const translateValue = (
    group: "state" | "result" | "recovery" | "cleanup",
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
    if (historyResult() !== "all") params.set("result", historyResult())
    if (historyRecovery() !== "all") params.set("recovery", historyRecovery())
    if (historyError() !== "all") params.set("has_error", historyError())
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

  onMount(() => {
    const timer = window.setInterval(() => {
      void run(refreshVisible)
    }, AUTO_REFRESH_MS)
    const onVisibility = () => {
      if (document.visibilityState === "visible") void run(refreshVisible)
    }
    document.addEventListener("visibilitychange", onVisibility)
    onCleanup(() => {
      window.clearInterval(timer)
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

  const recoveryTotal = () =>
    Object.values(historySummary()?.recoveries || {}).reduce(
      (sum, count) => sum + count,
      0,
    )

  const activeChoices = (): Choice[] => [
    { value: "active", label: t("webdav_writeback.state.active") },
    { value: "receiving", label: t("webdav_writeback.state.receiving") },
    { value: "queued", label: t("webdav_writeback.state.queued") },
    { value: "uploading", label: t("webdav_writeback.state.uploading") },
    { value: "verifying", label: t("webdav_writeback.state.verifying") },
    { value: "error", label: t("webdav_writeback.state.error") },
  ]

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
        <HStack spacing="$2">
          <Badge colorScheme="success">
            {t("webdav_writeback.common.auto_refresh")} · 3s
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
            label={t("webdav_writeback.overview.errors")}
            value={summary()?.errors || 0}
          />
          <StatCard
            label={t("webdav_writeback.overview.restart_recovery")}
            value={summary()?.restart_recovery || 0}
          />
          <StatCard
            label={t("webdav_writeback.overview.missing_spool")}
            value={summary()?.missing_spool || 0}
          />
          <StatCard
            label={t("webdav_writeback.overview.needs_rehydrate")}
            value={summary()?.needs_cloudsync_rehydrate || 0}
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
          <ChoiceSelect
            value={activeState()}
            onChange={setActiveState}
            choices={activeChoices()}
          />
          <Input
            maxW="$96"
            placeholder={t("webdav_writeback.common.filter_path")}
            value={activeSearch()}
            onInput={(e) => setActiveSearch(e.currentTarget.value)}
          />
        </HStack>

        <Text size="sm" color="$neutral10">
          {t("webdav_writeback.active.description")}
        </Text>

        <Box w="$full" overflowX="auto">
          <Table highlightOnHover dense>
            <Thead>
              <Tr>
                <For
                  each={[
                    "path",
                    "size",
                    "state",
                    "recovery",
                    "retry",
                    "verify",
                    "started",
                    "updated",
                    "retry_at",
                    "error",
                  ]}
                >
                  {(key) => <Th>{t(`webdav_writeback.table.${key}`)}</Th>}
                </For>
              </Tr>
            </Thead>
            <Tbody>
              <Show
                when={activeRows().length}
                fallback={
                  <Tr>
                    <Td colSpan={10}>
                      <Text color="$neutral10">
                        {t("webdav_writeback.active.empty")}
                      </Text>
                    </Td>
                  </Tr>
                }
              >
                <For each={activeRows()}>
                  {(row) => (
                    <Tr>
                      <Td>
                        <Text maxW="$96" css={{ wordBreak: "break-all" }}>
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
                          </Text>
                        </details>
                      </Td>
                      <Td>{bytes(row.size)}</Td>
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
            maxW="$80"
            placeholder={t("webdav_writeback.common.filter_path")}
            value={historySearch()}
            onInput={(e) => setHistorySearch(e.currentTarget.value)}
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
        </HStack>

        <SimpleGrid
          w="$full"
          columns={{ "@initial": 1, "@sm": 2, "@lg": 4 }}
          gap="$2"
        >
          <StatCard
            label={t("webdav_writeback.history.rows")}
            value={historySummary()?.total || 0}
          />
          <StatCard
            label={t("webdav_writeback.result.completed")}
            value={historySummary()?.results?.completed || 0}
          />
          <StatCard
            label={t("webdav_writeback.history.recovery_evidence")}
            value={recoveryTotal()}
          />
          <StatCard
            label={t("webdav_writeback.history.remote_missing_rehydrate")}
            value={historySummary()?.remote_missing_or_rehydrate || 0}
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
            {t("webdav_writeback.history.delete_title")}
          </Heading>
          <Text size="sm" color="$neutral10" mb="$2">
            {t("webdav_writeback.history.delete_description")}
          </Text>
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
          <Table highlightOnHover dense>
            <Thead>
              <Tr>
                <Th />
                <For
                  each={[
                    "path",
                    "generation",
                    "size",
                    "result",
                    "recovery",
                    "retry",
                    "verify",
                    "duration",
                    "completed",
                    "remote_verified",
                    "error",
                  ]}
                >
                  {(key) => <Th>{t(`webdav_writeback.table.${key}`)}</Th>}
                </For>
              </Tr>
            </Thead>
            <Tbody>
              <Show
                when={historyRows().length}
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
                <For each={historyRows()}>
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
                        <Text maxW="$96" css={{ wordBreak: "break-all" }}>
                          {row.path}
                        </Text>
                        <details>
                          <summary>
                            {t("webdav_writeback.common.advanced")}
                          </summary>
                          <Text size="xs" color="$neutral10">
                            Ack {time(row.ack_time)} · Durable{" "}
                            {time(row.durable_at)}
                            <br />
                            {t("webdav_writeback.advanced.final_event")}{" "}
                            {time(row.updated_at)}
                            <br />
                            PayloadSHA1 {row.payload_sha1 || "-"}
                            <br />
                            RemoteSHA1 {row.remote_sha1 || "-"}
                            <br />
                            RemoteObjectID {row.remote_object_id || "-"}
                          </Text>
                        </details>
                      </Td>
                      <Td>{row.generation}</Td>
                      <Td>{bytes(row.size)}</Td>
                      <Td>
                        <Badge colorScheme={stateColor(row.result) as any}>
                          {translateValue("result", row.result)}
                        </Badge>
                      </Td>
                      <Td>
                        {row.recovery_type
                          ? translateValue("recovery", row.recovery_type)
                          : "-"}
                      </Td>
                      <Td>{row.retry_count}</Td>
                      <Td>{row.verify_count}</Td>
                      <Td>{duration(row.started_at, row.completed_at)}</Td>
                      <Td>{time(row.completed_at)}</Td>
                      <Td>{time(row.remote_verified_at)}</Td>
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
