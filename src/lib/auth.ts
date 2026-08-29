import { supabase } from "@/lib/supabase";

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
    // "/" is the only sign-in surface now. The Google-only /login page was
    // deleted in work order 10; sending a signed-out user there would have
    // landed them on a 404.
    window.location.href = "/";
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