#!/bin/sh
# 席で事切れた写真を切り抜いて登録する（/workspace/seatdown_src/<id>.jpg → assets/frames/<id>_seatdown.png）。引数はそのまま add_seatdown.py へ
cd "$(dirname "$0")/.." || exit 1
PY=python3; [ -x /workspace/.venv_rembg/bin/python ] && PY=/workspace/.venv_rembg/bin/python
exec "$PY" tools/add_seatdown.py "$@"
