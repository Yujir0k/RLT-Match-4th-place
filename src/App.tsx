import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Database,
  Download,
  FileSpreadsheet,
  Loader2,
  Play,
  Settings,
  TableProperties,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";
import { Button } from "./components/ui/Button";
import { Checkbox } from "./components/ui/Checkbox";
import { FileUpload } from "./components/ui/FileUpload";
import { Slider } from "./components/ui/Slider";
import {
  bulkMoveMatchesToReady,
  confirmMatch,
  exportSelectedMatches,
  getAnalysisStatus as fetchAnalysisStatus,
  getDashboard,
  getMatchExplanation,
  getSystemSources,
  getWorkspaceBoard,
  getWorkspaceCategories,
  moveMatchToReady,
  startAnalysis as startAnalysisRequest,
  updateMatchFeedback,
  uploadSupplierMatrix,
  uploadSystemSource,
  type DashboardResponse,
  type MatchExplanationResponse,
  type SystemSourcesResponse,
  type TenderCardStatus,
  type WorkspaceBoardResponse,
  type WorkspaceTender,
} from "./lib/api";
import { cn } from "./lib/cn";

type Step = 1 | 2 | 3 | 4;

type PreviewDataRow = string[];

const COLUMN_MAPPING_OPTIONS = [
  "Не использовать",
  "ID",
  "Категория",
  "Наименование",
  "Характеристики",
];

const ANALYSIS_TERMINAL_STEPS = [
  "Векторизация матрицы...",
  "Сравнение семантики...",
  "Сборка выдачи...",
];

const TOP_CATEGORY_METRICS = [
  { label: "Расходники", value: 40 },
  { label: "Платы", value: 30 },
  { label: "Прочее", value: 30 },
];

const WORKSPACE_COLUMNS: Array<{ key: TenderCardStatus; title: string }> = [
  { key: "new", title: "Новые мэтчи" },
  { key: "inProgress", title: "В работе" },
  { key: "ready", title: "Готовы к подаче" },
];

const EMPTY_WORKSPACE_BOARD: WorkspaceBoardResponse["columns"] = {
  new: [],
  inProgress: [],
  ready: [],
};

