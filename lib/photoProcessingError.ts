const LOW_STORAGE_THRESHOLD_BYTES = 512 * 1024 * 1024;
const MEGABYTE = 1024 * 1024;
const GIGABYTE = 1024 * MEGABYTE;

function getErrorText(error: unknown): string {
  const messages: string[] = [];
  const visited = new Set<object>();
  let current: unknown = error;

  for (let depth = 0; depth < 8 && current != null; depth += 1) {
    if (typeof current === 'string') {
      messages.push(current);
      break;
    }

    if (typeof current !== 'object' || visited.has(current)) break;
    visited.add(current);

    const value = current as { cause?: unknown; code?: unknown; message?: unknown; name?: unknown };
    if (typeof value.name === 'string') messages.push(value.name);
    if (typeof value.message === 'string') messages.push(value.message);
    if (typeof value.code === 'string') messages.push(value.code);
    current = value.cause;
  }

  return messages.join(' ');
}

function formatStorage(bytes: number): string {
  if (bytes < GIGABYTE) return `${Math.floor(bytes / MEGABYTE)} MB`;
  return `${(bytes / GIGABYTE).toFixed(1)} GB`;
}

export function getPhotoProcessingErrorMessage(
  error: unknown,
  availableDiskSpace?: number
): string {
  const errorText = getErrorText(error);

  if (/enospc|no space left on device|disk full|out of storage|insufficient storage/i.test(errorText)) {
    return 'Your phone ran out of storage space. Free up space and try again.';
  }

  if (/outofmemoryerror|out of memory|failed to allocate|cannot allocate.*memory/i.test(errorText)) {
    return 'Your phone ran low on memory (RAM) while processing the photo. Close other apps or try a smaller photo.';
  }

  if (
    availableDiskSpace !== undefined &&
    Number.isFinite(availableDiskSpace) &&
    availableDiskSpace >= 0 &&
    availableDiskSpace < LOW_STORAGE_THRESHOLD_BYTES
  ) {
    return `Couldn't process this photo. Your phone has about ${formatStorage(availableDiskSpace)} of storage free; freeing up space may help.`;
  }

  return "Couldn't load or process this photo. Check that it's available and try again. If this keeps happening, check your phone's free storage or try a smaller photo.";
}
