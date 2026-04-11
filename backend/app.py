from __future__ import annotations

import csv
import gzip
import hashlib
import io
import json
import sqlite3
import sys
import threading
import time
import uuid
import warnings
import zipfile
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

import pandas as pd
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field


PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = Path(__file__).resolve().parent
DATA_ROOT = BACKEND_ROOT / "data"
DB_PATH = DATA_ROOT / "app.db"
DRAFTS_ROOT = DATA_ROOT / "drafts"
CACHE_ROOT = DATA_ROOT / "analysis_cache"
SYSTEM_SOURCES_ROOT = DATA_ROOT / "system_sources"
ML_ZIP_PATH = PROJECT_ROOT / "hybrid_lot_matcher_package.zip"
ML_UNPACK_PARENT = PROJECT_ROOT / "_ml_unpack"
ML_PACKAGE_ROOT = ML_UNPACK_PARENT / "hybrid_lot_matcher_package"

DEFAULT_STATUS_TEXTS = (
    "Подготовка матрицы...",
    "Векторизация матрицы...",
    "Сравнение семантики...",
    "Сборка выдачи...",
)

COLUMN_MAPPING_OPTIONS = [
    "Не использовать",
    "ID",
    "Категория",
    "Наименование",
    "Характеристики",
]


def ensure_dirs() -> None:
    for path in (DATA_ROOT, DRAFTS_ROOT, CACHE_ROOT, SYSTEM_SOURCES_ROOT, ML_UNPACK_PARENT):
        path.mkdir(parents=True, exist_ok=True)


def ensure_ml_package() -> Path:
    ensure_dirs()

    if ML_PACKAGE_ROOT.exists():
        return ML_PACKAGE_ROOT

    if not ML_ZIP_PATH.exists():
        raise FileNotFoundError(
            f"ML package archive not found: {ML_ZIP_PATH}"
        )

    with zipfile.ZipFile(ML_ZIP_PATH) as archive:
        archive.extractall(ML_UNPACK_PARENT)

    if not ML_PACKAGE_ROOT.exists():
        raise FileNotFoundError(
            "ML package was unpacked, but the package root was not found."
        )

    return ML_PACKAGE_ROOT


def db_connect() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def init_db() -> None:
    ensure_dirs()

    with closing(db_connect()) as connection:
        cursor = connection.cursor()
        cursor.executescript(
            """
            CREATE TABLE IF NOT EXISTS drafts (
                id TEXT PRIMARY KEY,
                original_name TEXT NOT NULL,
                stored_path TEXT NOT NULL,
                file_hash TEXT NOT NULL,
                headers_json TEXT NOT NULL,
                total_rows INTEGER NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                draft_id TEXT NOT NULL,
                supplier_filename TEXT NOT NULL,
                cache_key TEXT NOT NULL,
                mapping_json TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                dashboard_json TEXT,
                error_text TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_sessions_cache_key ON sessions(cache_key);

            CREATE TABLE IF NOT EXISTS seller_items (
                session_id TEXT NOT NULL,
                seller_id TEXT NOT NULL,
                category TEXT NOT NULL,
                name TEXT NOT NULL,
                characteristics TEXT NOT NULL,
                PRIMARY KEY (session_id, seller_id)
            );

            CREATE INDEX IF NOT EXISTS idx_seller_items_session_category
            ON seller_items(session_id, category);

            CREATE TABLE IF NOT EXISTS matches (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                seller_id TEXT NOT NULL,
                seller_category TEXT NOT NULL,
                seller_name TEXT NOT NULL,
                pn_lot TEXT NOT NULL,
                platform_brief TEXT,
                publish_date TEXT,
                platform_number TEXT,
                lot_number TEXT,
                procedure_name TEXT,
                lot_subject TEXT,
                matched_unit_name TEXT,
                unit_okpd_code TEXT,
                seller_product_type TEXT,
                matched_product_type TEXT,
                type_relation TEXT,
                lexical_score REAL,
                semantic_score REAL,
                retrieval_score REAL,
                item_presence_score REAL,
                text_score REAL,
                overlap_bonus REAL,
                type_score REAL,
                has_expected_type_signal INTEGER,
                type_missing_penalty REAL,
                service_penalty REAL,
                final_score REAL,
                score_100 INTEGER,
                confidence_label TEXT,
                matched_terms TEXT,
                explanation_short TEXT,
                lot_rank INTEGER,
                workflow_status TEXT NOT NULL DEFAULT 'new',
                feedback TEXT,
                report_reason TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_matches_session_category_status
            ON matches(session_id, seller_category, workflow_status);

            CREATE INDEX IF NOT EXISTS idx_matches_session_score
            ON matches(session_id, score_100 DESC);

            CREATE TABLE IF NOT EXISTS system_sources (
                source_type TEXT PRIMARY KEY,
                file_name TEXT NOT NULL,
                stored_path TEXT NOT NULL,
                uploaded_at TEXT NOT NULL
            );
            """
        )
        connection.commit()


