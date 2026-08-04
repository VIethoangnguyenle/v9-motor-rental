import type { App } from "@v9/api";
import { createApiClient } from "@v9/shared/client";

export const api = createApiClient<App>(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001");
