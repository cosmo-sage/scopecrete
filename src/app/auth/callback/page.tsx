import { redirect } from "next/navigation";

export default function AuthCallbackPage() {
  redirect("/login");
}