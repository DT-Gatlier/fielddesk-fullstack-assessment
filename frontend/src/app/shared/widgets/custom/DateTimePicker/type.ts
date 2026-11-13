export interface DateTimePickerProps {
  id?: string
  label?: string
  value?: string | null
  onChange: (value: string) => void
  onBlur?: () => void
  placeholder?: string
  error?: string
  helperText?: string
  disabled?: boolean
  className?: string
}

