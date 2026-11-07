"use client";

import { Alert, Box, Card, Chip, Typography } from "@mui/material";
import { Eyebrow, PageSkeleton, useData } from "@/components/Frame";

type Paper = {
  id: string;
  title: string;
  year: number;
  sourceName: string;
  rightsStatus: string;
  status: string;
  note: string;
  generationSource?: string;
  questionIds?: string[];
};

export default function PyqPage() {
  const { data, error, loading } = useData<Paper[]>("/admin/pyq");
  return (
    <Box>
      <Eyebrow>AI GENERATED · MONITOR</Eyebrow>
      <Typography variant="h1">PYQ</Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Manual upload illa. Question paper + answer paper AI generate / ingest — separate store.
        Student test-la question mattum; submit apram answer compare panni result.
      </Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading ? <PageSkeleton rows={5} /> : null}
      {!loading && (data || []).map((paper) => (
        <Card key={paper.id} sx={{ p: 2, mb: 1 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, alignItems: "flex-start" }}>
            <Box>
              <Typography fontWeight={800}>{paper.title}</Typography>
              <Typography color="text.secondary">
                {paper.year} · {paper.sourceName} · {paper.generationSource || "ai"} · {paper.questionIds?.length || 0} questions
              </Typography>
              {paper.note ? <Typography fontSize={13} sx={{ mt: 0.5 }}>{paper.note}</Typography> : null}
            </Box>
            <Box sx={{ display: "flex", gap: 0.5 }}>
              <Chip size="small" label={paper.status} sx={{ fontWeight: 800 }} />
              <Chip size="small" label={`rights: ${paper.rightsStatus}`} />
            </Box>
          </Box>
        </Card>
      ))}
      {!loading && data && !data.length && (
        <Typography color="text.secondary">PYQ papers illa — student/AI generation flow ready aana inga monitor pannuvom.</Typography>
      )}
    </Box>
  );
}
