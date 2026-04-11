export type TenderCardStatus = "new" | "inProgress" | "ready";

export type WorkspaceTender = {
  id: string;
  title: string;
  okpd2: string;
  confidence: number;
  category: string;
  status: TenderCardStatus;
  feedback: "like" | "dislike" | null;
  sellerId: string;
  sellerName: string;
  pnLot: string;
  lotSubject: string;
  matchedUnitName: string;
  procedureName: string;
  explanationShort: string;
};

export type MatrixPreviewResponse = {
  draftId: string;
  fileName: string;
  headers: string[];
  previewRows: string[][];
  suggestedMapping: string[];
  totalRows: number;
};

export type AnalysisStatusResponse = {
  sessionId: string;
  status: "queued" | "running" | "completed" | "failed";
  progress: number;
  message: string;
  error: string | null;
};

export type DashboardResponse = {
  highConfidenceCount: number;
  totalMatches: number;
  supplierItems: number;
  distinctLots: number;
  estimatedHoursSaved: number;
  topCategories: Array<{
    label: string;
    value: number;
  }>;
};

export type WorkspaceBoardResponse = {
  category: string;
  columns: Record<TenderCardStatus, WorkspaceTender[]>;
};

export type HighlightSegment = {
  text: string;
  kind: "plain" | "match" | "mismatch";
};

export type ExplanationBlock = {
  label: string;
  segments: HighlightSegment[];
};

export type MatchExplanationResponse = {
  title: string;
  supplierTitle: string;
  lotTitle: string;
  matchedTerms: string[];
  supplierBlocks: ExplanationBlock[];
  lotBlocks: ExplanationBlock[];
};

export type SystemSourceMeta = {
  fileName: string;
  uploadedAt: string;
};

export type SystemSourcesResponse = {
  tenders: SystemSourceMeta | null;
  okpd: SystemSourceMeta | null;
};

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = "Ошибка запроса";

    try {
      const payload = await response.json();
      message = payload?.detail || payload?.message || message;
    } catch {
      message = response.statusText || message;
    }

    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export async function uploadSupplierMatrix(file: File): Promise<MatrixPreviewResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/matrix/preview", {
    method: "POST",
    body: formData,
  });

  return parseResponse<MatrixPreviewResponse>(response);
}

export async function startAnalysis(payload: {
  draftId: string;
  columnMapping: string[];
  previewData: string[][];
}): Promise<{ sessionId: string; status: string }> {
  const response = await fetch("/api/analysis/start", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return parseResponse<{ sessionId: string; status: string }>(response);
}

export async function getAnalysisStatus(sessionId: string): Promise<AnalysisStatusResponse> {
  const response = await fetch(`/api/analysis/${sessionId}/status`);
  return parseResponse<AnalysisStatusResponse>(response);
}

export async function getDashboard(sessionId: string): Promise<DashboardResponse> {
  const response = await fetch(`/api/analysis/${sessionId}/dashboard`);
  return parseResponse<DashboardResponse>(response);
}

export async function getWorkspaceCategories(
  sessionId: string
): Promise<{ categories: string[] }> {
  const response = await fetch(`/api/workspace/${sessionId}/categories`);
  return parseResponse<{ categories: string[] }>(response);
}

export async function getWorkspaceBoard(
  sessionId: string,
  category: string,
  confidence: number
): Promise<WorkspaceBoardResponse> {
  const response = await fetch(
    `/api/workspace/${sessionId}/board?category=${encodeURIComponent(category)}&confidence=${confidence}`
  );
  return parseResponse<WorkspaceBoardResponse>(response);
}

export async function confirmMatch(sessionId: string, matchId: string): Promise<void> {
  const response = await fetch(`/api/workspace/${sessionId}/matches/${matchId}/confirm`, {
    method: "POST",
  });
  await parseResponse<{ ok: boolean }>(response);
}

export async function moveMatchToReady(sessionId: string, matchId: string): Promise<void> {
  const response = await fetch(`/api/workspace/${sessionId}/matches/${matchId}/ready`, {
    method: "POST",
  });
  await parseResponse<{ ok: boolean }>(response);
}

export async function bulkMoveMatchesToReady(
  sessionId: string,
  ids: string[]
): Promise<{ updated: number }> {
  const response = await fetch(`/api/workspace/${sessionId}/matches/bulk-ready`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ids }),
  });

  return parseResponse<{ updated: number }>(response);
}

export async function updateMatchFeedback(payload: {
  sessionId: string;
  matchId: string;
  value: "like" | "dislike" | null;
  reason?: string;
}): Promise<void> {
  const response = await fetch(
    `/api/workspace/${payload.sessionId}/matches/${payload.matchId}/feedback`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        value: payload.value,
        reason: payload.reason,
      }),
    }
  );

  await parseResponse<{ ok: boolean }>(response);
}

export async function getMatchExplanation(
  sessionId: string,
  matchId: string
): Promise<MatchExplanationResponse> {
  const response = await fetch(`/api/workspace/${sessionId}/matches/${matchId}/explain`);
  return parseResponse<MatchExplanationResponse>(response);
}

export async function exportSelectedMatches(
  sessionId: string,
  ids: string[]
): Promise<Blob> {
  const response = await fetch(`/api/workspace/${sessionId}/export`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ids }),
  });

  if (!response.ok) {
    let message = "Ошибка экспорта";

    try {
      const payload = await response.json();
      message = payload?.detail || payload?.message || message;
    } catch {
      message = response.statusText || message;
    }

    throw new Error(message);
  }

  return response.blob();
}

export async function getSystemSources(): Promise<SystemSourcesResponse> {
  const response = await fetch("/api/system/sources");
  return parseResponse<SystemSourcesResponse>(response);
}

export async function uploadSystemSource(
  sourceType: "tenders" | "okpd",
  file: File
): Promise<SystemSourceMeta> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`/api/system/sources/${sourceType}`, {
    method: "POST",
    body: formData,
  });

  return parseResponse<SystemSourceMeta>(response);
}