def now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S")


def file_sha256(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def detect_csv_separator(file_path: Path) -> str:
    sample = file_path.read_text(encoding="utf-8-sig", errors="ignore")
    first_line = sample.splitlines()[0] if sample else ""
    semicolon_count = first_line.count(";")
    comma_count = first_line.count(",")
    return ";" if semicolon_count >= comma_count else ","


def read_tabular_file(file_path: Path) -> pd.DataFrame:
    suffix = file_path.suffix.lower()

    if suffix in {".xlsx", ".xls"}:
        frame = pd.read_excel(file_path, dtype=str).fillna("")
    else:
        last_error: Exception | None = None
        for separator in (detect_csv_separator(file_path), ";", ","):
            try:
                frame = pd.read_csv(
                    file_path,
                    sep=separator,
                    encoding="utf-8-sig",
                    dtype=str,
                ).fillna("")
                break
            except Exception as exc:  # pragma: no cover - fallback path
                last_error = exc
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Не удалось прочитать файл: {last_error}",
            )

    frame.columns = [
        str(column).strip() if str(column).strip() else f"Колонка {index + 1}"
        for index, column in enumerate(frame.columns)
    ]
    return frame.astype(str).fillna("")


def infer_initial_mapping(headers: list[str]) -> list[str]:
    inferred: list[str] = []

    for header in headers:
        normalized_header = header.lower()

        if (
            "id" in normalized_header
            or "sku" in normalized_header
            or "артик" in normalized_header
            or "код товара" in normalized_header
        ):
            inferred.append("ID")
            continue

        if "катег" in normalized_header:
            inferred.append("Категория")
            continue

        if (
            "наимен" in normalized_header
            or "товар" in normalized_header
            or "name" in normalized_header
        ):
            inferred.append("Наименование")
            continue

        if (
            "характер" in normalized_header
            or "опис" in normalized_header
            or "spec" in normalized_header
        ):
            inferred.append("Характеристики")
            continue

        inferred.append("Не использовать")

    return inferred


def apply_preview_overrides(frame: pd.DataFrame, preview_rows: list[list[str]]) -> pd.DataFrame:
    updated = frame.copy()

    for row_index, row in enumerate(preview_rows):
        if row_index >= len(updated.index):
            break

        for column_index, value in enumerate(row):
            if column_index >= len(updated.columns):
                break
            updated.iat[row_index, column_index] = value

    return updated


def normalize_supplier_input(frame: pd.DataFrame, column_mapping: list[str]) -> pd.DataFrame:
    headers = frame.columns.tolist()

    def find_column(role: str) -> str | None:
        for index, mapping_value in enumerate(column_mapping):
            if mapping_value == role and index < len(headers):
                return headers[index]
        return None

    id_column = find_column("ID")
    category_column = find_column("Категория")
    name_column = find_column("Наименование")
    chars_column = find_column("Характеристики")

    if category_column is None or name_column is None or chars_column is None:
        raise HTTPException(
            status_code=400,
            detail="Для анализа нужно замапить колонки Категория, Наименование и Характеристики.",
        )

    normalized = pd.DataFrame(
        {
            "id": (
                frame[id_column].astype(str).str.strip()
                if id_column is not None
                else pd.Series(
                    [str(index + 1) for index in range(len(frame.index))],
                    index=frame.index,
                    dtype="string",
                )
            ),
            "Категория": frame[category_column].astype(str).str.strip(),
            "Наименование": frame[name_column].astype(str).str.strip(),
            "Характеристики": frame[chars_column].astype(str).str.strip(),
        }
    )

    normalized["id"] = normalized["id"].replace("", pd.NA).fillna(
        pd.Series(
            [str(index + 1) for index in range(len(normalized.index))],
            index=normalized.index,
            dtype="string",
        )
    )

    return normalized.fillna("")


