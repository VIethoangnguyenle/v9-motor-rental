import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { initAuth } from "./lib/auth";
import { createAppRouter } from "./router";
import "./index.css";

// TRƯỚC mọi thứ khác: `initAuth` vá `window.fetch`. Request nào bay ra trước lời
// gọi này đi bằng `fetch` chưa vá — không cookie, không tự refresh token.
initAuth();

const queryClient = new QueryClient();
// Cùng một instance cho cả guard của router lẫn cây React. Xem `createAppRouter`.
const router = createAppRouter(queryClient);

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Không tìm thấy #root trong index.html");

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
