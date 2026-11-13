import { describe, it, expect, beforeEach, vi } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { AssignTechnicianModal } from "@/modules/Common/WorkOrders/AssignTechnicianModal"
import { workOrderService } from "@/modules/Common/WorkOrders/services"
import type { WorkOrder } from "@/modules/Common/WorkOrders/services/type"

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

const sampleWorkOrder: WorkOrder = {
  id: "10000000-0000-0000-0000-000000000001",
  organisationId: "org-apex-01",
  referenceNumber: "WO-APEX-1001",
  title: "HVAC Filter Replacement & Calibration",
  description: "Routine AHU service",
  priority: "medium",
  status: "open",
  siteName: "Apex Tower North - Floor 3",
  assignedTechnicianId: null,
  scheduledStart: null,
  scheduledEnd: null,
  createdBy: "11111111-1111-1111-1111-111111111102",
  createdAt: "2026-11-10T08:00:00Z",
  updatedAt: "2026-11-10T08:00:00Z",
}

const sampleTechnicians = [
  {
    id: "11111111-1111-1111-1111-111111111103",
    name: "Tom Technician (Apex)",
    email: "technician@apex.test",
  },
  {
    id: "11111111-1111-1111-1111-111111111104",
    name: "Tina Technician (Apex)",
    email: "technician2@apex.test",
  },
]

function renderWithQueryClient(ui: React.ReactElement) {
  const testQueryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={testQueryClient}>{ui}</QueryClientProvider>
  )
}

async function pickDateTime(
  user: ReturnType<typeof userEvent.setup>,
  labelRegex: RegExp,
  dayOfMonth: string,
  time24: string
) {
  await user.click(screen.getByLabelText(labelRegex))

  const dayButton = screen
    .getAllByRole("gridcell")
    .map((cell) => (cell.tagName === "BUTTON" ? cell : cell.querySelector("button")))
    .find(
      (btn) =>
        btn &&
        btn.textContent?.trim() === dayOfMonth &&
        !btn.className.includes("day-outside") &&
        !btn.hasAttribute("disabled")
    )

  expect(dayButton).toBeTruthy()
  await user.click(dayButton!)

  const timeInput = screen.getByLabelText(/exact time/i)
  fireEvent.change(timeInput, { target: { value: time24 } })

  await user.click(screen.getByRole("button", { name: /^Done$/i }))
}

