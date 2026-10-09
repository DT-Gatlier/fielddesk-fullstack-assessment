export function safeReturnPath(value: string | null): string {
  if (
    !value ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    /[\\\s]/.test(value) ||
    Array.from(value).some((character) => character.charCodeAt(0) < 32)
  ) {
    return '/dashboard';
  }
  try {
    const url = new URL(value, 'https://fielddesk.invalid');
    const pathname = decodeURIComponent(url.pathname);
    if (
      url.origin !== 'https://fielddesk.invalid' ||
      pathname.startsWith('//') ||
      pathname.includes('\\') ||
      pathname === '/' ||
      pathname === '/login' ||
      pathname.startsWith('/login/')
    ) {
      return '/dashboard';
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return '/dashboard';
  }
}