export default function App() {
  const [step, setStep] = useState<Step>(1);
  const [supplierFile, setSupplierFile] = useState<File | null>(null);
  const [supplierDraftId, setSupplierDraftId] = useState<string | null>(null);
  const [supplierRowCount, setSupplierRowCount] = useState(0);
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([]);
  const [previewData, setPreviewData] = useState<PreviewDataRow[]>([]);
  const [columnMapping, setColumnMapping] = useState<string[]>([]);
  const [analysisStatus, setAnalysisStatus] = useState(ANALYSIS_TERMINAL_STEPS[0]);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisSessionId, setAnalysisSessionId] = useState<string | null>(null);
  const [dashboardData, setDashboardData] = useState<DashboardResponse | null>(null);
  const [dynamicCategories, setDynamicCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [isCategoriesExpanded, setIsCategoriesExpanded] = useState(false);
  const [confidenceThreshold, setConfidenceThreshold] = useState(85);
  const [workspaceBoard, setWorkspaceBoard] =
    useState<WorkspaceBoardResponse["columns"]>(EMPTY_WORKSPACE_BOARD);
  const [selectedTenderIds, setSelectedTenderIds] = useState<string[]>([]);
  const [selectedTenderMatch, setSelectedTenderMatch] = useState<WorkspaceTender | null>(null);
  const [selectedTenderExplanation, setSelectedTenderExplanation] =
    useState<MatchExplanationResponse | null>(null);
  const [isExplanationLoading, setIsExplanationLoading] = useState(false);
  const [reportTender, setReportTender] = useState<WorkspaceTender | null>(null);
  const [reportText, setReportText] = useState("");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [systemSources, setSystemSources] = useState<SystemSourcesResponse>({
    tenders: null,
    okpd: null,
  });
  const [appError, setAppError] = useState<string | null>(null);
  const [isMatrixLoading, setIsMatrixLoading] = useState(false);
  const [isBoardLoading, setIsBoardLoading] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const tenderInputRef = useRef<HTMLInputElement>(null);
  const okpdInputRef = useRef<HTMLInputElement>(null);

  const isReadyForAnalysis = Boolean(supplierDraftId);

  const stepTitle = useMemo(() => {
    if (step === 1) {
      return {
        eyebrow: "Шаг 1",
        title: "Загрузка номенклатурной матрицы поставщика",
        description:
          "Загрузите ваш прайс-лист в формате CSV или Excel. База закупок и справочник ОКПД2 уже находятся внутри системы и используются позже на этапе анализа.",
      };
    }

    if (step === 2) {
      return {
        eyebrow: "Шаг 2",
        title: "Анализ в процессе",
        description:
          "Система подготавливает данные поставщика и формирует промежуточную выдачу для аналитического дашборда.",
      };
    }

    if (step === 3) {
      return {
        eyebrow: "Шаг 3",
        title: "Аналитика мэтчинга",
        description:
          "Результаты первого прохода готовы. Ниже представлен краткий управленческий срез по качеству и скорости обработки.",
      };
    }

    return {
      eyebrow: "Шаг 4",
      title: "Рабочее пространство",
      description:
        "На следующем этапе здесь разместим полноценное рабочее пространство с найденными процедурами, фильтрами и карточками тендеров.",
    };
  }, [step]);

  const collapsedCategoriesLimit = 10;

  const visibleCategories = useMemo(
    () =>
      isCategoriesExpanded
        ? dynamicCategories
        : dynamicCategories.slice(0, collapsedCategoriesLimit),
    [collapsedCategoriesLimit, dynamicCategories, isCategoriesExpanded]
  );

  const shouldShowCategoriesToggle =
    dynamicCategories.length > collapsedCategoriesLimit;

  const allWorkspaceTenders = useMemo(
    () => Object.values(workspaceBoard).flat(),
    [workspaceBoard]
  );

  const selectedInProgressTenderIds = useMemo(
    () =>
      allWorkspaceTenders
        .filter(
          (tender) =>
            selectedTenderIds.includes(tender.id) && tender.status === "inProgress"
        )
        .map((tender) => tender.id),
    [allWorkspaceTenders, selectedTenderIds]
  );

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!settingsRef.current?.contains(event.target as Node)) {
        setIsSettingsOpen(false);
      }
    };

    if (isSettingsOpen) {
      window.addEventListener("mousedown", handlePointerDown);
    }

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isSettingsOpen]);

  useEffect(() => {
    let cancelled = false;

    getSystemSources()
      .then((payload) => {
        if (!cancelled) {
          setSystemSources(payload);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSystemSources({
            tenders: null,
            okpd: null,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (dynamicCategories.length === 0) {
      setSelectedCategory("");
      setIsCategoriesExpanded(false);
      return;
    }

    if (!dynamicCategories.includes(selectedCategory)) {
      setSelectedCategory(dynamicCategories[0]);
    }
  }, [dynamicCategories, selectedCategory]);

  useEffect(() => {
    setIsCategoriesExpanded(false);
  }, [supplierFile]);

  useEffect(() => {
    if (step !== 2 || !analysisSessionId) {
      return;
    }

    let cancelled = false;
    let timeoutId: number | undefined;

    const pollAnalysis = async () => {
      try {
        const statusPayload = await fetchAnalysisStatus(analysisSessionId);

        if (cancelled) {
          return;
        }

        setAnalysisStatus(statusPayload.message);
        setAnalysisProgress(statusPayload.progress);

        if (statusPayload.status === "completed") {
          const [dashboardPayload, categoriesPayload] = await Promise.all([
            getDashboard(analysisSessionId),
            getWorkspaceCategories(analysisSessionId),
          ]);

          if (cancelled) {
            return;
          }

          setDashboardData(dashboardPayload);
          setDynamicCategories(categoriesPayload.categories);
          setStep(3);
          return;
        }

        if (statusPayload.status === "failed") {
          setAppError(statusPayload.error || "Не удалось завершить анализ.");
          setStep(1);
          return;
        }

        timeoutId = window.setTimeout(pollAnalysis, 900);
      } catch (error) {
        if (!cancelled) {
          setAppError(
            error instanceof Error
              ? error.message
              : "Не удалось получить статус анализа."
          );
          setStep(1);
        }
      }
    };

    pollAnalysis();

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [analysisSessionId, step]);

  useEffect(() => {
    if (step !== 4 || !analysisSessionId || !selectedCategory) {
      return;
    }

    let cancelled = false;
    setIsBoardLoading(true);

    getWorkspaceBoard(analysisSessionId, selectedCategory, confidenceThreshold)
      .then((payload) => {
        if (!cancelled) {
          setWorkspaceBoard(payload.columns);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setWorkspaceBoard(EMPTY_WORKSPACE_BOARD);
          setAppError(
            error instanceof Error
              ? error.message
              : "Не удалось загрузить рабочее пространство."
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsBoardLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [analysisSessionId, confidenceThreshold, selectedCategory, step]);

  const refreshWorkspaceBoard = async (category = selectedCategory) => {
    if (!analysisSessionId || !category) {
      setWorkspaceBoard(EMPTY_WORKSPACE_BOARD);
      return;
    }

    const payload = await getWorkspaceBoard(
      analysisSessionId,
      category,
      confidenceThreshold
    );
    setWorkspaceBoard(payload.columns);
  };

  const handleSupplierFileSelect = async (file: File) => {
    setIsMatrixLoading(true);
    setAppError(null);

    try {
      const previewPayload = await uploadSupplierMatrix(file);
      setSupplierFile(file);
      setSupplierDraftId(previewPayload.draftId);
      setSupplierRowCount(previewPayload.totalRows);
      setPreviewHeaders(previewPayload.headers);
      setPreviewData(previewPayload.previewRows);
      setColumnMapping(previewPayload.suggestedMapping);
      setAnalysisSessionId(null);
      setDashboardData(null);
      setDynamicCategories([]);
      setSelectedCategory("");
      setWorkspaceBoard(EMPTY_WORKSPACE_BOARD);
      setSelectedTenderIds([]);
      setSelectedTenderMatch(null);
      setSelectedTenderExplanation(null);
    } catch (error) {
      setSupplierDraftId(null);
      setSupplierRowCount(0);
      setPreviewHeaders([]);
      setPreviewData([]);
      setColumnMapping([]);
      setAppError(
        error instanceof Error
          ? error.message
          : "Не удалось обработать загруженный файл."
      );
    } finally {
      setIsMatrixLoading(false);
    }
  };

  const handleColumnMappingChange = (columnIndex: number, nextValue: string) => {
    setColumnMapping((currentMapping) =>
      currentMapping.map((currentValue, index) =>
        index === columnIndex ? nextValue : currentValue
      )
    );
  };

  const handlePreviewCellChange = (
    rowIndex: number,
    columnIndex: number,
    nextValue: string
  ) => {
    setPreviewData((currentPreviewData) =>
      currentPreviewData.map((row, currentRowIndex) =>
        currentRowIndex === rowIndex
          ? row.map((cell, currentColumnIndex) =>
              currentColumnIndex === columnIndex ? nextValue : cell
            )
          : row
      )
    );

  };

  const handleTenderFileSelect = async (file?: File) => {
    if (!file) {
      return;
    }

    try {
      const payload = await uploadSystemSource("tenders", file);
      setSystemSources((currentState) => ({
        ...currentState,
        tenders: payload,
      }));
    } catch (error) {
      setAppError(
        error instanceof Error
          ? error.message
          : "Не удалось обновить базу тендеров."
      );
    }
  };

  const handleOkpdFileSelect = async (file?: File) => {
    if (!file) {
      return;
    }

    try {
      const payload = await uploadSystemSource("okpd", file);
      setSystemSources((currentState) => ({
        ...currentState,
        okpd: payload,
      }));
    } catch (error) {
      setAppError(
        error instanceof Error
          ? error.message
          : "Не удалось обновить справочник ОКПД2."
      );
    }
  };

  const handleTenderSelection = (tenderId: string, checked: boolean) => {
    setSelectedTenderIds((currentIds) =>
      checked
        ? currentIds.includes(tenderId)
          ? currentIds
          : [...currentIds, tenderId]
        : currentIds.filter((id) => id !== tenderId)
    );
  };

  const handleCategorySelect = (category: string) => {
    setSelectedCategory(category);
  };

  const handleStartAnalysis = async () => {
    if (!supplierDraftId) {
      return;
    }

    setAppError(null);

    try {
      const payload = await startAnalysisRequest({
        draftId: supplierDraftId,
        columnMapping,
        previewData,
      });
      setAnalysisSessionId(payload.sessionId);
      setAnalysisStatus(ANALYSIS_TERMINAL_STEPS[0]);
      setAnalysisProgress(8);
      setStep(2);
    } catch (error) {
      setAppError(
        error instanceof Error
          ? error.message
          : "Не удалось запустить анализ."
      );
    }
  };

  const handleLikeToggle = async (tender: WorkspaceTender) => {
    if (!analysisSessionId) {
      return;
    }

    try {
      await updateMatchFeedback({
        sessionId: analysisSessionId,
        matchId: tender.id,
        value: tender.feedback === "like" ? null : "like",
      });
      await refreshWorkspaceBoard();
    } catch (error) {
      setAppError(
        error instanceof Error
          ? error.message
          : "Не удалось сохранить обратную связь."
      );
    }
  };

  const handleDislikeToggle = async (tender: WorkspaceTender) => {
    if (tender.feedback === "dislike") {
      if (!analysisSessionId) {
        return;
      }

      try {
        await updateMatchFeedback({
          sessionId: analysisSessionId,
          matchId: tender.id,
          value: null,
        });
        setReportTender(null);
        setReportText("");
        await refreshWorkspaceBoard();
      } catch (error) {
        setAppError(
          error instanceof Error
            ? error.message
            : "Не удалось сохранить обратную связь."
        );
      }
      return;
    }

    setReportTender(tender);
    setReportText("");
  };

  const handleSubmitReport = async () => {
    if (!reportTender || !analysisSessionId) {
      return;
    }

    try {
      await updateMatchFeedback({
        sessionId: analysisSessionId,
        matchId: reportTender.id,
        value: "dislike",
        reason: reportText,
      });
      setReportTender(null);
      setReportText("");
      await refreshWorkspaceBoard();
    } catch (error) {
      setAppError(
        error instanceof Error
          ? error.message
          : "Не удалось отправить комментарий по модели."
      );
    }
  };

  const handleOpenMatchExplanation = async (tender: WorkspaceTender) => {
    if (!analysisSessionId) {
      return;
    }

    setSelectedTenderMatch(tender);
    setSelectedTenderExplanation(null);
    setIsExplanationLoading(true);

    try {
      const payload = await getMatchExplanation(analysisSessionId, tender.id);
      setSelectedTenderExplanation(payload);
    } catch (error) {
      setAppError(
        error instanceof Error
          ? error.message
          : "Не удалось загрузить пояснение по совпадению."
      );
    } finally {
      setIsExplanationLoading(false);
    }
  };

  const handleConfirmTenderMatch = async () => {
    if (!selectedTenderMatch || !analysisSessionId) {
      return;
    }

    try {
      await confirmMatch(analysisSessionId, selectedTenderMatch.id);
      setSelectedTenderMatch(null);
      setSelectedTenderExplanation(null);
      await refreshWorkspaceBoard();
    } catch (error) {
      setAppError(
        error instanceof Error
          ? error.message
          : "Не удалось подтвердить совпадение."
      );
    }
  };

  const handleMoveToReady = async (tenderId: string) => {
    if (!analysisSessionId) {
      return;
    }

    try {
      await moveMatchToReady(analysisSessionId, tenderId);
      await refreshWorkspaceBoard();
    } catch (error) {
      setAppError(
        error instanceof Error
          ? error.message
          : "Не удалось перевести карточку в статус готовности."
      );
    }

    setSelectedTenderIds((currentIds) => currentIds.filter((id) => id !== tenderId));
  };

  const handleBulkMoveToReady = async () => {
    if (!analysisSessionId || selectedInProgressTenderIds.length === 0) {
      return;
    }

    try {
      await bulkMoveMatchesToReady(analysisSessionId, selectedInProgressTenderIds);
      setSelectedTenderIds([]);
      await refreshWorkspaceBoard();
    } catch (error) {
      setAppError(
        error instanceof Error
          ? error.message
          : "Не удалось выполнить массовое утверждение."
      );
    }
  };

  const handleExportSelected = async () => {
    if (!analysisSessionId || selectedTenderIds.length === 0) {
      return;
    }

    try {
      const blob = await exportSelectedMatches(analysisSessionId, selectedTenderIds);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = "export.csv";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      setAppError(
        error instanceof Error ? error.message : "Не удалось экспортировать выбранные карточки."
      );
    }
  };

  const handleBackNavigation = () => {
    setIsSettingsOpen(false);
    setSelectedTenderMatch(null);
    setSelectedTenderExplanation(null);
    setReportTender(null);
    setReportText("");

    if (step === 4) {
      setStep(3);
      return;
    }

    if (step === 2 || step === 3) {
      setAnalysisStatus(ANALYSIS_TERMINAL_STEPS[0]);
      setAnalysisProgress(0);
      setDashboardData(null);
      setDynamicCategories([]);
      setWorkspaceBoard(EMPTY_WORKSPACE_BOARD);
      setSelectedCategory("");
      setSelectedTenderIds([]);
      setAnalysisSessionId(null);
      setStep(1);
    }
  };

  const getColumnTenders = (status: TenderCardStatus) => {
    return workspaceBoard[status] ?? [];
  };

  return (
    <>
      <div className="min-h-screen bg-slate-50 text-text-primary">
        <header className="relative z-40 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex min-h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {step > 1 ? (
            <Button
              variant="ghost"
              leftIcon={<ArrowLeft className="h-4 w-4" />}
              onClick={handleBackNavigation}
            >
              Назад
            </Button>
          ) : (
            <div className="h-10" />
          )}

          <div className="relative z-50" ref={settingsRef}>
            <Button
              variant="ghost"
              className="h-10 w-10 shrink-0 p-0"
              aria-label="Системные настройки"
              onClick={() => setIsSettingsOpen((currentState) => !currentState)}
            >
              <Settings className="h-4 w-4" />
              <span className="sr-only">Системные настройки</span>
            </Button>

            {isSettingsOpen ? (
              <div className="absolute right-0 top-14 z-50 w-[380px] rounded-lg border border-slate-200 bg-white p-6 shadow-lg">
                <input
                  ref={tenderInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="sr-only"
                  onChange={(event) => handleTenderFileSelect(event.target.files?.[0])}
                />
                <input
                  ref={okpdInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="sr-only"
                  onChange={(event) => handleOkpdFileSelect(event.target.files?.[0])}
                />

                <div className="border-b border-slate-200 pb-4">
                  <h2 className="text-lg font-semibold text-text-primary">
                    Системные настройки
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Обновление внутренних источников данных для системного анализа.
                  </p>
                </div>

                <div className="mt-4 divide-y divide-slate-200">
                  <div className="flex items-center justify-between gap-4 py-4 first:pt-0">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-bg-surface text-primary-base">
                        <Database className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-control font-medium text-text-primary">
                          База тендеров
                        </p>
                        <p className="mt-1 whitespace-normal text-xs leading-5 text-text-secondary">
                          {systemSources.tenders?.fileName || "Данные загружены (по умолчанию)"}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      className="h-8 px-3 py-1 text-sm"
                      onClick={() => tenderInputRef.current?.click()}
                    >
                      Обновить
                    </Button>
                  </div>

                  <div className="flex items-center justify-between gap-4 py-4 last:pb-0">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-bg-surface text-primary-base">
                        <BookOpen className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-control font-medium text-text-primary">
                          Справочник ОКПД2
                        </p>
                        <p className="mt-1 whitespace-normal text-xs leading-5 text-text-secondary">
                          {systemSources.okpd?.fileName || "Данные загружены (по умолчанию)"}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      className="h-8 px-3 py-1 text-sm"
                      onClick={() => okpdInputRef.current?.click()}
                    >
                      Обновить
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {appError ? (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {appError}
          </div>
        ) : null}
        {step === 1 ? (
          <section className="flex flex-col items-center gap-8">
            <div className="mx-auto max-w-3xl text-center">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary-light px-4 py-2 text-sm font-medium text-primary-base">
                <FileSpreadsheet className="h-4 w-4" />
                {stepTitle.eyebrow}
              </div>
              <h1 className="mt-5 text-4xl font-medium tracking-tight text-text-primary sm:text-h2">
                {stepTitle.title}
              </h1>
              <p className="mt-4 text-base leading-7 text-slate-600">{stepTitle.description}</p>
            </div>

            <div className="w-full max-w-4xl">
              <FileUpload
                title="Загрузите вашу номенклатурную матрицу (CSV / Excel)"
                description="После загрузки мы покажем предварительный просмотр первых строк. Внутренняя база закупок и справочник ОКПД2 уже доступны системе отдельно."
                accept=".csv,.xlsx,.xls"
                file={supplierFile}
                onFileSelect={handleSupplierFileSelect}
                disabled={isMatrixLoading}
              />
            </div>

            {isReadyForAnalysis ? (
              <div className="w-full max-w-6xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full bg-bg-surface px-3 py-2 text-sm font-medium text-primary-base">
                      <TableProperties className="h-4 w-4" />
                      Предпросмотр матрицы
                    </div>
                    <h2 className="mt-4 text-2xl font-semibold text-text-primary">
                      Первые 5 строк загруженного файла
                    </h2>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                      Ниже показан реальный preview загруженного CSV. Ячейки можно вручную
                      скорректировать перед отправкой данных на следующий шаг.
                    </p>
                  </div>

                  <div className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" />
                    Загружено строк: {supplierRowCount}
                  </div>
                </div>

                <div className="mt-6 overflow-hidden rounded-lg border border-slate-200">
                  <div className="overflow-x-auto">
                    <table className="min-w-full border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50">
                          {previewHeaders.map((header, index) => (
                            <th
                              key={`${header}-origin-${index}`}
                              className="px-4 py-3 text-left text-sm font-medium text-text-secondary"
                            >
                              {header}
                            </th>
                          ))}
                        </tr>
                        <tr className="border-b border-slate-200 bg-bg-surface">
                          {previewHeaders.map((header, index) => (
                            <th
                              key={`${header}-mapping-${index}`}
                              className="px-3 py-3 text-left align-top"
                            >
                              <select
                                value={columnMapping[index] ?? "Не использовать"}
                                onChange={(event) =>
                                  handleColumnMappingChange(index, event.target.value)
                                }
                                className={cn(
                                  "min-h-10 w-full rounded-lg border border-border bg-white px-3 py-2 text-control font-medium text-text-primary outline-none transition-all duration-200",
                                  "hover:bg-slate-100",
                                  "focus:border-slate-300 focus:bg-white"
                                )}
                              >
                                {COLUMN_MAPPING_OPTIONS.map((option) => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewData.map((row, rowIndex) => (
                          <tr
                            key={`preview-row-${rowIndex}`}
                            className="border-b border-slate-200 last:border-b-0"
                          >
                            {previewHeaders.map((_, columnIndex) => (
                              <td key={`cell-${rowIndex}-${columnIndex}`} className="px-3 py-2">
                                <input
                                  value={row[columnIndex] ?? ""}
                                  onChange={(event) =>
                                    handlePreviewCellChange(
                                      rowIndex,
                                      columnIndex,
                                      event.target.value
                                    )
                                  }
                                  className="w-full rounded bg-transparent px-2 py-2 text-sm text-slate-700 outline-none transition-all duration-200 hover:bg-slate-50 focus:ring-1 focus:ring-primary-base"
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="mt-6 flex justify-end">
                  <div className="w-full md:w-auto">
                    <Button
                      variant="primary"
                      fullWidth
                      disabled={!isReadyForAnalysis}
                      onClick={handleStartAnalysis}
                      leftIcon={<Play className="h-4 w-4" />}
                    >
                      Запустить анализ
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        ) : step === 2 ? (
          <section>
            <div className="mx-auto mt-20 flex max-w-lg flex-col items-center justify-center rounded-lg border border-slate-200 bg-white p-12 text-center shadow-sm">
              <Loader2 className="h-12 w-12 animate-spin text-primary-base" />
              <h3 className="mt-6 text-h3 font-semibold text-text-primary">
                Анализ данных...
              </h3>
              <p className="mt-2 text-base text-text-secondary">{analysisStatus}</p>

              <div className="mt-8 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-primary-base transition-all ease-linear"
                  style={{
                    width: `${analysisProgress}%`,
                    transitionDuration: "900ms",
                  }}
                />
              </div>
            </div>
          </section>
        ) : step === 3 ? (
          <section className="flex flex-col gap-8">
            <div>
              <h2 className="mb-6 text-h3 font-semibold text-text-primary">
                Аналитика мэтчинга
              </h2>
              <p className="max-w-3xl text-base leading-7 text-text-secondary">
                Краткий срез по объему релевантных закупок, экономии времени и приоритетным
                товарным направлениям после первого прохода аналитики.
              </p>
            </div>

            <div className="grid w-full grid-cols-1 gap-6 md:grid-cols-3">
              <div className="relative z-10 flex h-full cursor-pointer flex-col gap-2 rounded-lg border border-slate-200 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-slate-300 hover:shadow-xl hover:ring-4 hover:ring-slate-100">
                <p className="text-control font-medium text-text-primary">
                  Воронка мэтчинга
                </p>
                <p className="text-h2 font-medium text-primary-base">
                  {dashboardData?.highConfidenceCount ?? 0} тендеров
                </p>
                <p className="text-sm leading-6 text-text-secondary">
                  С точностью &gt; 90%. Всего найдено {dashboardData?.totalMatches ?? 0} релевантных
                  процедур по {dashboardData?.supplierItems ?? 0} позициям матрицы.
                </p>
              </div>

              <div className="relative z-10 flex h-full cursor-pointer flex-col gap-2 rounded-lg border border-slate-200 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-slate-300 hover:shadow-xl hover:ring-4 hover:ring-slate-100">
                <p className="text-control font-medium text-text-primary">
                  Сэкономлено времени
                </p>
                <p className="text-h2 font-medium text-primary-base">
                  ~{dashboardData?.estimatedHoursSaved ?? 0} часов
                </p>
                <p className="text-sm leading-6 text-text-secondary">
                  Обработано {dashboardData?.distinctLots ?? 0} уникальных лотов. Экономия
                  времени тендерного отдела на ручной верификации.
                </p>
              </div>

              <div className="relative z-10 flex h-full cursor-pointer flex-col gap-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-slate-300 hover:shadow-xl hover:ring-4 hover:ring-slate-100">
                <p className="text-control font-medium text-text-primary">
                  Топ категорий
                </p>
                <div className="space-y-4">
                  {(dashboardData?.topCategories.length
                    ? dashboardData.topCategories
                    : TOP_CATEGORY_METRICS
                  ).map((item) => (
                    <div key={item.label} className="space-y-2">
                      <div className="flex items-center justify-between gap-4 text-sm">
                        <span className="text-text-primary">{item.label}</span>
                        <span className="text-text-secondary">{item.value}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-200">
                        <div
                          className="h-2 rounded-full bg-primary-base"
                          style={{ width: `${item.value}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-center">
              <Button variant="primary" onClick={() => setStep(4)}>
                Перейти в рабочее пространство
              </Button>
            </div>
          </section>
        ) : (
          <section className="h-[calc(100vh-120px)]">
            <div className="flex h-full gap-6">
              <aside className="flex h-full w-1/4 flex-col rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="border-b border-slate-200 pb-4">
                  <p className="text-sm font-medium text-text-secondary">Категории матрицы</p>
                  <h2 className="mt-2 text-xl font-semibold text-text-primary">
                    Рабочее пространство
                  </h2>
                </div>

                <div className="mt-4 flex min-h-0 flex-1 flex-col">
                  {dynamicCategories.length > 0 ? (
                    !isCategoriesExpanded ? (
                      <div className="flex min-h-0 flex-1 flex-col">
                        <div className="flex-1 overflow-hidden pr-2">
                          <div className="flex flex-col gap-1.5 items-stretch">
                            {visibleCategories.map((category) => (
                              <button
                                key={category}
                                type="button"
                                className={cn(
                                  "w-full text-left px-3 py-2 text-sm leading-tight whitespace-normal break-words h-auto min-h-fit rounded-md transition-colors",
                                  selectedCategory === category
                                    ? "bg-primary-light text-primary-base font-medium"
                                    : "text-text-secondary hover:bg-slate-100 hover:text-text-primary"
                                )}
                                onClick={() => handleCategorySelect(category)}
                              >
                                {category}
                              </button>
                            ))}
                          </div>
                        </div>

                        {shouldShowCategoriesToggle ? (
                          <Button
                            variant="secondary"
                            onClick={() => setIsCategoriesExpanded(true)}
                            className="w-full mt-4 shrink-0"
                          >
                            Показать еще ({dynamicCategories.length - collapsedCategoriesLimit})
                          </Button>
                        ) : null}
                      </div>
                    ) : (
                      <div className="flex min-h-0 flex-1 flex-col">
                        <div className="flex-1 overflow-y-auto pr-2">
                          <div className="flex flex-col gap-1.5 items-stretch">
                            {visibleCategories.map((category) => (
                              <button
                                key={category}
                                type="button"
                                className={cn(
                                  "w-full text-left px-3 py-2 text-sm leading-tight whitespace-normal break-words h-auto min-h-fit rounded-md transition-colors",
                                  selectedCategory === category
                                    ? "bg-primary-light text-primary-base font-medium"
                                    : "text-text-secondary hover:bg-slate-100 hover:text-text-primary"
                                )}
                                onClick={() => handleCategorySelect(category)}
                              >
                                {category}
                              </button>
                            ))}
                          </div>
                        </div>

                        {shouldShowCategoriesToggle ? (
                          <Button
                            variant="secondary"
                            onClick={() => setIsCategoriesExpanded(false)}
                            className="w-full mt-4 shrink-0"
                          >
                            Скрыть
                          </Button>
                        ) : null}
                      </div>
                    )
                  ) : (
                    <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-text-secondary">
                      Загрузка категорий...
                    </div>
                  )}
                </div>
              </aside>

              <div className="flex h-full w-3/4 flex-col rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-6 flex items-center justify-between gap-6">
                  <div className="w-full max-w-md">
                    <Slider
                      label="Минимальная уверенность ML"
                      min={0}
                      max={100}
                      value={confidenceThreshold}
                      onValueChange={setConfidenceThreshold}
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <Button
                      variant="secondary"
                      leftIcon={<Download className="h-4 w-4" />}
                      disabled={selectedTenderIds.length === 0}
                      onClick={handleExportSelected}
                    >
                      Экспорт выбранных
                    </Button>
                    <Button
                      variant="primary"
                      disabled={selectedInProgressTenderIds.length === 0}
                      onClick={handleBulkMoveToReady}
                    >
                      Утвердить выбранные
                    </Button>
                  </div>
                </div>

                {selectedCategory === "" ? (
                  <div className="flex h-[calc(100%-80px)] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 px-6 text-center text-sm text-text-secondary">
                    Загрузка категорий...
                  </div>
                ) : isBoardLoading ? (
                  <div className="flex h-[calc(100%-80px)] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 px-6 text-center text-sm text-text-secondary">
                    Обновляем рабочее пространство...
                  </div>
                ) : allWorkspaceTenders.length === 0 ? (
                  <div className="flex h-[calc(100%-80px)] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 px-6 text-center text-sm text-text-secondary">
                    Для этой категории пока нет подобранных тендеров
                  </div>
                ) : (
                  <div className="grid h-[calc(100%-80px)] grid-cols-3 gap-4">
                    {WORKSPACE_COLUMNS.map((column) => {
                      const columnTenders = getColumnTenders(column.key);

                      return (
                        <div
                          key={column.key}
                          className="flex flex-col gap-3 overflow-y-auto rounded-lg bg-slate-50 p-4"
                        >
                          <div className="flex items-center justify-between">
                            <h3 className="text-control font-medium text-text-primary">
                              {column.title}
                            </h3>
                            <span className="text-sm text-text-secondary">
                              {columnTenders.length}
                            </span>
                          </div>

                          {columnTenders.length > 0 ? (
                            columnTenders.map((tender) => {
                              const isLiked = tender.feedback === "like";
                              const isDisliked = tender.feedback === "dislike";
                              const isSelected = selectedTenderIds.includes(tender.id);
                              const isReady = tender.status === "ready";
                              const isInProgress = tender.status === "inProgress";

                              return (
                                <article
                                  key={tender.id}
                                  className="relative z-10 rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-slate-300 hover:shadow-xl hover:ring-4 hover:ring-slate-100"
                                >
                                  <div className="mb-2 flex items-start justify-between gap-3">
                                    {isReady ? (
                                      <div className="h-10 w-10 shrink-0" />
                                    ) : (
                                      <Checkbox
                                        className="min-h-0 p-0"
                                        checked={isSelected}
                                        onChange={(event) =>
                                          handleTenderSelection(
                                            tender.id,
                                            event.target.checked
                                          )
                                        }
                                      />
                                    )}
                                    <span className="rounded bg-success-bg px-2 py-1 text-xs font-bold text-success-fg">
                                      {tender.confidence}%
                                    </span>
                                  </div>

                                  <div>
                                    <p className="text-control font-medium text-text-primary">
                                      {tender.title}
                                    </p>
                                    <p className="mt-1 text-sm text-text-secondary">
                                      ОКПД2: {tender.okpd2}
                                    </p>
                                  </div>

                                  {isReady ? (
                                    <div className="mt-4 w-full rounded-md bg-success-bg/20 py-2 text-xs font-medium text-success-fg flex items-center justify-center gap-2">
                                      <CheckCircle2 className="h-4 w-4" />
                                      Ожидает подачи
                                    </div>
                                  ) : (
                                    <div className="mt-4 flex flex-col gap-2">
                                      <div className="flex gap-2">
                                        <button
                                          type="button"
                                          onClick={() => handleLikeToggle(tender)}
                                          className={cn(
                                            "flex h-9 w-9 items-center justify-center rounded-md transition-colors",
                                            isLiked
                                              ? "bg-success-bg text-success-fg hover:bg-success-bg/80"
                                              : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                          )}
                                          aria-label="Положительная обратная связь"
                                        >
                                          <ThumbsUp className="h-[18px] w-[18px]" />
                                        </button>

                                        <button
                                          type="button"
                                          onClick={() => handleDislikeToggle(tender)}
                                          className={cn(
                                            "flex h-9 w-9 items-center justify-center rounded-md transition-colors",
                                            isDisliked
                                              ? "bg-error-bg text-error-fg hover:bg-error-bg/80"
                                              : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                          )}
                                          aria-label="Отрицательная обратная связь"
                                        >
                                          <ThumbsDown className="h-[18px] w-[18px]" />
                                        </button>
                                      </div>

                                      {isInProgress ? (
                                        <Button
                                          variant="primary"
                                          className="w-full text-xs"
                                          onClick={() => handleMoveToReady(tender.id)}
                                        >
                                          Утвердить к подаче
                                        </Button>
                                      ) : (
                                        <Button
                                          variant="secondary"
                                          className="w-full text-xs"
                                          onClick={() => handleOpenMatchExplanation(tender)}
                                        >
                                          Почему это совпало?
                                        </Button>
                                      )}
                                    </div>
                                  )}
                                </article>
                              );
                            })
                          ) : (
                            <div className="rounded-lg border border-dashed border-slate-200 bg-white p-4 text-sm text-text-secondary">
                              Для этой категории пока нет подобранных тендеров
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}
        </main>
      </div>

      {selectedTenderMatch !== null ? (
        <>
          <div
            className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => {
              setSelectedTenderMatch(null);
              setSelectedTenderExplanation(null);
            }}
          />

          <div className="animate-in slide-in-from-right fixed right-0 top-0 bottom-0 z-50 flex w-[50vw] flex-col bg-white shadow-2xl duration-300">
            <div className="flex items-center justify-between border-b border-slate-200 p-6">
              <div>
                <h3 className="text-h3 font-semibold text-text-primary">
                  Детальное сравнение позиций
                </h3>
                <p className="mt-2 text-sm text-text-secondary">
                  {selectedTenderMatch.title}
                </p>
              </div>

              <Button
                variant="ghost"
                className="h-10 w-10 shrink-0 p-0"
                onClick={() => {
                  setSelectedTenderMatch(null);
                  setSelectedTenderExplanation(null);
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex flex-1 gap-8 overflow-y-auto p-6">
              <div className="w-1/2">
                <p className="mb-4 text-sm font-medium text-text-secondary">
                  Ваш товар (из матрицы)
                </p>
                <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-5 text-sm leading-7 text-text-primary">
                  {isExplanationLoading ? (
                    <div className="flex min-h-[220px] items-center justify-center text-text-secondary">
                      Загружаем пояснение модели...
                    </div>
                  ) : selectedTenderExplanation ? (
                    selectedTenderExplanation.supplierBlocks.map((block) => (
                      <div key={`supplier-${block.label}`} className="space-y-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">
                          {block.label}
                        </p>
                        <p>
                          {block.segments.map((segment, index) => (
                            <span
                              key={`${block.label}-${index}-${segment.text}`}
                              className={cn(
                                segment.kind === "match" &&
                                  "rounded bg-emerald-200 px-1 font-medium text-emerald-900",
                                segment.kind === "mismatch" &&
                                  "rounded bg-rose-200 px-1 font-medium text-rose-900"
                              )}
                            >
                              {segment.text}
                            </span>
                          ))}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-text-secondary">
                      Пояснение для этой карточки пока недоступно.
                    </p>
                  )}
                </div>
              </div>

              <div className="w-1/2">
                <p className="mb-4 text-sm font-medium text-text-secondary">
                  Требования лота
                </p>
                <div className="space-y-4 rounded-lg border border-slate-200 bg-slate-50 p-5 text-sm leading-7 text-text-primary">
                  {isExplanationLoading ? (
                    <div className="flex min-h-[220px] items-center justify-center text-text-secondary">
                      Загружаем пояснение модели...
                    </div>
                  ) : selectedTenderExplanation ? (
                    selectedTenderExplanation.lotBlocks.map((block) => (
                      <div key={`lot-${block.label}`} className="space-y-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">
                          {block.label}
                        </p>
                        <p>
                          {block.segments.map((segment, index) => (
                            <span
                              key={`${block.label}-${index}-${segment.text}`}
                              className={cn(
                                segment.kind === "match" &&
                                  "rounded bg-emerald-200 px-1 font-medium text-emerald-900",
                                segment.kind === "mismatch" &&
                                  "rounded bg-rose-200 px-1 font-medium text-rose-900"
                              )}
                            >
                              {segment.text}
                            </span>
                          ))}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-text-secondary">
                      Пояснение для этой карточки пока недоступно.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 p-6">
              <Button
                variant="secondary"
                onClick={() => {
                  setSelectedTenderMatch(null);
                  setSelectedTenderExplanation(null);
                }}
              >
                Отклонить
              </Button>
              <Button variant="primary" onClick={handleConfirmTenderMatch}>
                Подтвердить совпадение
              </Button>
            </div>
          </div>
        </>
      ) : null}

      {reportTender !== null ? (
        <>
          <div
            className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm"
            onClick={() => {
              setReportTender(null);
              setReportText("");
            }}
          />

          <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
            <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-2xl">
              <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-4">
                <div>
                  <h3 className="text-xl font-semibold text-text-primary">
                    Сообщить об ошибке модели
                  </h3>
                  <p className="mt-2 text-sm text-text-secondary">
                    {reportTender.title}
                  </p>
                </div>

                <Button
                  variant="ghost"
                  className="h-10 w-10 shrink-0 p-0"
                  onClick={() => {
                    setReportTender(null);
                    setReportText("");
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="mt-6">
                <textarea
                  value={reportText}
                  onChange={(event) => setReportText(event.target.value)}
                  placeholder="Опишите, почему этот тендер не подходит..."
                  className="min-h-[140px] w-full resize-none rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-text-primary outline-none transition-colors duration-200 placeholder:text-text-secondary hover:bg-slate-50 focus:border-slate-300 focus:bg-white"
                />
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setReportTender(null);
                    setReportText("");
                  }}
                >
                  Отмена
                </Button>
                <Button variant="primary" onClick={handleSubmitReport}>
                  Отправить заявку
                </Button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
