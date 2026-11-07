"use client";

import { useEffect } from "react";
import { Box } from "@mui/material";
import { useRouter } from "next/navigation";
import { useRequireStudent } from "@/lib/auth";
import { Shell } from "@/components/Shell";
import { PageSkeleton } from "@/components/PageSkeleton";

export default function LearnLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useRequireStudent();
  const router = useRouter();
  useEffect(() => {
    if (!loading && user && user.role !== "student") router.replace("/login");
  }, [loading, user, router]);
  if (loading || !user || !user.onboardingComplete) {
    return (
      <Box sx={{ minHeight: "100vh", bgcolor: "#F4F6FB", p: { xs: 2, md: 4 } }}>
        <PageSkeleton variant="dashboard" />
      </Box>
    );
  }
  return <Shell>{children}</Shell>;
}
