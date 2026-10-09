export interface ExportWorkOrdersFilters {
  status?: string;
  priority?: string;
  search?: string;
  assignedTechnicianId?: string;
}

/**
 * Downloads filtered work orders as an RFC 4180 CSV file with
 * authenticated session cookies and dynamic filename extraction.
 */
export async function downloadWorkOrdersCsv(
  filters: ExportWorkOrdersFilters,
): Promise<void> {
  const apiBase =
    process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  const queryParams = new URLSearchParams();
  if (filters.status) queryParams.set('status', filters.status);
  if (filters.priority) queryParams.set('priority', filters.priority);
  if (filters.search) queryParams.set('search', filters.search);
  if (filters.assignedTechnicianId) {
    queryParams.set('assignedTechnicianId', filters.assignedTechnicianId);
  }

  const queryString = queryParams.toString();
  const url = `${apiBase}/api/v1/work-orders/export${queryString ? `?${queryString}` : ''}`;

  const response = await fetch(url, {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: 'text/csv',
    },
  });

  if (!response.ok) {
    let errorMessage = `Export failed with status ${response.status}`;
    try {
      const errorJson = (await response.json()) as { message?: string };
      if (errorJson?.message) {
        errorMessage = errorJson.message;
      }
    } catch {
      // Ignore JSON parse errors for non-JSON responses
    }
    throw new Error(errorMessage);
  }

  // Extract dynamic filename from Content-Disposition header if available
  let filename = `work-orders-${new Date().toISOString().split('T')[0]}.csv`;
  const disposition = response.headers.get('content-disposition');
  if (disposition) {
    const filenameMatch = disposition.match(/filename="?([^";]+)"?/i);
    if (filenameMatch && filenameMatch[1]) {
      filename = filenameMatch[1];
    }
  }

  const blob = await response.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = downloadUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(downloadUrl);
}
