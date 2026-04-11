# ML notebooks

Эта папка содержит Jupyter notebooks с кодом и описанием ML-составляющей проекта.

## Что внутри

- `00_ml_package_overview.ipynb` — обзор ML-пакета, README, manifest и зависимости.
- `01_hybrid_matcher_runtime.ipynb` — полный runtime-код `HybridLotMatcher`.
- `02_ml_baseline_full_source.ipynb` — полный baseline-код: нормализация, признаки, retrieval, rules/scoring.
- `03_batch_prediction.ipynb` — CLI и Python API для пакетного прогноза.
- `04_model_config_and_examples.ipynb` — конфиг модели и примеры входного/выходного CSV.

## Важно

Ноутбуки фиксируют код ML-части в читаемом виде для GitHub и презентации. Тяжелые бинарные артефакты модели (`*.pkl`, `*.npz`, `*.npy`) не коммитятся в репозиторий и остаются локальными/передаются отдельным архивом.
