import { useState } from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon, Clock, X } from "lucide-react"

import { cn } from "@/app/shared/lib/utils"
import { Button } from "@/app/shared/widgets/base/button"
import { Calendar } from "@/app/shared/widgets/base/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/app/shared/widgets/base/popover"

import type { DateTimePickerProps } from "./type"

const HOURS_12 = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5)

function parseDateValue(value?: string | null): Date | undefined {
  if (!value) return undefined

  // Handle local datetime format "YYYY-MM-DDTHH:mm" without timezone shift
  const localMatch = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (localMatch) {
    const [, y, m, d, hh, mm] = localMatch
    const parsed = new Date(
      Number(y),
      Number(m) - 1,
      Number(d),
      Number(hh),
      Number(mm),
      0,
      0
    )
    return Number.isNaN(parsed.getTime()) ? undefined : parsed
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

function toLocalDateTimeString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function DateTimePicker({
  id,
  label,
  value,
  onChange,
  onBlur,
  placeholder = "Select date & time",
  error,
  helperText,
  disabled = false,
  className,
}: DateTimePickerProps) {
  const [open, setOpen] = useState(false)
  const inputId =
    id ||
    (label
      ? label
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "")
      : undefined)

  const selectedDate = parseDateValue(value)

  const currentHours24 = selectedDate ? selectedDate.getHours() : 9
  const currentMinutes = selectedDate ? selectedDate.getMinutes() : 0
  const isPm = currentHours24 >= 12
  const currentHour12 = currentHours24 % 12 === 0 ? 12 : currentHours24 % 12

  const handleDateSelect = (day: Date | undefined) => {
    if (!day) return
    const next = new Date(
      day.getFullYear(),
      day.getMonth(),
      day.getDate(),
      selectedDate ? selectedDate.getHours() : 9,
      selectedDate ? selectedDate.getMinutes() : 0,
      0,
      0
    )
    onChange(toLocalDateTimeString(next))
  }

  const updateTime = (hours24: number, minutes: number) => {
    const base = selectedDate ? new Date(selectedDate) : new Date()
    base.setHours(hours24, minutes, 0, 0)
    onChange(toLocalDateTimeString(base))
  }

  const handleHourSelect = (hour12: number) => {
    const hours24 = isPm ? (hour12 === 12 ? 12 : hour12 + 12) : hour12 === 12 ? 0 : hour12
    updateTime(hours24, currentMinutes)
  }

  const handleMinuteSelect = (minute: number) => {
    updateTime(currentHours24, minute)
  }

  const handleAmPmToggle = (targetPm: boolean) => {
    if (targetPm === isPm && selectedDate) return
    let nextHours = currentHours24
    if (targetPm && nextHours < 12) {
      nextHours += 12
    } else if (!targetPm && nextHours >= 12) {
      nextHours -= 12
    }
    updateTime(nextHours, currentMinutes)
  }

  const handleTimeInputChange = (timeStr: string) => {
    if (!timeStr) return
    const [hhStr, mmStr] = timeStr.split(":")
    const hh = Number(hhStr)
    const mm = Number(mmStr)
    if (!Number.isNaN(hh) && !Number.isNaN(mm)) {
      updateTime(hh, mm)
    }
  }

  const handleClear = () => {
    onChange("")
    setOpen(false)
  }

  const pad = (n: number) => String(n).padStart(2, "0")
  const timeInputValue = selectedDate
    ? `${pad(selectedDate.getHours())}:${pad(selectedDate.getMinutes())}`
    : ""

  return (
    <div className={cn("w-full", className)}>
      {label && (
        <label
          htmlFor={inputId}
          className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5"
        >
          {label}
        </label>
      )}

      <Popover
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen)
          if (!nextOpen && onBlur) {
            onBlur()
          }
        }}
      >
        <div className="relative flex items-center">
          <PopoverTrigger asChild>
            <button
              id={inputId}
              type="button"
              disabled={disabled}
              aria-haspopup="dialog"
              aria-expanded={open}
              className={cn(
                "flex h-9 w-full items-center justify-between rounded-lg border border-slate-300 bg-white px-3 py-1 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50",
                selectedDate ? "text-slate-900 pr-8" : "text-slate-400",
                error && "border-rose-400 focus-visible:ring-rose-400"
              )}
            >
              <span className="flex items-center gap-2 truncate">
                <CalendarIcon className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="truncate">
                  {selectedDate
                    ? format(selectedDate, "dd/MM/yyyy, hh:mm a")
                    : placeholder}
                </span>
              </span>
            </button>
          </PopoverTrigger>

          {selectedDate && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              aria-label="Clear selection"
              className="absolute right-2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <PopoverContent className="w-auto p-0" align="start">
          <div className="flex flex-col sm:flex-row">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={handleDateSelect}
              defaultMonth={selectedDate}
              initialFocus
            />

            <div className="flex flex-col border-t sm:border-t-0 sm:border-l border-slate-200 p-3 w-full sm:w-52 bg-slate-50/50">
              <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-200">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                  <Clock className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Time</span>
                </span>
                <span className="text-[11px] font-medium text-slate-500">
                  {selectedDate ? format(selectedDate, "hh:mm a") : "--:-- --"}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-1.5 h-44">
                {/* Hours */}
                <div className="flex flex-col overflow-y-auto pr-0.5 space-y-1">
                  <span className="text-[10px] font-semibold uppercase text-slate-400 text-center pb-0.5">
                    Hr
                  </span>
                  {HOURS_12.map((hr) => (
                    <button
                      key={hr}
                      type="button"
                      onClick={() => handleHourSelect(hr)}
                      className={cn(
                        "rounded-md py-1 text-xs font-medium transition-colors",
                        selectedDate && currentHour12 === hr
                          ? "bg-emerald-600 text-white"
                          : "text-slate-700 hover:bg-slate-200/70"
                      )}
                    >
                      {String(hr).padStart(2, "0")}
                    </button>
                  ))}
                </div>

                {/* Minutes */}
                <div className="flex flex-col overflow-y-auto pr-0.5 space-y-1">
                  <span className="text-[10px] font-semibold uppercase text-slate-400 text-center pb-0.5">
                    Min
                  </span>
                  {MINUTES.map((min) => (
                    <button
                      key={min}
                      type="button"
                      onClick={() => handleMinuteSelect(min)}
                      className={cn(
                        "rounded-md py-1 text-xs font-medium transition-colors",
                        selectedDate && currentMinutes === min
                          ? "bg-emerald-600 text-white"
                          : "text-slate-700 hover:bg-slate-200/70"
                      )}
                    >
                      {String(min).padStart(2, "0")}
                    </button>
                  ))}
                </div>

                {/* AM / PM */}
                <div className="flex flex-col space-y-1">
                  <span className="text-[10px] font-semibold uppercase text-slate-400 text-center pb-0.5">
                    Period
                  </span>
                  <button
                    type="button"
                    onClick={() => handleAmPmToggle(false)}
                    className={cn(
                      "rounded-md py-1.5 text-xs font-semibold transition-colors",
                      selectedDate && !isPm
                        ? "bg-emerald-600 text-white"
                        : "text-slate-700 hover:bg-slate-200/70"
                    )}
                  >
                    AM
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAmPmToggle(true)}
                    className={cn(
                      "rounded-md py-1.5 text-xs font-semibold transition-colors",
                      selectedDate && isPm
                        ? "bg-emerald-600 text-white"
                        : "text-slate-700 hover:bg-slate-200/70"
                    )}
                  >
                    PM
                  </button>
                </div>
              </div>

              <div className="mt-2 pt-2 border-t border-slate-200 space-y-2">
                <input
                  type="time"
                  aria-label={label ? `${label} exact time` : "Exact time"}
                  value={timeInputValue}
                  onChange={(e) => handleTimeInputChange(e.target.value)}
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />

                <div className="flex items-center justify-between gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleClear}
                    className="h-7 px-2 text-xs text-slate-500 hover:text-rose-600"
                  >
                    Clear
                  </Button>
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    onClick={() => setOpen(false)}
                    className="h-7 px-3 text-xs"
                  >
                    Done
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {error && <p className="mt-1 text-xs font-medium text-rose-600">{error}</p>}
      {!error && helperText && (
        <p className="mt-1 text-xs text-slate-500">{helperText}</p>
      )}
    </div>
  )
}

export default DateTimePicker
