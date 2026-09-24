#!/bin/sh
cd "$(dirname "$0")" || exit 1
if ! command -v python3 >/dev/null 2>&1; then
  echo 'Python 3 is required on macOS. Install it from python.org and run this installer again.'
  exit 1
fi
python3 install-macos.py "$@"
printf '\nPress Return to close. '
read -r resume_fill_reply
