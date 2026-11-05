/** Extracts a user-facing message from an unknown thrown value (Axios or Error). */
export function getApiErrorMessage(error: unknown, fallback: string): string {
  const responseError = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
  if (typeof responseError === 'string' && responseError.trim()) return responseError;
  const message = (error as { message?: string })?.message;
  if (typeof message === 'string' && message.trim()) return message;
  return fallback;
}
