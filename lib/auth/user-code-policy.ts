// Shared public timing policy for the login-code request flow. Keeping the
// resend window in a client-safe module prevents the API, UI, and database
// arguments from drifting apart.
export const USER_CODE_RESEND_WINDOW_SECONDS = 120
