import type { ReactNode } from "react"

export interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title?: ReactNode
  description?: string
  children: ReactNode
  size?: "sm" | "md" | "lg" | "xl" | "2xl"
  className?: string
}

