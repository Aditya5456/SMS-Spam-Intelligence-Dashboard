#!/usr/bin/env bash
# SMS Spam Intelligence Dashboard - start script for macOS / Linux
set -e
cd "$(dirname "$0")"
if [ ! -d venv ]; then
  python3 -m venv venv
fi
source venv/bin/activate
pip install -r requirements.txt
python app.py
