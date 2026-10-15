import { supabase } from "@/lib/supabase";
import { LOGIN_URL, hostKind } from "@/lib/hosts";

const getRedirectUrl = () => `${window.location.origin}/auth/callback`;

export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: getRedirectUrl(),
    },
  });
  if (data.url) {
    window.location.href = data.url;
  }
  return { error };
}

export async function signInWithEmail(email: string) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: getRedirectUrl(),
    },
  });
  return { error };
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (!error) {
    // Signed out on app.scopecrete.ai → its sign-in page; on an org's address →
    // that address's own /login, so the app on a home screen stays in the app.
    // Elsewhere (previews) "/" is sign-in.
    const k = hostKind(window.location.hostname).kind;
    window.location.href = k === "app" ? LOGIN_URL : k === "org" ? "/login" : "/";
  }
  return { error };
}

export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}