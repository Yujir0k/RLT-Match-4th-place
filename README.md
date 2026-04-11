# Matching Analytics

Веб-прототип B2B-сервиса для подбора закупочных процедур под номенклатурную матрицу поставщика.

Проект состоит из двух частей:
- `frontend` на `React + Vite + Tailwind CSS`
- `backend` на `FastAPI`, который поднимает локальный ML runtime из пакета `hybrid_lot_matcher_package.zip`
- `notebooks/ml` с Jupyter notebooks по ML-составляющей проекта

## Что реализовано

### Frontend
- шаг 1: загрузка номенклатурной матрицы поставщика
- реальный preview первых строк загруженного файла
- ручной маппинг колонок `ID / Категория / Наименование / Характеристики`
- шаг 2: экран ожидания анализа с прогрессом и polling статуса backend
- шаг 3: executive dashboard с метриками по результатам анализа
- шаг 4: рабочее пространство с товарами поставщика, канбан-доской и карточками тендеров
- top-3 релевантных `pn_lot` для каждого товара из загруженной матрицы
- drawer "Почему это совпало?" с explainable diff view
- feedback по карточкам: like / dislike / report
- массовые действия: экспорт и перевод карточек в статус "Готовы к подаче"

### Backend
- загрузка матрицы поставщика через API
- чтение `csv/xlsx`
- сохранение черновиков загрузки
- запуск локального ML runtime из пакета `hybrid_lot_matcher_package`
- polling статуса анализа
- кеширование результатов по хэшу файла + mapping, чтобы повторные запуски были быстрее
- хранение результатов, workflow-статусов и feedback в `SQLite`
- API для dashboard, workspace, explain drawer, feedback, bulk actions, export
- системные источники: загрузка базы закупок и справочника ОКПД2

### ML notebooks
- `notebooks/ml/00_ml_package_overview.ipynb` — обзор ML-пакета, manifest и зависимости
- `notebooks/ml/01_hybrid_matcher_runtime.ipynb` — runtime-код `HybridLotMatcher`
- `notebooks/ml/02_ml_baseline_full_source.ipynb` — baseline-код: нормализация, признаки, retrieval, scoring
- `notebooks/ml/03_batch_prediction.ipynb` — CLI и Python API для пакетного прогноза
- `notebooks/ml/04_model_config_and_examples.ipynb` — конфиг модели и примеры CSV

## Архитектура

```text
React UI
  -> /api/*
FastAPI backend
  -> SQLite (sessions, matches, feedback, workflow)
  -> hybrid_lot_matcher_package.zip
      -> runtime bundle
      -> vectorizers
      -> embeddings
      -> prepared procurement base
```

## Структура проекта

```text
src/                 frontend
notebooks/ml/        Jupyter notebooks с ML-кодом
backend/             FastAPI backend
backend/data/        локальная БД и runtime-данные
```

## Важное ограничение по ML-пакету

В репозиторий **не включены** тяжелые локальные артефакты:
- `hybrid_lot_matcher_package.zip`
- `_ml_unpack/`
- большие CSV-выгрузки

Это сделано из-за лимитов GitHub на размер файлов.

Для полного запуска нужно вручную положить архив:

```text
hybrid_lot_matcher_package.zip
```

в корень проекта рядом с `package.json`.

Backend сам распакует архив при первом старте.

## Требования

- Node.js 20+
- Python 3.11+ или совместимая версия
- `pip`

## Установка

### 1. Frontend

```bash
npm install
```

### 2. Backend

```bash
python3 -m pip install -r backend/requirements.txt
```

## Запуск

### 1. Поднять backend

```bash
npm run dev:backend
```

Backend стартует на:

```text
http://127.0.0.1:8000
```

### 2. Поднять frontend

В отдельном терминале:

```bash
npm run dev
```

Frontend стартует на:

```text
http://localhost:4173
```

Vite уже проксирует запросы `/api` на backend.

## Основные backend-ручки

- `POST /api/matrix/preview`
- `POST /api/analysis/start`
- `GET /api/analysis/{sessionId}/status`
- `GET /api/analysis/{sessionId}/dashboard`
- `GET /api/workspace/{sessionId}/products`
- `GET /api/workspace/{sessionId}/board`
- `POST /api/workspace/{sessionId}/matches/{matchId}/confirm`
- `POST /api/workspace/{sessionId}/matches/{matchId}/ready`
- `POST /api/workspace/{sessionId}/matches/bulk-ready`
- `POST /api/workspace/{sessionId}/matches/{matchId}/feedback`
- `GET /api/workspace/{sessionId}/matches/{matchId}/explain`
- `POST /api/workspace/{sessionId}/export`
- `GET /api/system/sources`
- `POST /api/system/sources/tenders`
- `POST /api/system/sources/okpd`

## Где хранятся данные

Локальные runtime-данные backend:

```text
backend/data/
```

Там лежат:
- `app.db` — SQLite база
- `drafts/` — загруженные матрицы поставщиков
- `analysis_cache/` — кеш рассчитанных результатов
- `system_sources/` — загруженные системные источники

## Почему поиск работает быстрее при повторных загрузках

Сделано два уровня ускорения:
- ML runtime использует уже заранее собранный индекс закупок из пакета
- backend кеширует результаты анализа по хэшу исходного файла и пользовательскому mapping

То есть одна и та же матрица при повторной загрузке не прогоняется через matching заново.

## Проверка

Frontend:

```bash
npm run build
```

Backend:

```bash
python3 -m py_compile backend/app.py
```

## Статус

Прототип готов для локальной демонстрации и дальнейшей доработки API-контрактов под production.
