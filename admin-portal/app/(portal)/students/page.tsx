"use client";

import { useState } from "react";
import { Box, Button, Card, TextField, Typography } from "@mui/material";
import { api } from "@/lib/api";
import { Eyebrow, PageSkeleton, useData } from "@/components/Frame";

type Student = { id: string; firstName: string; lastName: string; email: string; primaryExam: string; status: string; lastActiveDate: string };

export default function StudentsPage() {
  const [q, setQ] = useState("");
  const { data, error, loading, reload } = useData<Student[]>(`/admin/students?q=${encodeURIComponent(q)}`);
  return (
    <Box>
      <Eyebrow>USER MANAGEMENT</Eyebrow>
      <Typography variant="h1">Students</Typography>
      <Typography color="text.secondary">Sensitive tutor history is not listed here.</Typography>
      {error && <Typography color="error">{error}</Typography>}
      <TextField size="small" placeholder="Search name or email" value={q} onChange={(event) => setQ(event.target.value)} sx={{ my: 2 }} />
      {loading ? <PageSkeleton variant="table" rows={6} /> : (
      <Card sx={{ p: 2, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr>{["Student", "Primary exam", "Last active", "Status", ""].map((heading) => <th key={heading} style={{ textAlign: "left", padding: 8, color: "#667085" }}>{heading}</th>)}</tr></thead>
          <tbody>
            {(data || []).map((student) => (
              <tr key={student.id}>
                <td style={{ padding: 8 }}>{student.firstName} {student.lastName}<br /><span style={{ color: "#667085" }}>{student.email}</span></td>
                <td>{student.primaryExam || "—"}</td>
                <td>{student.lastActiveDate || "—"}</td>
                <td>{student.status}</td>
                <td><Button size="small" onClick={async () => { await api(`/admin/students/${student.id}`, { method: "PATCH", body: JSON.stringify({ status: student.status === "active" ? "suspended" : "active" }) }); reload(); }}>{student.status === "active" ? "Suspend" : "Activate"}</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      )}
    </Box>
  );
}
