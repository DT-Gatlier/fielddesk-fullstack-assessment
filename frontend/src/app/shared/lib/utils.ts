import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export const isEmpty = (value: string | undefined | null | object): boolean => {
  if (value === undefined || value === null) {
    return true
  }
  if (typeof value === "string" || Array.isArray(value)) {
    return value.length === 0
  }
  if (typeof value === "object") {
    return Object.keys(value).length === 0
  }
  return false
}

