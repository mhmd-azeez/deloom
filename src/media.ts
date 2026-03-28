import { Hono } from "hono";
import type { Bindings } from "./types";

const app = new Hono<{ Bindings: Bindings }>();

app.get("/:key{.+}", async (c) => {
  const key = c.req.param("key");
  const bucket = c.env.BUCKET;
  const rangeHeader = c.req.header("range");

  const object = rangeHeader
    ? await bucket.get(key, { range: parseRange(rangeHeader) })
    : await bucket.get(key);

  if (!object) {
    return c.notFound();
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", "public, max-age=86400");

  if (rangeHeader && "range" in object) {
    const range = object.range as { offset: number; length: number };
    headers.set(
      "content-range",
      `bytes ${range.offset}-${range.offset + range.length - 1}/${object.size}`
    );
    headers.set("content-length", String(range.length));
    return new Response(object.body, { status: 206, headers });
  }

  headers.set("content-length", String(object.size));
  return new Response(object.body, { headers });
});

function parseRange(range: string): R2Range {
  const match = range.match(/bytes=(\d+)-(\d*)/);
  if (!match) return { offset: 0 };
  const offset = parseInt(match[1], 10);
  if (match[2]) {
    const end = parseInt(match[2], 10);
    return { offset, length: end - offset + 1 };
  }
  return { offset };
}

export default app;
