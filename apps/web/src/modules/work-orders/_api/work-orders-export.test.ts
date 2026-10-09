import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { downloadWorkOrdersCsv } from './work-orders-export';

describe('downloadWorkOrdersCsv', () => {
  const originalFetch = global.fetch;
  const originalWindow = (global as unknown as { window?: unknown }).window;
  const originalDocument = (global as unknown as { document?: unknown }).document;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    (global as unknown as { window?: unknown }).window = originalWindow;
    (global as unknown as { document?: unknown }).document = originalDocument;
  });

  it('serializes query parameters correctly and triggers blob download', async () => {
    const mockBlob = new Blob(['"Reference","Title"\r\n"WO-001","Fix pipe"\r\n'], {
      type: 'text/csv',
    });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: vi.fn((name: string) => {
          if (name.toLowerCase() === 'content-disposition') {
            return 'attachment; filename="work-orders-2026-10-08.csv"';
          }
          return null;
        }),
      },
      blob: vi.fn().mockResolvedValue(mockBlob),
    });
    global.fetch = mockFetch;

    // Mock DOM Object URL methods and anchor click
    const createObjectURLMock = vi.fn().mockReturnValue('blob:http://localhost/mock-blob');
    const revokeObjectURLMock = vi.fn();
    const clickMock = vi.fn();
    const appendChildMock = vi.fn();
    const removeChildMock = vi.fn();

    const mockAnchor = {
      href: '',
      download: '',
      click: clickMock,
    };

    (global as unknown as { window: unknown }).window = {
      URL: {
        createObjectURL: createObjectURLMock,
        revokeObjectURL: revokeObjectURLMock,
      },
    };

    (global as unknown as { document: unknown }).document = {
      createElement: vi.fn().mockReturnValue(mockAnchor),
      body: {
        appendChild: appendChildMock,
        removeChild: removeChildMock,
      },
    };

    await downloadWorkOrdersCsv({
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      search: 'HVAC',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/work-orders/export?status=IN_PROGRESS&priority=HIGH&search=HVAC'),
      expect.objectContaining({
        method: 'GET',
        credentials: 'include',
      }),
    );
    expect(createObjectURLMock).toHaveBeenCalledWith(mockBlob);
    expect(clickMock).toHaveBeenCalled();
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:http://localhost/mock-blob');
  });

  it('throws a meaningful error message when response is not ok', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: vi.fn().mockResolvedValue({ message: 'Forbidden access to organization export' }),
    });

    await expect(
      downloadWorkOrdersCsv({ status: 'COMPLETED' }),
    ).rejects.toThrow('Forbidden access to organization export');
  });
});
