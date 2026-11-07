"use client";

import { Alert, Box, Typography } from "@mui/material";
import { Eyebrow } from "@/components/Frame";

export default function ApprovalsPage() {
  return (
    <Box>
      <Eyebrow>RETIRED</Eyebrow>
      <Typography variant="h1">Content approval</Typography>
      <Alert severity="info" sx={{ mt: 2 }}>
        Content approval queue remove aaguthu. Syllabus AI refresh, questions student-side generate,
        PYQ AI generate — admin monitor / configure / audited correction mattum.
      </Alert>
    </Box>
  );
}
