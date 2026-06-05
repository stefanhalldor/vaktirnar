import { redirect } from 'next/navigation'

// Passwordless flow has no separate signup — same email-code flow handles both
export default function AuthMvpSignupPage() {
  redirect('/auth-mvp/innskraning')
}
