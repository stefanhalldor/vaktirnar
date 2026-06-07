import { redirect } from 'next/navigation'

// /auth-mvp/innskraning is a legacy alias — canonical login is /innskraning
export default function AuthMvpInnskraningPage() {
  redirect('/innskraning')
}
