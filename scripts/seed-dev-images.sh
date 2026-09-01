#!/usr/bin/env bash
set -euo pipefail
# Ảnh sinh vào .tmp-seed-images/ ở gốc repo (đã bị .gitignore bỏ qua): chúng là
# artifact dựng lại được trong 2 giây, không phải nguồn sự thật.
S="$(cd "$(dirname "$0")/.." && pwd)/.tmp-seed-images"
mkdir -p "$S"
mk() {
  local title="$1" bg="$2" sub="$3" out="$4"
  ffmpeg -loglevel error -f lavfi -i "color=c=${bg}:s=1600x1000" \
    -vf "drawtext=text='${title}':fontcolor=white:fontsize=96:x=(w-text_w)/2:y=(h-text_h)/2-70,drawtext=text='${sub}':fontcolor=0xbbbbbb:fontsize=46:x=(w-text_w)/2:y=(h-text_h)/2+70,drawtext=text='ANH MAU - DEV ONLY':fontcolor=0xff6666:fontsize=40:x=(w-text_w)/2:y=h-130:box=1:boxcolor=black@0.65:boxborderw=16" \
    -frames:v 1 -y "$S/$out"
}
mk "HONDA CB500X"     "0x22303a" "471cc - mau do"      cb500x.png
mk "KAWASAKI Z900"    "0x1d2a1d" "948cc - xanh la"     z900.png
mk "YAMAHA MT-07"     "0x33253c" "689cc - xam nham"    mt07.png
mk "HONDA REBEL 500"  "0x3a2e24" "471cc - den mo"      rebel500.png
mk "BMW G310GS"       "0x24303c" "313cc - trang"       g310gs.png
mk "DUCATI SCRAMBLER" "0x3c2424" "803cc - vang"        scrambler.png
