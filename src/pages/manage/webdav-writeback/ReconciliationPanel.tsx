import {
  Badge,
  Box,
  Button,
  FormControl,
  FormLabel,
  Heading,
  HStack,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  VStack,
} from "@hope-ui/solid"
import { For, onCleanup, onMount, Show, createSignal } from "solid-js"
import { FolderChooseInput } from "~/components"
import { useT } from "~/hooks"
import { Resp } from "~/types"
import { handleResp, r } from "~/utils"

type ReconciliationRun = {
  id: number
  root: string
  state: string
  last_error: string
  source_files: number
  source_bytes: number
  remote_files: number
  matched_files: number
  missing_files: number
  extra_files: number
  scanned_directories: number
  deleted_files: number
  started_at: string
  collection_ended_at?: string
  compared_at?: string
  completed_at?: string
}

type Candidate = {
  path: string
  size: number
  remote_size: number
  is_dir: boolean
  result: string
}

type ReconciliationStatus = {
  run?: ReconciliationRun
  candidate_count: number
  can_cancel: boolean
}

const API = "/admin/webdav-writeback/reconciliation"

const unwrap = async <T,>(request: Promise<Resp<T>>): Promise<T> => {
  const resp = await request
  return await new Promise<T>((resolve, reject) => {
    handleResp(resp, resolve, (message) => reject(new Error(message)), true, false)
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
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${unit ? value.toFixed(2) : value.toFixed(0)} ${units[unit]}`
}

const reconciliationErrorKey = (cause: unknown) => {
  const message = cause instanceof Error ? cause.message : String(cause)
  if (message.includes("SHA-1")) return "missing_sha1"
  if (message.includes("mapping")) return "storage_changed"
  if (message.includes("candidate")) return "candidate_changed"
  if (message.includes("115") && (message.includes("listing") || message.includes("refresh"))) return "remote_list"
  if (message.includes("delete")) return "remote_delete"
  if (message.includes("storage") || message.includes("root")) return "invalid_root"
  if (message.includes("busy") || message.includes("wait")) return "busy"
  if (message.includes("another reconciliation")) return "task_active"
  return "request_failed"
}

const ReconciliationPanel = () => {
  const t = useT()
  const [root, setRoot] = createSignal("")
  const [run, setRun] = createSignal<ReconciliationRun>()
  const [candidateCount, setCandidateCount] = createSignal(0)
  const [canCancel, setCanCancel] = createSignal(false)
  const [candidates, setCandidates] = createSignal<Candidate[]>([])
  const [candidatePage, setCandidatePage] = createSignal(1)
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal("")
  const [status, setStatus] = createSignal("")

  const refresh = async () => {
    if (loading() || document.visibilityState !== "visible") return
    setLoading(true)
    try {
      const current = await get<ReconciliationStatus>("")
      setRun(current.run)
      setCandidateCount(current.candidate_count || 0)
      setCanCancel(current.can_cancel)
      const state = current.run?.state
      if (state === "preview" || state === "delete_failed") {
        const count = current.candidate_count || 0
        const pageCount = Math.max(1, Math.ceil(count / 100))
        const page = Math.min(candidatePage(), pageCount)
        if (page !== candidatePage()) setCandidatePage(page)
        const listed = await get<{
          items: Candidate[]
          total: number
          page: number
          page_size: number
        }>(
          `/candidates?limit=100&page=${page}`,
        )
        setCandidates(listed.items || [])
        setCandidateCount(listed.total || 0)
      } else {
        setCandidates([])
        setCandidatePage(1)
      }
      setError("")
    } catch (cause) {
      setError(t(`webdav_writeback.reconciliation.errors.${reconciliationErrorKey(cause)}`))
    } finally {
      setLoading(false)
    }
  }

  const confirmDangerous = (first: string, second: string) =>
    window.confirm(first) && window.confirm(second)

  const start = async () => {
    const selectedRoot = root().trim()
    if (!selectedRoot) {
      setError(t("webdav_writeback.reconciliation.root_required"))
      return
    }
    if (
      !confirmDangerous(
        t("webdav_writeback.reconciliation.confirm_start"),
        t("webdav_writeback.reconciliation.confirm_start_again"),
      )
    )
      return
    try {
      await post("/start", { root: selectedRoot })
      setStatus(t("webdav_writeback.reconciliation.started"))
      setRoot("")
      await refresh()
    } catch (cause) {
      setError(t(`webdav_writeback.reconciliation.errors.${reconciliationErrorKey(cause)}`))
    }
  }

  const finishCollection = async () => {
    const current = run()
    if (!current) return
    const retry = current.state === "compare_failed" || current.state === "delete_failed"
    if (
      !confirmDangerous(
        t(
          retry
            ? "webdav_writeback.reconciliation.confirm_compare_again"
            : "webdav_writeback.reconciliation.confirm_collection_end",
        ),
        t("webdav_writeback.reconciliation.confirm_collection_end_again"),
      )
    )
      return
    try {
      await post("/finish-collection", { run_id: current.id })
      setStatus(t("webdav_writeback.reconciliation.comparison_started"))
      await refresh()
    } catch (cause) {
      setError(t(`webdav_writeback.reconciliation.errors.${reconciliationErrorKey(cause)}`))
    }
  }

  const deleteExtras = async () => {
    const current = run()
    if (!current || candidateCount() < 1) return
    const count = candidateCount()
    if (
      !confirmDangerous(
        `${t("webdav_writeback.reconciliation.confirm_delete")} ${count}`,
        t("webdav_writeback.reconciliation.confirm_delete_again"),
      )
    )
      return
    try {
      await post("/delete-extras", {
        run_id: current.id,
        expected_candidates: count,
      })
      setStatus(t("webdav_writeback.reconciliation.deletion_started"))
      await refresh()
    } catch (cause) {
      setError(t(`webdav_writeback.reconciliation.errors.${reconciliationErrorKey(cause)}`))
    }
  }

  const finish = async () => {
    const current = run()
    if (!current) return
    if (
      !confirmDangerous(
        t("webdav_writeback.reconciliation.confirm_finish"),
        t("webdav_writeback.reconciliation.confirm_finish_again"),
      )
    )
      return
    try {
      await post("/finish", { run_id: current.id })
      setStatus(t("webdav_writeback.reconciliation.finished"))
      await refresh()
    } catch (cause) {
      setError(t(`webdav_writeback.reconciliation.errors.${reconciliationErrorKey(cause)}`))
    }
  }

  const cancel = async () => {
    const current = run()
    if (!current) return
    if (
      !confirmDangerous(
        t("webdav_writeback.reconciliation.confirm_cancel"),
        t("webdav_writeback.reconciliation.confirm_cancel_again"),
      )
    )
      return
    try {
      await post("/cancel", { run_id: current.id })
      setStatus(t("webdav_writeback.reconciliation.canceled"))
      await refresh()
    } catch (cause) {
      setError(t(`webdav_writeback.reconciliation.errors.${reconciliationErrorKey(cause)}`))
    }
  }

  onMount(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), 5000)
    onCleanup(() => window.clearInterval(timer))
  })

  const stateLabel = (value?: string) =>
    value
      ? t(`webdav_writeback.reconciliation.states.${value}`)
      : t("webdav_writeback.reconciliation.idle")

const isStartable = () =>
    !run() || run()?.state === "completed" || run()?.state === "canceled"

  const currentStep = () => {
    const value = run()?.state
    if (value === "collecting" || isStartable()) return 1
    if (value === "comparing" || value === "compare_failed") return 2
    return 3
  }

  const stepStatus = (step: number) => {
    if (isStartable()) return step === 1 ? "current" : "waiting"
    if (step < currentStep()) return "done"
    return step === currentStep() ? "current" : "waiting"
  }

  return (
    <VStack w="$full" alignItems="start" spacing="$3">
      <Box
        w="$full"
        borderWidth="1px"
        borderColor="$neutral6"
        rounded="$lg"
        p="$3"
      >
        <Heading size="base" mb="$1">
          {t("webdav_writeback.reconciliation.title")}
        </Heading>
        <Text size="sm" color="$neutral10">
          {t("webdav_writeback.reconciliation.description")}
        </Text>
      </Box>

      <Show when={run()}>
        {(current) => (
          <Box
            w="$full"
            borderWidth="1px"
            borderColor="$neutral6"
            rounded="$lg"
            p="$3"
          >
            <HStack w="$full" justifyContent="space-between" wrap="wrap">
              <Text><b>{current().root}</b></Text>
              <HStack spacing="$2">
                <Badge colorScheme={current().state === "compare_failed" || current().state === "delete_failed" ? "danger" : "accent"}>
                  {stateLabel(current().state)}
                </Badge>
                <Button variant="outline" onClick={() => void refresh()} disabled={loading()}>
                  {t("webdav_writeback.reconciliation.refresh")}
                </Button>
              </HStack>
            </HStack>
            <Show when={current().last_error}>
              <Text color="$danger11" size="sm" mt="$2">
                {t("webdav_writeback.reconciliation.errors." + reconciliationErrorKey(new Error(current().last_error)))}
              </Text>
            </Show>
          </Box>
        )}
      </Show>

      <Show when={status()}>
        <Text size="sm">{status()}</Text>
      </Show>
      <Show when={error()}>
        <Text color="$danger11" size="sm">{error()}</Text>
      </Show>

      <Box
        w="$full"
        borderWidth="1px"
        borderColor={currentStep() === 1 ? "$accent6" : "$neutral6"}
        rounded="$lg"
        p="$3"
      >
        <HStack w="$full" justifyContent="space-between" wrap="wrap" mb="$2">
          <Heading size="sm">{t("webdav_writeback.reconciliation.steps.collect")}</Heading>
          <Badge colorScheme={currentStep() === 1 ? "accent" : "neutral"}>
            {t("webdav_writeback.reconciliation.steps." + stepStatus(1))}
          </Badge>
        </HStack>
        <Text size="sm" color="$neutral10" mb="$3">
          {t("webdav_writeback.reconciliation.steps.collect_description")}
        </Text>
        <Show when={isStartable()}>
          <HStack w="$full" alignItems="flex-end" spacing="$2" wrap="wrap">
            <FormControl maxW="$96">
              <FormLabel>{t("webdav_writeback.reconciliation.root")}</FormLabel>
              <FolderChooseInput
                value={root()}
                onChange={setRoot}
                placeholder={t("webdav_writeback.reconciliation.root_placeholder")}
              />
            </FormControl>
            <Button colorScheme="accent" onClick={start}>
              {t("webdav_writeback.reconciliation.start")}
            </Button>
          </HStack>
        </Show>
        <Show when={!isStartable()}>
          <HStack wrap="wrap" spacing="$4">
            <Text>{t("webdav_writeback.reconciliation.source_files")}: {run()?.source_files ?? 0}</Text>
            <Text>{t("webdav_writeback.reconciliation.source_bytes")}: {bytes(run()?.source_bytes)}</Text>
          </HStack>
          <Show when={run()?.state === "collecting"}>
            <Text size="sm" color="$neutral10" mt="$2">
              {t("webdav_writeback.reconciliation.instructions.collecting")}
            </Text>
            <HStack wrap="wrap" spacing="$2" mt="$3">
              <Button colorScheme="accent" onClick={finishCollection}>
                {t("webdav_writeback.reconciliation.finish_collection")}
              </Button>
              <Show when={canCancel()}>
                <Button colorScheme="danger" variant="outline" onClick={cancel}>
                  {t("webdav_writeback.reconciliation.cancel")}
                </Button>
              </Show>
            </HStack>
          </Show>
        </Show>
      </Box>

      <Box
        w="$full"
        borderWidth="1px"
        borderColor={currentStep() === 2 ? "$accent6" : "$neutral6"}
        rounded="$lg"
        p="$3"
      >
        <HStack w="$full" justifyContent="space-between" wrap="wrap" mb="$2">
          <Heading size="sm">{t("webdav_writeback.reconciliation.steps.compare")}</Heading>
          <Badge colorScheme={currentStep() === 2 ? "accent" : "neutral"}>
            {t("webdav_writeback.reconciliation.steps." + stepStatus(2))}
          </Badge>
        </HStack>
        <Text size="sm" color="$neutral10" mb="$3">
          {t("webdav_writeback.reconciliation.steps.compare_description")}
        </Text>
        <Show when={currentStep() >= 2}>
          <HStack wrap="wrap" spacing="$4" mb="$3">
            <Text>{t("webdav_writeback.reconciliation.remote_files")}: {run()?.remote_files ?? 0}</Text>
            <Text>{t("webdav_writeback.reconciliation.matched")}: {run()?.matched_files ?? 0}</Text>
            <Text>{t("webdav_writeback.reconciliation.missing")}: {run()?.missing_files ?? 0}</Text>
            <Text>{t("webdav_writeback.reconciliation.extra")}: {run()?.extra_files ?? 0}</Text>
            <Text>{t("webdav_writeback.reconciliation.directories")}: {run()?.scanned_directories ?? 0}</Text>
          </HStack>
        </Show>
        <Show when={run()?.state === "comparing" || run()?.state === "compare_failed"}>
          <Text size="sm" color="$neutral10">
            {t("webdav_writeback.reconciliation.instructions." + run()!.state)}
          </Text>
        </Show>
        <Show when={run()?.state === "compare_failed" || run()?.state === "delete_failed"}>
          <Button colorScheme="accent" mt="$3" onClick={finishCollection}>
            {t("webdav_writeback.reconciliation.compare_again")}
          </Button>
        </Show>
        <Show when={canCancel() && currentStep() === 2}>
          <Button colorScheme="danger" variant="outline" mt="$3" onClick={cancel}>
            {t("webdav_writeback.reconciliation.cancel")}
          </Button>
        </Show>
      </Box>

      <Box
        w="$full"
        borderWidth="1px"
        borderColor={currentStep() === 3 ? "$accent6" : "$neutral6"}
        rounded="$lg"
        p="$3"
      >
        <HStack w="$full" justifyContent="space-between" wrap="wrap" mb="$2">
          <Heading size="sm">{t("webdav_writeback.reconciliation.steps.review")}</Heading>
          <Badge colorScheme={currentStep() === 3 ? "accent" : "neutral"}>
            {t("webdav_writeback.reconciliation.steps." + stepStatus(3))}
          </Badge>
        </HStack>
        <Text size="sm" color="$neutral10" mb="$3">
          {t("webdav_writeback.reconciliation.steps.review_description")}
        </Text>
        <Show when={run() && ["preview", "deleting", "delete_failed", "ready", "completed", "canceled"].includes(run()!.state)}>
          <Text size="sm" color="$neutral10">
            {t("webdav_writeback.reconciliation.instructions." + run()!.state)}
          </Text>
        </Show>
        <Show when={run() && currentStep() >= 3}>
          <HStack wrap="wrap" spacing="$4" mt="$3">
            <Text>{t("webdav_writeback.reconciliation.deleted")}: {run()?.deleted_files ?? 0}</Text>
          </HStack>
        </Show>
        <HStack wrap="wrap" spacing="$2" mt="$3">
          <Show when={run()?.state === "preview" && candidateCount() > 0}>
            <Button colorScheme="danger" onClick={deleteExtras}>
              {t("webdav_writeback.reconciliation.delete_extras")} ({candidateCount()})
            </Button>
          </Show>
          <Show when={run()?.state === "delete_failed" && candidateCount() > 0}>
            <Button colorScheme="danger" onClick={deleteExtras}>
              {t("webdav_writeback.reconciliation.retry_delete")} ({candidateCount()})
            </Button>
          </Show>
          <Show when={run()?.state === "ready"}>
            <Button colorScheme="accent" onClick={finish}>
              {t("webdav_writeback.reconciliation.finish")}
            </Button>
          </Show>
          <Show when={canCancel() && currentStep() === 3}>
            <Button colorScheme="danger" variant="outline" onClick={cancel}>
              {t("webdav_writeback.reconciliation.cancel")}
            </Button>
          </Show>
        </HStack>
      </Box>

      <Show when={(run()?.state === "preview" || run()?.state === "delete_failed") && candidates().length > 0}>
        <Box w="$full" overflowX="auto" borderWidth="1px" borderColor="$neutral6" rounded="$lg" p="$3">
          <Heading size="sm" mb="$2">
            {t("webdav_writeback.reconciliation.candidate_list")} ({candidateCount()})
          </Heading>
          <HStack w="$full" justifyContent="space-between" mb="$2" wrap="wrap">
            <Text size="xs" color="$neutral10">
              {t("webdav_writeback.reconciliation.showing_page")} {candidatePage()} / {Math.max(1, Math.ceil(candidateCount() / 100))}
            </Text>
            <HStack spacing="$2">
              <Button
                size="sm"
                variant="outline"
                disabled={candidatePage() <= 1 || loading()}
                onClick={() => {
                  setCandidatePage(candidatePage() - 1)
                  void refresh()
                }}
              >
                {t("webdav_writeback.reconciliation.previous")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={candidatePage() >= Math.ceil(candidateCount() / 100) || loading()}
                onClick={() => {
                  setCandidatePage(candidatePage() + 1)
                  void refresh()
                }}
              >
                {t("webdav_writeback.reconciliation.next")}
              </Button>
            </HStack>
          </HStack>
          <Table dense highlightOnHover>
            <Thead>
              <Tr>
                <Th>{t("webdav_writeback.reconciliation.path")}</Th>
                <Th>{t("webdav_writeback.reconciliation.local_size")}</Th>
                <Th>{t("webdav_writeback.reconciliation.remote_size")}</Th>
                <Th>{t("webdav_writeback.reconciliation.result")}</Th>
              </Tr>
            </Thead>
            <Tbody>
              <For each={candidates()}>
                {(candidate) => (
                  <Tr>
                    <Td><Text style={{ "overflow-wrap": "anywhere" }}>{candidate.path}</Text></Td>
                    <Td>{candidate.is_dir ? "—" : bytes(candidate.size)}</Td>
                    <Td>{candidate.is_dir ? "—" : bytes(candidate.remote_size)}</Td>
                    <Td>{t("webdav_writeback.reconciliation.results." + candidate.result)}</Td>
                  </Tr>
                )}
              </For>
            </Tbody>
          </Table>
        </Box>
      </Show>
    </VStack>
  )

}

export default ReconciliationPanel
