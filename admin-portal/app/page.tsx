"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    router.replace(localStorage.getItem("av_admin_access") ? "/overview" : "/login");
  }, [router]);
  return null;
}
