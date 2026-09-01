/**
 * Ba hằng do `vite.config.ts` nướng vào bundle lúc build (`define`). Không khai
 * ở đây thì `tsc` không biết chúng tồn tại — chúng không phải biến môi trường,
 * nên `import.meta.env` không thấy.
 */
declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;
declare const __APP_BUILT_AT__: string;
