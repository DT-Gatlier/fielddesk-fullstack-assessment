import { toast } from "sonner"

/**
 * Handles HTTP error responses by displaying appropriate toast messages
 * @param {any} error - The error object from an HTTP request
 * @returns {void} Shows a toast message based on the error status
 */
export const handleError = (error: any): void => {
  const status = error?.response?.status
  const serverMsg = error?.response?.data?.message || error?.response?.data?.error

  // Network related errors
  if (error?.code === "ERR_NETWORK") {
    toast.error(
      "Unable to connect to the service. Please check your network connection and try again."
    )
    return
  }

  if (error?.code === "ECONNABORTED") {
    toast.error(
      "Request timed out. The server took too long to respond. Please try again."
    )
    return
  }

  switch (status) {
    case 400:
      if (serverMsg) {
        toast.error(serverMsg)
      }
      return
    case 403:
      // Suppress 403 toast messages per user preference
      return
    case 404:
      if (serverMsg) {
        toast.error(serverMsg)
      }
      return
    case 429:
      toast.error(
        serverMsg || "Too many requests. Please wait a moment and try again."
      )
      return
    case 500:
      toast.error(
        serverMsg || "We're currently experiencing technical issues. Please try again later."
      )
      return
  }
}
