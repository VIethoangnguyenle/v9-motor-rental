// Tailwind v4 chạy qua PostCSS plugin riêng (@tailwindcss/postcss), KHÔNG phải
// `tailwindcss` như v3. Không có tailwind.config.js: v4 khai theme bằng @theme
// ngay trong CSS — xem app/globals.css.
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
