import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// Username-only auth: we synthesize a stable email under a private domain so the
// underlying Supabase email/password flow keeps working without ever asking the
// user for an email address.
const EMAIL_DOMAIN = "chatvault.local";

function usernameToEmail(raw: string): string {
  const u = raw.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
  return `${u}@${EMAIL_DOMAIN}`;
}

export function displayName(user: User | null): string {
  if (!user?.email) return "you";
  return user.email.split("@")[0] ?? "you";
}

interface AuthCtx {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<{ error?: string }>;
  signUp: (username: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setLoading(false);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  function validate(username: string, password: string): string | null {
    if (!/^[a-zA-Z0-9._-]{3,24}$/.test(username.trim()))
      return "Username must be 3–24 letters, numbers, dots, underscores or dashes.";
    if (password.length < 6) return "Password must be at least 6 characters.";
    return null;
  }

  const value: AuthCtx = {
    user: session?.user ?? null,
    session,
    loading,
    signIn: async (username, password) => {
      const v = validate(username, password);
      if (v) return { error: v };
      const { error } = await supabase.auth.signInWithPassword({
        email: usernameToEmail(username),
        password,
      });
      if (error) return { error: error.message.replace(/email/gi, "username") };
      return {};
    },
    signUp: async (username, password) => {
      const v = validate(username, password);
      if (v) return { error: v };
      const { error } = await supabase.auth.signUp({
        email: usernameToEmail(username),
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) return { error: error.message.replace(/email/gi, "username") };
      return {};
    },
    signOut: async () => {
      await supabase.auth.signOut();
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used within AuthProvider");
  return c;
}
