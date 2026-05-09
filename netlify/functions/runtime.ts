import type { Handler } from "@netlify/functions";

const handler: Handler = async () => {
  return {
    statusCode: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
    body: JSON.stringify({
      siteName: process.env.SITE_NAME ?? null,
      siteUrl: process.env.URL ?? null,
      now: new Date().toISOString(),
    }),
  };
};

export { handler };