def serialize_frame(frame: pd.DataFrame) -> list[dict[str, Any]]:
    if frame.empty:
        return []
    return json.loads(frame.to_json(orient="records", force_ascii=False))


def slugify(value: str) -> str:
    return (
        value.strip()
        .lower()
        .replace(" ", "-")
        .replace("/", "-")
        .replace("\\", "-")
    )


def build_match_id(session_id: str, row: dict[str, Any]) -> str:
    raw = "|".join(
        [
            str(row.get("seller_id", "")),
            str(row.get("pn_lot", "")),
            str(row.get("lot_rank", "")),
        ]
    )
    digest = hashlib.sha1(raw.encode("utf-8")).hexdigest()[:12]
    return f"{session_id}-{digest}"


def compute_dashboard(matches: list[dict[str, Any]], seller_rows: list[dict[str, Any]]) -> dict[str, Any]:
    total_matches = len(matches)
    supplier_items = len(seller_rows)
    distinct_lots = len({row.get("pn_lot", "") for row in matches if row.get("pn_lot")})
    high_confidence = sum(1 for row in matches if int(row.get("score_100", 0) or 0) >= 90)
    estimated_hours_saved = max(1, round((supplier_items * 0.06) + (distinct_lots * 0.18)))

    counter = Counter(str(row.get("seller_category", "")).strip() for row in matches if row.get("seller_category"))
    top_categories = counter.most_common(3)
    total_for_top = sum(value for _, value in top_categories) or 1

    return {
        "highConfidenceCount": high_confidence,
        "totalMatches": total_matches,
        "supplierItems": supplier_items,
        "distinctLots": distinct_lots,
        "estimatedHoursSaved": estimated_hours_saved,
        "topCategories": [
            {
                "label": label,
                "value": round((count / total_for_top) * 100),
            }
            for label, count in top_categories
        ],
    }


def save_cache(cache_key: str, seller_rows: list[dict[str, Any]], matches: list[dict[str, Any]], dashboard: dict[str, Any]) -> None:
    cache_path = CACHE_ROOT / f"{cache_key}.json.gz"
    payload = {
        "sellerRows": seller_rows,
        "matches": matches,
        "dashboard": dashboard,
    }
    with gzip.open(cache_path, "wt", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False)


def load_cache(cache_key: str) -> dict[str, Any] | None:
    cache_path = CACHE_ROOT / f"{cache_key}.json.gz"
    if not cache_path.exists():
        return None
    with gzip.open(cache_path, "rt", encoding="utf-8") as handle:
        return json.load(handle)


