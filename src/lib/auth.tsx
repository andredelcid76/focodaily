import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";
import { setBrowserTimezone } from "@/lib/date";

type AuthCtx = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [timezoneUser, setTimezoneUser] = useState<string | null>(null);
  const timezoneReady = timezoneUser === (session?.user.id ?? "anonymous");

  useEffect(() => {
    let alive = true;
    setBrowserTimezone(null);
    const uid = session?.user.id;
    if (!uid) { setTimezoneUser("anonymous"); return; }
    void supabase.from("profiles").select("timezone").eq("user_id", uid).maybeSingle().then(({ data }) => {
      if (!alive) return;
      setBrowserTimezone(data?.timezone);
      setTimezoneUser(uid);
    });
    return () => { alive = false; };
  }, [session?.user.id]);

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

  return (
    <Ctx.Provider
      value={{
        user: session?.user ?? null,
        session,
        loading: loading || !timezoneReady,
        signOut: async () => {
          await supabase.auth.signOut();
        },
      }}
    >
      {timezoneReady ? children : null}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used within AuthProvider");
  return c;
}