describe("Frontend Critical Workflow: Technician Scheduling & Conflict Resolution", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(workOrderService, "getTechnicians").mockResolvedValue(sampleTechnicians)
  })

  it("validates end > start locally before submitting to backend API", async () => {
    const assignSpy = vi.spyOn(workOrderService, "assignTechnician")
    const user = userEvent.setup()

    renderWithQueryClient(
      <AssignTechnicianModal
        workOrder={sampleWorkOrder}
        isOpen={true}
        onClose={vi.fn()}
      />
    )

    const selectEl = await screen.findByLabelText(/Select Active Technician/i)
    await waitFor(() => {
      expect(screen.getByText(/Tom Technician/i)).toBeInTheDocument()
    })

    await user.selectOptions(selectEl, sampleTechnicians[0].id)

    await pickDateTime(user, /Scheduled Start/i, "15", "14:00")
    await pickDateTime(user, /Scheduled End/i, "15", "10:00")

    await user.click(screen.getByRole("button", { name: /Confirm Assignment/i }))

    expect(
      await screen.findByText(/Scheduled end time must be after scheduled start time/i)
    ).toBeInTheDocument()
    expect(assignSpy).not.toHaveBeenCalled()
  })

  it("displays ConflictResolutionModal on HTTP 409, preserves form draft on Change Time Slot, and completes reschedule", async () => {
    const onClose = vi.fn()
    const conflictError = {
      isAxiosError: true,
      response: {
        status: 409,
        data: {
          type: "https://api.fielddesk.internal/errors/scheduling-conflict",
          title: "Scheduling Conflict",
          status: 409,
          code: "SCHEDULING_CONFLICT",
          detail: "Technician Tom Technician (Apex) is already scheduled for WO-APEX-1002.",
          conflictingWorkOrder: {
            id: "10000000-0000-0000-0000-000000000002",
            referenceNumber: "WO-APEX-1002",
            scheduledStart: "2026-12-01T09:00:00Z",
            scheduledEnd: "2026-12-01T11:00:00Z",
          },
        },
      },
    }

    const assignSpy = vi
      .spyOn(workOrderService, "assignTechnician")
      .mockRejectedValueOnce(conflictError)
      .mockResolvedValueOnce({
        ...sampleWorkOrder,
        assignedTechnicianId: sampleTechnicians[0].id,
        scheduledStart: "2026-12-01T15:00:00Z",
        scheduledEnd: "2026-12-01T17:00:00Z",
      })

    const user = userEvent.setup()

    renderWithQueryClient(
      <AssignTechnicianModal
        workOrder={sampleWorkOrder}
        isOpen={true}
        onClose={onClose}
      />
    )

    const selectEl = (await screen.findByLabelText(/Select Active Technician/i)) as HTMLSelectElement
    await waitFor(() => {
      expect(screen.getByText(/Tom Technician/i)).toBeInTheDocument()
    })

    await user.selectOptions(selectEl, sampleTechnicians[0].id)

    await pickDateTime(user, /Scheduled Start/i, "15", "09:30")
    await pickDateTime(user, /Scheduled End/i, "15", "10:30")

    // 1. Trigger overlapping schedule submission -> 409 Conflict
    await user.click(screen.getByRole("button", { name: /Confirm Assignment/i }))

    expect(
      await screen.findByText(/Scheduling Conflict Detected/i)
    ).toBeInTheDocument()
    expect(screen.getByText("WO-APEX-1002")).toBeInTheDocument()
    expect(assignSpy).toHaveBeenCalledTimes(1)

    // 2. Click "Change Time Slot" -> form draft remains intact
    await user.click(screen.getByRole("button", { name: /Change Time Slot/i }))

    await waitFor(() => {
      expect(screen.queryByText(/Scheduling Conflict Detected/i)).not.toBeInTheDocument()
    })

    const preservedSelect = screen.getByLabelText(/Select Active Technician/i) as HTMLSelectElement
    expect(preservedSelect.value).toBe(sampleTechnicians[0].id)

    // 3. Adjust window and resubmit -> succeeds cleanly
    await pickDateTime(user, /Scheduled Start/i, "15", "15:00")
    await pickDateTime(user, /Scheduled End/i, "15", "17:00")

    await user.click(screen.getByRole("button", { name: /Confirm Assignment/i }))

    await waitFor(() => {
      expect(assignSpy).toHaveBeenCalledTimes(2)
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  it("unwraps raw and wrapped work order payloads correctly in workOrderService", async () => {
    const rawWorkOrder = { ...sampleWorkOrder, referenceNumber: "WO-RAW-001" }
    const wrappedWorkOrder = { ...sampleWorkOrder, referenceNumber: "WO-WRAPPED-002" }

    // Test getById with raw response
    const getSpy = vi
      .spyOn(workOrderService, "getById")
      .mockResolvedValueOnce(rawWorkOrder)
    const resRaw = await workOrderService.getById("raw-id")
    expect(resRaw.referenceNumber).toBe("WO-RAW-001")
    expect(getSpy).toHaveBeenCalledWith("raw-id")

    // Test create with wrapped response
    const createSpy = vi
      .spyOn(workOrderService, "create")
      .mockResolvedValueOnce(wrappedWorkOrder)
    const resWrapped = await workOrderService.create({
      title: "Test",
      priority: "medium",
      siteName: "Site A",
    })
    expect(resWrapped.referenceNumber).toBe("WO-WRAPPED-002")
    expect(createSpy).toHaveBeenCalled()
  })
})