def upsert_session(session_id: str, draft_id: str, supplier_filename: str, cache_key: str, mapping: list[str], status: str) -> None:
    timestamp = now_iso()
    with closing(db_connect()) as connection:
        connection.execute(
            """
            INSERT INTO sessions (
                id, draft_id, supplier_filename, cache_key, mapping_json, status, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                session_id,
                draft_id,
                supplier_filename,
                cache_key,
                json.dumps(mapping, ensure_ascii=False),
                status,
                timestamp,
                timestamp,
            ),
        )
        connection.commit()


def update_session_status(session_id: str, status: str, dashboard: dict[str, Any] | None = None, error_text: str | None = None) -> None:
    with closing(db_connect()) as connection:
        connection.execute(
            """
            UPDATE sessions
            SET status = ?, updated_at = ?, dashboard_json = COALESCE(?, dashboard_json), error_text = ?
            WHERE id = ?
            """,
            (
                status,
                now_iso(),
                json.dumps(dashboard, ensure_ascii=False) if dashboard is not None else None,
                error_text,
                session_id,
            ),
        )
        connection.commit()


def store_session_payload(session_id: str, seller_rows: list[dict[str, Any]], matches: list[dict[str, Any]]) -> None:
    with closing(db_connect()) as connection:
        connection.execute("DELETE FROM seller_items WHERE session_id = ?", (session_id,))
        connection.execute("DELETE FROM matches WHERE session_id = ?", (session_id,))

        connection.executemany(
            """
            INSERT INTO seller_items (session_id, seller_id, category, name, characteristics)
            VALUES (?, ?, ?, ?, ?)
            """,
            [
                (
                    session_id,
                    str(row.get("id", "")),
                    str(row.get("Категория", "")),
                    str(row.get("Наименование", "")),
                    str(row.get("Характеристики", "")),
                )
                for row in seller_rows
            ],
        )

        connection.executemany(
            """
            INSERT INTO matches (
                id, session_id, seller_id, seller_category, seller_name, pn_lot, platform_brief,
                publish_date, platform_number, lot_number, procedure_name, lot_subject,
                matched_unit_name, unit_okpd_code, seller_product_type, matched_product_type,
                type_relation, lexical_score, semantic_score, retrieval_score, item_presence_score,
                text_score, overlap_bonus, type_score, has_expected_type_signal,
                type_missing_penalty, service_penalty, final_score, score_100,
                confidence_label, matched_terms, explanation_short, lot_rank, workflow_status, feedback
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', NULL)
            """,
            [
                (
                    row["id"],
                    session_id,
                    str(row.get("seller_id", "")),
                    str(row.get("seller_category", "")),
                    str(row.get("seller_name", "")),
                    str(row.get("pn_lot", "")),
                    str(row.get("platform_brief", "")),
                    str(row.get("publish_date", "")),
                    str(row.get("platform_number", "")),
                    str(row.get("lot_number", "")),
                    str(row.get("procedure_name", "")),
                    str(row.get("lot_subject", "")),
                    str(row.get("matched_unit_name", "")),
                    str(row.get("unit_okpd_code", "")),
                    str(row.get("seller_product_type", "")),
                    str(row.get("matched_product_type", "")),
                    str(row.get("type_relation", "")),
                    float(row.get("lexical_score", 0.0) or 0.0),
                    float(row.get("semantic_score", 0.0) or 0.0),
                    float(row.get("retrieval_score", 0.0) or 0.0),
                    float(row.get("item_presence_score", 0.0) or 0.0),
                    float(row.get("text_score", 0.0) or 0.0),
                    float(row.get("overlap_bonus", 0.0) or 0.0),
                    float(row.get("type_score", 0.0) or 0.0),
                    1 if bool(row.get("has_expected_type_signal", False)) else 0,
                    float(row.get("type_missing_penalty", 0.0) or 0.0),
                    float(row.get("service_penalty", 0.0) or 0.0),
                    float(row.get("final_score", 0.0) or 0.0),
                    int(row.get("score_100", 0) or 0),
                    str(row.get("confidence", "")),
                    str(row.get("matched_terms", "")),
                    str(row.get("explanation_short", "")),
                    int(row.get("lot_rank", 0) or 0),
                )
                for row in matches
            ],
        )
        connection.commit()


@dataclass
class JobState:
    session_id: str
    status: Literal["queued", "running", "completed", "failed"]
    started_at: float
    message: str
    error: str | None = None


class MatcherRuntime:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._matcher: Any | None = None

    def get(self) -> Any:
        with self._lock:
            if self._matcher is None:
                package_root = ensure_ml_package()

                if str(package_root) not in sys.path:
                    sys.path.insert(0, str(package_root))

                try:
                    from sklearn.base import InconsistentVersionWarning

                    warnings.filterwarnings("ignore", category=InconsistentVersionWarning)
                except Exception:  # pragma: no cover - sklearn import fallback
                    pass

                from hybrid_matcher_runtime import HybridLotMatcher

                self._matcher = HybridLotMatcher(package_root)

            return self._matcher


matcher_runtime = MatcherRuntime()
analysis_executor = ThreadPoolExecutor(max_workers=1)
analysis_jobs: dict[str, JobState] = {}
analysis_jobs_lock = threading.Lock()


def set_job_state(session_id: str, status: Literal["queued", "running", "completed", "failed"], message: str, error: str | None = None) -> None:
    with analysis_jobs_lock:
        current_state = analysis_jobs.get(session_id)
        analysis_jobs[session_id] = JobState(
            session_id=session_id,
            status=status,
            started_at=current_state.started_at if current_state else time.time(),
            message=message,
            error=error,
        )


def get_job_state(session_id: str) -> JobState | None:
    with analysis_jobs_lock:
        return analysis_jobs.get(session_id)


def compute_runtime_progress(session_id: str) -> tuple[int, str]:
    job_state = get_job_state(session_id)

    if job_state is None:
        return 0, DEFAULT_STATUS_TEXTS[0]

    if job_state.status == "completed":
        return 100, "Анализ завершен"

    if job_state.status == "failed":
        return 0, job_state.error or "Ошибка анализа"

    elapsed = time.time() - job_state.started_at

    if elapsed < 1.2:
        return 24, DEFAULT_STATUS_TEXTS[0]
    if elapsed < 2.4:
        return 52, DEFAULT_STATUS_TEXTS[1]
    if elapsed < 3.4:
        return 78, DEFAULT_STATUS_TEXTS[2]
    return 92, DEFAULT_STATUS_TEXTS[3]


def fetch_draft(draft_id: str) -> sqlite3.Row:
    with closing(db_connect()) as connection:
        row = connection.execute(
            "SELECT * FROM drafts WHERE id = ?",
            (draft_id,),
        ).fetchone()

    if row is None:
        raise HTTPException(status_code=404, detail="Загруженный файл не найден.")

    return row


def persist_system_source(source_type: str, file_name: str, stored_path: Path) -> dict[str, str]:
    timestamp = now_iso()
    with closing(db_connect()) as connection:
        connection.execute(
            """
            INSERT INTO system_sources (source_type, file_name, stored_path, uploaded_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(source_type) DO UPDATE SET
                file_name = excluded.file_name,
                stored_path = excluded.stored_path,
                uploaded_at = excluded.uploaded_at
            """,
            (source_type, file_name, str(stored_path), timestamp),
        )
        connection.commit()

    return {
        "fileName": file_name,
        "uploadedAt": timestamp,
    }


def get_system_sources_payload() -> dict[str, Any]:
    sources = {"tenders": None, "okpd": None}
    with closing(db_connect()) as connection:
        rows = connection.execute(
            "SELECT source_type, file_name, uploaded_at FROM system_sources"
        ).fetchall()

    for row in rows:
        sources[row["source_type"]] = {
            "fileName": row["file_name"],
            "uploadedAt": row["uploaded_at"],
        }

    return sources


def build_highlight_segments(text: str, matched_terms: list[str], mismatched_terms: list[str]) -> list[dict[str, str]]:
    if not text:
        return []

    normalized_terms = [term for term in matched_terms if term]
    normalized_mismatches = [term for term in mismatched_terms if term]
    lower_text = text.lower()

    markers: list[tuple[int, int, str]] = []

    for term in normalized_terms:
        start = lower_text.find(term.lower())
        if start >= 0:
            markers.append((start, start + len(term), "match"))

    for term in normalized_mismatches:
        start = lower_text.find(term.lower())
        if start >= 0:
            markers.append((start, start + len(term), "mismatch"))

    markers.sort(key=lambda item: item[0])

    if not markers:
        return [{"text": text, "kind": "plain"}]

    segments: list[dict[str, str]] = []
    cursor = 0

    for start, end, kind in markers:
        if start < cursor:
            continue
        if start > cursor:
            segments.append({"text": text[cursor:start], "kind": "plain"})
        segments.append({"text": text[start:end], "kind": kind})
        cursor = end

    if cursor < len(text):
        segments.append({"text": text[cursor:], "kind": "plain"})

    return segments


def build_workspace_item(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "title": row["lot_subject"] or row["procedure_name"] or row["matched_unit_name"],
        "okpd2": row["unit_okpd_code"] or "",
        "confidence": int(row["score_100"] or 0),
        "category": row["seller_category"],
        "status": row["workflow_status"],
        "feedback": row["feedback"],
        "sellerId": row["seller_id"],
        "sellerName": row["seller_name"],
        "pnLot": row["pn_lot"],
        "lotSubject": row["lot_subject"] or "",
        "matchedUnitName": row["matched_unit_name"] or "",
        "procedureName": row["procedure_name"] or "",
        "explanationShort": row["explanation_short"] or "",
    }


def fetch_matches_for_category(session_id: str, category: str, min_confidence: int) -> dict[str, list[dict[str, Any]]]:
    with closing(db_connect()) as connection:
        rows = connection.execute(
            """
            SELECT *
            FROM matches
            WHERE session_id = ?
              AND seller_category = ?
              AND score_100 >= ?
            """,
            (session_id, category, min_confidence),
        ).fetchall()

    grouped: dict[str, list[sqlite3.Row]] = {"new": [], "inProgress": [], "ready": []}
    for row in rows:
        grouped[row["workflow_status"]].append(row)

    response: dict[str, list[dict[str, Any]]] = {}
    for status, items in grouped.items():
        sorted_items = sorted(
            items,
            key=lambda item: (
                0 if item["feedback"] == "like" else 1,
                -int(item["score_100"] or 0),
            ),
        )
        if status == "new":
            sorted_items = sorted_items[:3]
        response[status] = [build_workspace_item(item) for item in sorted_items]

    return response


def run_analysis_job(session_id: str, draft_id: str, column_mapping: list[str], preview_rows: list[list[str]], cache_key: str) -> None:
    try:
        set_job_state(session_id, "running", DEFAULT_STATUS_TEXTS[0])
        draft = fetch_draft(draft_id)
        cache_payload = load_cache(cache_key)

        if cache_payload is None:
            raw_frame = read_tabular_file(Path(draft["stored_path"]))
            overridden = apply_preview_overrides(raw_frame, preview_rows)
            normalized = normalize_supplier_input(overridden, column_mapping)
            matcher = matcher_runtime.get()
            result_frame = matcher.predict(normalized, top_lots=3)
            seller_rows = serialize_frame(normalized)
            raw_matches = serialize_frame(result_frame)
            matches = []
            for row in raw_matches:
                row["id"] = build_match_id(session_id, row)
                matches.append(row)
            dashboard = compute_dashboard(matches, seller_rows)
            save_cache(cache_key, seller_rows, matches, dashboard)
        else:
            seller_rows = cache_payload["sellerRows"]
            matches = cache_payload["matches"]
            dashboard = cache_payload["dashboard"]
            for row in matches:
                row["id"] = build_match_id(session_id, row)

        store_session_payload(session_id, seller_rows, matches)
        update_session_status(session_id, "completed", dashboard=dashboard)
        set_job_state(session_id, "completed", "Анализ завершен")
    except Exception as exc:  # pragma: no cover - runtime error path
        update_session_status(session_id, "failed", error_text=str(exc))
        set_job_state(session_id, "failed", "Ошибка анализа", error=str(exc))


class StartAnalysisRequest(BaseModel):
    draftId: str
    columnMapping: list[str]
    previewData: list[list[str]] = Field(default_factory=list)


class FeedbackRequest(BaseModel):
    value: Literal["like", "dislike"] | None
    reason: str | None = None


class BulkReadyRequest(BaseModel):
    ids: list[str]


class ExportRequest(BaseModel):
    ids: list[str]


app = FastAPI(title="RLT Tender Matching Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:4173",
        "http://localhost:4173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    init_db()


@app.get("/api/health")
def healthcheck() -> dict[str, Any]:
    return {
        "status": "ok",
        "packageReady": ML_ZIP_PATH.exists() or ML_PACKAGE_ROOT.exists(),
    }


@app.get("/api/system/sources")
def get_system_sources() -> dict[str, Any]:
    return get_system_sources_payload()


@app.post("/api/system/sources/{source_type}")
async def upload_system_source(
    source_type: Literal["tenders", "okpd"],
    file: UploadFile = File(...),
) -> dict[str, Any]:
    ensure_dirs()
    content = await file.read()

    if not content:
        raise HTTPException(status_code=400, detail="Файл пустой.")

    suffix = Path(file.filename or "").suffix or ".bin"
    stored_path = SYSTEM_SOURCES_ROOT / f"{source_type}-{uuid.uuid4().hex}{suffix}"
    stored_path.write_bytes(content)

    return persist_system_source(source_type, file.filename or stored_path.name, stored_path)


@app.post("/api/matrix/preview")
async def preview_matrix(file: UploadFile = File(...)) -> dict[str, Any]:
    ensure_dirs()
    content = await file.read()

    if not content:
        raise HTTPException(status_code=400, detail="Файл пустой.")

    draft_id = uuid.uuid4().hex
    suffix = Path(file.filename or "").suffix or ".csv"
    stored_path = DRAFTS_ROOT / f"{draft_id}{suffix}"
    stored_path.write_bytes(content)

    frame = read_tabular_file(stored_path)
    headers = frame.columns.tolist()
    preview_rows = frame.head(5).fillna("").values.tolist()
    suggested_mapping = infer_initial_mapping(headers)

    with closing(db_connect()) as connection:
        connection.execute(
            """
            INSERT INTO drafts (id, original_name, stored_path, file_hash, headers_json, total_rows, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                draft_id,
                file.filename or stored_path.name,
                str(stored_path),
                file_sha256(content),
                json.dumps(headers, ensure_ascii=False),
                int(len(frame.index)),
                now_iso(),
            ),
        )
        connection.commit()

    return {
        "draftId": draft_id,
        "fileName": file.filename or stored_path.name,
        "headers": headers,
        "previewRows": preview_rows,
        "suggestedMapping": suggested_mapping,
        "totalRows": int(len(frame.index)),
    }


@app.post("/api/analysis/start")
def start_analysis(payload: StartAnalysisRequest) -> dict[str, Any]:
    draft = fetch_draft(payload.draftId)
    cache_key = hashlib.sha256(
        json.dumps(
            {
                "fileHash": draft["file_hash"],
                "mapping": payload.columnMapping,
                "preview": payload.previewData,
            },
            ensure_ascii=False,
            sort_keys=True,
        ).encode("utf-8")
    ).hexdigest()

    session_id = uuid.uuid4().hex
    upsert_session(
        session_id=session_id,
        draft_id=payload.draftId,
        supplier_filename=draft["original_name"],
        cache_key=cache_key,
        mapping=payload.columnMapping,
        status="queued",
    )
    set_job_state(session_id, "queued", DEFAULT_STATUS_TEXTS[0])

    analysis_executor.submit(
        run_analysis_job,
        session_id,
        payload.draftId,
        payload.columnMapping,
        payload.previewData,
        cache_key,
    )

    return {
        "sessionId": session_id,
        "status": "queued",
    }


@app.get("/api/analysis/{session_id}/status")
def get_analysis_status(session_id: str) -> dict[str, Any]:
    with closing(db_connect()) as connection:
        session_row = connection.execute(
            "SELECT status, error_text FROM sessions WHERE id = ?",
            (session_id,),
        ).fetchone()

    if session_row is None:
        raise HTTPException(status_code=404, detail="Сессия анализа не найдена.")

    status = session_row["status"]
    progress, message = compute_runtime_progress(session_id)
    error_text = session_row["error_text"]

    if status == "completed":
        progress = 100
        message = "Анализ завершен"
    elif status == "failed":
        progress = 0
        message = error_text or "Ошибка анализа"

    return {
        "sessionId": session_id,
        "status": status,
        "progress": progress,
        "message": message,
        "error": error_text,
    }


@app.get("/api/analysis/{session_id}/dashboard")
def get_dashboard(session_id: str) -> dict[str, Any]:
    with closing(db_connect()) as connection:
        session_row = connection.execute(
            "SELECT dashboard_json, status FROM sessions WHERE id = ?",
            (session_id,),
        ).fetchone()

    if session_row is None:
        raise HTTPException(status_code=404, detail="Сессия анализа не найдена.")

    if session_row["status"] != "completed":
        raise HTTPException(status_code=409, detail="Анализ еще не завершен.")

    return json.loads(session_row["dashboard_json"] or "{}")


@app.get("/api/workspace/{session_id}/categories")
def get_workspace_categories(session_id: str) -> dict[str, Any]:
    with closing(db_connect()) as connection:
        rows = connection.execute(
            """
            SELECT DISTINCT category
            FROM seller_items
            WHERE session_id = ?
              AND category <> ''
            ORDER BY category COLLATE NOCASE
            """,
            (session_id,),
        ).fetchall()

    return {
        "categories": [row["category"] for row in rows],
    }


@app.get("/api/workspace/{session_id}/board")
def get_workspace_board(session_id: str, category: str, confidence: int = 0) -> dict[str, Any]:
    columns = fetch_matches_for_category(session_id, category, confidence)
    return {
        "category": category,
        "columns": columns,
    }


@app.post("/api/workspace/{session_id}/matches/{match_id}/confirm")
def confirm_match(session_id: str, match_id: str) -> dict[str, Any]:
    with closing(db_connect()) as connection:
        connection.execute(
            """
            UPDATE matches
            SET workflow_status = 'inProgress'
            WHERE session_id = ?
              AND id = ?
              AND workflow_status = 'new'
            """,
            (session_id, match_id),
        )
        connection.commit()

    return {"ok": True}


@app.post("/api/workspace/{session_id}/matches/{match_id}/ready")
def move_match_to_ready(session_id: str, match_id: str) -> dict[str, Any]:
    with closing(db_connect()) as connection:
        connection.execute(
            """
            UPDATE matches
            SET workflow_status = 'ready'
            WHERE session_id = ?
              AND id = ?
              AND workflow_status = 'inProgress'
            """,
            (session_id, match_id),
        )
        connection.commit()

    return {"ok": True}


@app.post("/api/workspace/{session_id}/matches/bulk-ready")
def bulk_move_matches_to_ready(session_id: str, payload: BulkReadyRequest) -> dict[str, Any]:
    if not payload.ids:
        return {"updated": 0}

    placeholders = ",".join("?" for _ in payload.ids)
    with closing(db_connect()) as connection:
        cursor = connection.execute(
            f"""
            UPDATE matches
            SET workflow_status = 'ready'
            WHERE session_id = ?
              AND workflow_status = 'inProgress'
              AND id IN ({placeholders})
            """,
            (session_id, *payload.ids),
        )
        connection.commit()

    return {"updated": cursor.rowcount}


@app.post("/api/workspace/{session_id}/matches/{match_id}/feedback")
def update_match_feedback(session_id: str, match_id: str, payload: FeedbackRequest) -> dict[str, Any]:
    with closing(db_connect()) as connection:
        connection.execute(
            """
            UPDATE matches
            SET feedback = ?, report_reason = ?
            WHERE session_id = ?
              AND id = ?
            """,
            (payload.value, payload.reason, session_id, match_id),
        )
        connection.commit()

    return {"ok": True}


@app.get("/api/workspace/{session_id}/matches/{match_id}/explain")
def explain_match(session_id: str, match_id: str) -> dict[str, Any]:
    with closing(db_connect()) as connection:
        match_row = connection.execute(
            """
            SELECT *
            FROM matches
            WHERE session_id = ? AND id = ?
            """,
            (session_id, match_id),
        ).fetchone()

        seller_row = connection.execute(
            """
            SELECT *
            FROM seller_items
            WHERE session_id = ? AND seller_id = ?
            """,
            (session_id, match_row["seller_id"] if match_row else ""),
        ).fetchone()

    if match_row is None or seller_row is None:
        raise HTTPException(status_code=404, detail="Пояснение по совпадению не найдено.")

    matched_terms = [
        term.strip()
        for term in str(match_row["matched_terms"] or "").split(",")
        if term.strip()
    ]

    mismatched_terms: list[str] = []
    if str(match_row["type_relation"] or "") == "mismatch":
        mismatched_terms.extend(
            [
                str(match_row["seller_product_type"] or "").strip(),
                str(match_row["matched_product_type"] or "").strip(),
            ]
        )

    supplier_blocks = [
        {
            "label": "Наименование",
            "segments": build_highlight_segments(seller_row["name"], matched_terms, mismatched_terms),
        },
        {
            "label": "Категория",
            "segments": build_highlight_segments(seller_row["category"], matched_terms, mismatched_terms),
        },
        {
            "label": "Характеристики",
            "segments": build_highlight_segments(seller_row["characteristics"], matched_terms, mismatched_terms),
        },
    ]

    lot_blocks = [
        {
            "label": "Предмет лота",
            "segments": build_highlight_segments(str(match_row["lot_subject"] or ""), matched_terms, mismatched_terms),
        },
        {
            "label": "Позиция в лоте",
            "segments": build_highlight_segments(str(match_row["matched_unit_name"] or ""), matched_terms, mismatched_terms),
        },
        {
            "label": "Пояснение модели",
            "segments": build_highlight_segments(str(match_row["explanation_short"] or ""), matched_terms, mismatched_terms),
        },
    ]

    return {
        "title": match_row["lot_subject"] or match_row["procedure_name"] or "Совпадение",
        "supplierTitle": seller_row["name"],
        "lotTitle": match_row["lot_subject"] or match_row["procedure_name"] or "",
        "matchedTerms": matched_terms,
        "supplierBlocks": supplier_blocks,
        "lotBlocks": lot_blocks,
    }


@app.post("/api/workspace/{session_id}/export")
def export_selected_matches(session_id: str, payload: ExportRequest) -> StreamingResponse:
    if not payload.ids:
        raise HTTPException(status_code=400, detail="Нет выбранных карточек для экспорта.")

    placeholders = ",".join("?" for _ in payload.ids)

    with closing(db_connect()) as connection:
        rows = connection.execute(
            f"""
            SELECT lot_subject, unit_okpd_code, score_100
            FROM matches
            WHERE session_id = ?
              AND id IN ({placeholders})
            ORDER BY score_100 DESC
            """,
            (session_id, *payload.ids),
        ).fetchall()

    output = io.StringIO()
    output.write("\ufeff")
    writer = csv.writer(output)
    writer.writerow(["Название", "ОКПД2", "Уверенность ML"])
    for row in rows:
        writer.writerow([row["lot_subject"], row["unit_okpd_code"], row["score_100"]])

    content = output.getvalue().encode("utf-8")

    return StreamingResponse(
        io.BytesIO(content),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": 'attachment; filename="export.csv"',
        },
    )
