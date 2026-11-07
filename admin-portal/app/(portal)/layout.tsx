"use client";

import { AdminFrame } from "@/components/Frame";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <AdminFrame>{children}</AdminFrame>;
}
