#!/usr/bin/env bash
#
# Ảnh mẫu cho `bun run seed:dev`.
#
# Hai đường, và thứ tự ưu tiên là có lý do:
#
#   1. Nếu .tmp-seed-images/raw/ có ảnh xe (do `agy` sinh, hoặc bạn tự bỏ vào),
#      script dán NHÃN lên chúng.
#   2. Nếu không, nó vẽ ảnh chữ đơn giản làm dự phòng.
#
# ⚠️ CẢ HAI ĐƯỜNG ĐỀU DÁN NHÃN "ANH MAU - DEV ONLY". Đó là điểm của file này,
# không phải trang trí. Đợt review 2026-09-01 tìm ra một ảnh test nằm trong
# Directus mang đúng tên xe, đúng title, đúng alt mô tả — và không có cách nào
# phân biệt nó với ảnh thật ngoài việc mở ra nhìn. Ảnh AI sinh ra trông NHƯ THẬT
# thì rủi ro đó còn lớn hơn ảnh chữ, nên nhãn càng bắt buộc.
#
# Cần ffmpeg.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/.tmp-seed-images"
RAW="$OUT/raw"
mkdir -p "$OUT"

# Nhãn ở góc dưới-phải, cỡ vừa đủ đọc: nó phải KHÔNG CHỐI CÃI ĐƯỢC nhưng cũng
# không che mất chủ thể — ảnh còn phải dùng để đánh giá bố cục và độ tương phản
# của DESIGN.md. Đặt giữa khung thì mỗi lần xem thiết kế lại vướng.
LABEL="drawtext=text='ANH MAU - DEV ONLY':fontcolor=0xff8080:fontsize=30:x=w-text_w-28:y=h-58:box=1:boxcolor=black@0.75:boxborderw=12"

# Dán nhãn lên một ảnh có sẵn.
label_real() {
  ffmpeg -loglevel error -i "$1" -vf "scale=1600:1000:force_original_aspect_ratio=increase,crop=1600:1000,${LABEL}" -frames:v 1 -y "$2"
}

# Dự phòng: vẽ ảnh chữ khi không có ảnh thật.
draw_text() {
  local title="$1" bg="$2" sub="$3" out="$4"
  ffmpeg -loglevel error -f lavfi -i "color=c=${bg}:s=1600x1000" \
    -vf "drawtext=text='${title}':fontcolor=white:fontsize=96:x=(w-text_w)/2:y=(h-text_h)/2-70,drawtext=text='${sub}':fontcolor=0xbbbbbb:fontsize=46:x=(w-text_w)/2:y=(h-text_h)/2+70,${LABEL}" \
    -frames:v 1 -y "$out"
}

one() {
  local file="$1" title="$2" bg="$3" sub="$4"
  if [ -f "$RAW/$file" ]; then
    label_real "$RAW/$file" "$OUT/$file"
    echo "  $file  ← ảnh thật + nhãn"
  else
    draw_text "$title" "$bg" "$sub" "$OUT/$file"
    echo "  $file  ← ảnh chữ dự phòng"
  fi
}

one cb500x.png     "HONDA CB500X"     "0x22303a" "471cc - mau do"
one z900.png       "KAWASAKI Z900"    "0x1d2a1d" "948cc - xanh la"
one mt07.png       "YAMAHA MT-07"     "0x33253c" "689cc - xam nham"
one rebel500.png   "HONDA REBEL 500"  "0x3a2e24" "471cc - den mo"
one g310gs.png     "BMW G310GS"       "0x24303c" "313cc - trang"
one scrambler.png  "DUCATI SCRAMBLER" "0x3c2424" "803cc - vang"
