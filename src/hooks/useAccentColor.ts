import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyProfile } from "@/lib/profile.functions";
import { applyAccentColor, readCachedAccent } from "@/lib/accentColors";
import { useAuth } from "@/lib/auth";

/**
 * Applies the user's accent color to :root. Runs the cached value immediately
 * (avoids color flash), then re-applies once the profile loads.
 */
export function useAccentColor() {
  const { user } = useAuth();
  const fetchProfile = useServerFn(getMyProfile);

  // Apply cached value ASAP.
  useEffect(() => {
    applyAccentColor(readCachedAccent());
  }, []);

  const { data } = useQuery({
    queryKey: ["my-profile"],
    queryFn: () => fetchProfile(),
    enabled: !!user,
    staleTime: 60_000,
  });

  useEffect(() => {
    const profile = data?.profile as { accent_color?: string | null } | null | undefined;
    if (profile?.accent_color) applyAccentColor(profile.accent_color);
  }, [data]);
}
