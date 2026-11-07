"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (!user.onboardingComplete) router.replace("/onboarding");
    else router.replace("/dashboard");
  }, [loading, user, router]);
  return null;
}
