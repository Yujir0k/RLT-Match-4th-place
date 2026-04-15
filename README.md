<!-- README_TOP_CARDS_START -->
<div align="center">

## RLT Match - 4th Place Solution

[![Frontend](https://img.shields.io/badge/Frontend-React%20%2B%20TypeScript-61DAFB?style=for-the-badge&logo=react&logoColor=111111)](#)
[![Build](https://img.shields.io/badge/Build-Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)](#)
[![UI](https://img.shields.io/badge/UI-Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](#)
[![Backend](https://img.shields.io/badge/Backend-FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)](#)
[![ML](https://img.shields.io/badge/ML-Pandas%20%7C%20Hybrid_Matching-1F6FEB?style=for-the-badge)](#)
[![Runtime](https://img.shields.io/badge/Runtime-Python-3776AB?style=for-the-badge&logo=python&logoColor=white)](#)

</div>

<table>
  <tr>
    <td align="center" width="33%"><b>Frontend</b><br/>React + TypeScript + Vite + Tailwind CSS</td>
    <td align="center" width="33%"><b>Backend</b><br/>FastAPI + local SQLite + batch processing</td>
    <td align="center" width="33%"><b>ML Layer</b><br/>Hybrid lot matching runtime + notebooks</td>
  </tr>
</table>

### Ссылки для быстрого доступа:

- [Project Demo Video](#демо)
- [Frontend App](src/App.tsx)
- [Frontend API Client](src/lib/api.ts)
- [Backend API](backend/app.py)
- [Backend Dependencies](backend/requirements.txt)
- [ML Notebooks Overview](notebooks/ml/README.md)
- [Hybrid Runtime Notebook](notebooks/ml/01_hybrid_matcher_runtime.ipynb)
- [Batch Prediction Notebook](notebooks/ml/03_batch_prediction.ipynb)

---
<!-- README_TOP_CARDS_END -->

# RLT Match

Интеллектуальный B2B-сервис для поиска закупочных процедур, ассоциированных с номенклатурной матрицей поставщика.

Проект разработан в рамках интенсива от компании **Росэлторг**. Рабочий прототип был собран за **5 часов командной работы**: от постановки бизнес-задачи и проектирования пользовательского сценария до frontend-интерфейса, backend API, локальной ML-интеграции и демонстрационного workflow.

По итогам интенсива наша команда R² negative заняла **4 место** с этим решением.

## Бизнес-задача

Поставщики, селлеры маркетплейсов и представители интернет-магазинов часто имеют большую номенклатурную матрицу: сотни или тысячи товаров с категориями, характеристиками и внутренними идентификаторами.

Чтобы найти подходящие закупочные процедуры, специалисту приходится вручную:
- просматривать большой массив закупок;
- искать релевантные лоты по наименованиям и характеристикам;
- сопоставлять товары поставщика с позициями внутри лотов;
- проверять ОКПД2 и признаки соответствия;
- собирать результаты для дальнейшей подачи.

Это занимает много времени и плохо масштабируется.

Наш сервис решает эту задачу: поставщик загружает свою матрицу, а система локально анализирует ее и показывает для каждого товара top-3 наиболее релевантных `PN lot` из внутренней базы закупок.

## Что делает сервис

Пользователь загружает номенклатурную матрицу в формате `CSV` или `Excel`. Система показывает preview файла, предлагает маппинг колонок и после запуска анализа подбирает закупочные лоты под каждый товар.

В результате пользователь получает:
- список товаров из своей матрицы;
- для каждого товара top-3 релевантных `PN lot`;
- название лота;
- подходящую позицию внутри лота;
- код ОКПД2;
- уверенность модели;
- объяснение, почему лот был подобран;
- возможность подтвердить, отклонить, отправить feedback и экспортировать результат.

## Демо

### Видео демонстрации


https://github.com/user-attachments/assets/eebb3c3b-eb06-4828-a492-c3383de11a58


### Скриншоты основных экранов

#### 1. Загрузка номенклатурной матрицы

<img width="1280" height="756" alt="photo_7_2026-04-15_21-32-22" src="https://github.com/user-attachments/assets/c84dc665-bf2d-472a-9178-c5d8501018de" />

<img width="1280" height="758" alt="photo_6_2026-04-15_21-32-22" src="https://github.com/user-attachments/assets/b6858af3-8566-4133-9354-973328d93937" />


#### 2. Аналитика мэтчинга

<img width="1280" height="753" alt="photo_5_2026-04-15_21-32-22" src="https://github.com/user-attachments/assets/f9b398f2-7f7a-461e-9b1e-15322ebe6134" />


#### 3. Рабочее пространство

<img width="1280" height="759" alt="photo_4_2026-04-15_21-32-22" src="https://github.com/user-attachments/assets/331d8ef8-d8dd-4ac9-a608-4453e91a372d" />

<img width="1280" height="1109" alt="photo_2_2026-04-15_21-32-22" src="https://github.com/user-attachments/assets/bb85062a-ca29-42fe-8802-fa754e73e571" />

<img width="1280" height="1097" alt="photo_1_2026-04-15_21-32-22" src="https://github.com/user-attachments/assets/8433de24-251c-48c9-befc-1831ccade70e" />


#### 4. Explainable AI / Diff View

<img width="1280" height="757" alt="photo_3_2026-04-15_21-32-22" src="https://github.com/user-attachments/assets/cff2af07-be80-42e5-9616-b4665e9dc740" />


## Реализованный пользовательский сценарий

### Шаг 1. Загрузка матрицы поставщика

На первом экране пользователь загружает файл с номенклатурой.

Реализовано:
- drag-and-drop зона загрузки;
- поддержка `CSV` и `Excel`;
- preview первых строк файла;
- редактирование ячеек прямо в интерфейсе;
- маппинг колонок `ID / Категория / Наименование / Характеристики`;
- системные настройки для обновления базы закупок и справочника ОКПД2.

### Шаг 2. Анализ данных

После запуска анализа frontend показывает транзитный экран ожидания.

Backend в это время:
- получает draft загруженного файла;
- нормализует данные;
- запускает локальный ML runtime;
- сохраняет результаты анализа;
- отдает статус выполнения через polling.

### Шаг 3. Аналитика мэтчинга

После завершения анализа пользователь видит executive dashboard.

Метрики считаются по реальным результатам анализа:
- общее количество найденных совпадений;
- количество уникальных `PN lot`;
- покрытие товаров из матрицы;
- топ категорий по найденным совпадениям.

### Шаг 4. Рабочее пространство

Главная рабочая зона построена как action hub.

Слева отображаются товары из загруженной матрицы. При выборе товара справа показывается:
- исходный запрос продавца;
- карточки top-3 релевантных лотов;
- `PN lot`;
- название лота;
- подходящая позиция внутри лота;
- ОКПД2;
- уверенность ML.

Карточки организованы в канбан:
- `Новые мэтчи`;
- `В работе`;
- `Готовы к подаче`.

Поддерживаются:
- подтверждение совпадения;
- перевод в работу;
- утверждение к подаче;
- массовое утверждение выбранных карточек;
- экспорт выбранных результатов в CSV для Excel.

### Explainable AI

Для каждой карточки можно открыть drawer **"Почему это совпало?"**.

В нем отображается сравнение:
- товара из матрицы поставщика;
- требований лота;
- подходящей позиции внутри лота.

Совпадающие фрагменты подсвечиваются как маркером. Это помогает пользователю понять, почему модель посчитала лот релевантным.

### Feedback loop

В карточках есть обратная связь:
- лайк, если совпадение хорошее;
- дизлайк, если модель ошиблась;
- форма отправки комментария по ошибке.

Эти данные сохраняются на backend и могут использоваться для дальнейшего улучшения модели.

## Что реализовано технически

### Frontend

Frontend написан на `React + TypeScript + Vite + Tailwind CSS`.

Реализовано:
- SPA-интерфейс с пошаговым сценарием;
- кастомная дизайн-система `RLT 3.0`;
- переиспользуемые UI-компоненты;
- загрузка файлов;
- таблица preview и column mapping;
- dashboard;
- канбан-доска;
- drawer для explainable AI;
- modal для feedback;
- экспорт выбранных карточек;
- интеграция с backend через REST API.

Основные UI-компоненты:
- `Button`;
- `FileUpload`;
- `Input`;
- `Checkbox`;
- `Slider`.

### Backend

Backend написан на `FastAPI`.

Реализовано:
- загрузка матрицы поставщика через API;
- чтение `CSV/XLSX`;
- сохранение draft-файлов;
- запуск локального ML runtime;
- polling статуса анализа;
- расчет dashboard-метрик;
- выдача товаров поставщика;
- выдача top-3 лотов по каждому товару;
- хранение workflow-статусов;
- хранение feedback;
- explain endpoint;
- export endpoint;
- системные источники для базы закупок и ОКПД2.

Хранилище:
- `SQLite` для сессий, товаров, матчей, workflow-статусов и feedback;
- файловое хранилище для drafts, cache и system sources.

### ML

ML-составляющая работает локально и не использует внешние API.

Используется гибридный retrieval runtime:
- TF-IDF;
- char n-grams;
- dense embeddings;
- SVD;
- rule-based scoring;
- type matching;
- service/repair penalties;
- aggregation до уровня лотов.

Для каждого товара система возвращает top-3 наиболее релевантных `PN lot`.

## Ограничения хакатона

По условиям интенсива интеллектуальная система должна работать только на инфраструктуре команды.

Поэтому в проекте:
- не используются внешние LLM API;
- не используются OpenAI, Gemini, Anthropic и аналогичные сервисы;
- не используются Google/Yandex/Bing Search API;
- ML runtime запускается локально на backend;
- база закупок и справочник ОКПД2 лежат внутри системы.

## Архитектура

```text
React UI
  -> /api/*
FastAPI backend
  -> SQLite
      -> sessions
      -> seller_items
      -> matches
      -> feedback
      -> workflow_status
  -> hybrid_lot_matcher_package.zip
      -> runtime bundle
      -> vectorizers
      -> embeddings
      -> prepared procurement base
```

## Структура проекта

```text
src/                 frontend на React
src/components/ui/   кастомные UI-компоненты
src/lib/api.ts       frontend API client
src/App.tsx          основной пользовательский сценарий

backend/             FastAPI backend
backend/app.py       API, ML-интеграция, SQLite-логика
backend/data/        локальная БД и runtime-данные

notebooks/ml/        Jupyter notebooks с ML-кодом

tailwind.config.js   дизайн-токены RLT 3.0
vite.config.ts       Vite config и proxy на backend
README.md            описание проекта
```

## ML notebooks

В репозиторий добавлены notebooks с кодом и описанием ML-составляющей:

- `notebooks/ml/00_ml_package_overview.ipynb` — обзор ML-пакета, manifest и зависимости;
- `notebooks/ml/01_hybrid_matcher_runtime.ipynb` — runtime-код `HybridLotMatcher`;
- `notebooks/ml/02_ml_baseline_full_source.ipynb` — baseline-код: нормализация, признаки, retrieval, scoring;
- `notebooks/ml/03_batch_prediction.ipynb` — CLI и Python API для пакетного прогноза;
- `notebooks/ml/04_model_config_and_examples.ipynb` — конфиг модели и примеры CSV.

## Важное ограничение по ML-пакету

В репозиторий не включены тяжелые бинарные артефакты:
- `hybrid_lot_matcher_package.zip`;
- `_ml_unpack/`;
- большие CSV-выгрузки;
- `*.pkl`, `*.npz`, `*.npy`.

Это сделано из-за лимитов GitHub на размер файлов.

Для полного локального запуска нужно вручную положить архив:

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

### Frontend

```bash
npm install
```

### Backend

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

Документация FastAPI:

```text
http://127.0.0.1:8000/docs
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

Vite проксирует запросы `/api` на backend.

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
- `app.db` — SQLite база;
- `drafts/` — загруженные матрицы поставщиков;
- `analysis_cache/` — кеш рассчитанных результатов;
- `system_sources/` — загруженные системные источники.

## Почему повторный поиск работает быстрее

Сделано два уровня ускорения:
- ML runtime использует заранее собранный индекс закупок из пакета;
- backend кеширует результаты анализа по хэшу исходного файла и пользовательскому mapping.

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

Проект является рабочим прототипом, готовым для локальной демонстрации.

Главный pipeline работает на реальных данных: пользователь загружает матрицу, backend запускает локальный ML runtime, система возвращает top-3 `PN lot` для каждого товара и позволяет обработать найденные совпадения в рабочем пространстве.
