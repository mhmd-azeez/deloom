import { Hono } from "hono";
import type { Bindings } from "./types";
import publicRoutes from "./public";
import dashboardRoutes from "./dashboard";
import mediaRoutes from "./media";

const app = new Hono<{ Bindings: Bindings }>();

// Public routes
app.route("/", publicRoutes);

// Dashboard routes (protected by Cloudflare Access at the network layer)
app.route("/dashboard", dashboardRoutes);

// Media streaming
app.route("/media", mediaRoutes);

// Root redirect
app.get("/", (c) => c.redirect("/dashboard"));

export default app;
