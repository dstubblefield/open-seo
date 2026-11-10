import { afterEach, describe, expect, it, vi } from "vitest";
import { discoverUrls, parseRobotsTxt } from "@/server/lib/audit/discovery";

// Resolves the request-signing env lookup instantly, so it can't race the
// fake timers below.
vi.mock("cloudflare:workers", () => ({ env: {} }));

function sitemapXml(urls: string[]): string {
  const entries = urls.map((url) => `<url><loc>${url}</loc></url>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><urlset>${entries}</urlset>`;
}

describe("discoverUrls", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  // Shopify's edge refuses a crawler's first requests now and then; a sitemap
  // shard dropped on a 429 took every URL in it out of the audit.
  it("retries a sitemap refused with 429 after its Retry-After", async () => {
    vi.useFakeTimers();
    let sitemapFetches = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.endsWith("/robots.txt") || url.endsWith("/llms.txt")) {
          return Promise.resolve(new Response("User-agent: *\nAllow: /"));
        }
        sitemapFetches += 1;
        return Promise.resolve(
          sitemapFetches === 1
            ? new Response("local_rate_limited", {
                status: 429,
                headers: { "retry-after": "5" },
              })
            : new Response(sitemapXml(["https://example.com/a"]), {
                headers: { "content-type": "application/xml" },
              }),
        );
      }),
    );

    const discovery = discoverUrls("https://example.com", 10);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(sitemapFetches).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    const { urls } = await discovery;

    expect(urls).toEqual(["https://example.com/a"]);
  });

  // Only a clear 404 means "no llms.txt"; a block or server error says nothing.
  it.each([
    [404, true],
    [200, false],
    [403, false],
    [503, false],
  ])("reports llms.txt status %i as missing: %s", async (status, missing) => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        Promise.resolve(
          new Response("", {
            status: url.endsWith("/llms.txt") ? status : 404,
          }),
        ),
      ),
    );

    const { llmsTxtMissing } = await discoverUrls("https://example.com", 10);

    expect(llmsTxtMissing).toBe(missing);
  });

  it("neither fetches nor reports llms.txt when robots.txt disallows it", async () => {
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve(
        url.endsWith("/robots.txt")
          ? new Response("User-agent: *\nDisallow: /llms.txt")
          : new Response("", { status: 404 }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { llmsTxtMissing } = await discoverUrls("https://example.com", 10);

    expect(llmsTxtMissing).toBe(false);
    expect(fetchMock).not.toHaveBeenCalledWith(
      "https://example.com/llms.txt",
      expect.anything(),
    );
  });

  // Seeding the frontier is what sets a page's in-sitemap flag, so a URL
  // dropped here reports inSitemap: false once the crawl reaches it through a
  // link. Real sitemaps bury the homepage in the middle of the list
  // (bannerbear.com lists it 387th of 1,328).
  it("returns sitemap URLs listed past the crawl's page budget", async () => {
    const posts = Array.from(
      { length: 5 },
      (_, index) => `https://example.com/blog/post-${index}/`,
    );
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) =>
        Promise.resolve(
          url.endsWith("/robots.txt")
            ? new Response("User-agent: *\nAllow: /")
            : new Response(sitemapXml([...posts, "https://example.com/"]), {
                headers: { "content-type": "application/xml" },
              }),
        ),
      ),
    );

    const { urls } = await discoverUrls("https://example.com", 2);

    expect(urls).toContain("https://example.com/");
  });
});

describe("parseRobotsTxt", () => {
  it("applies an OpenSEO-Audit group over the wildcard group", () => {
    const robots = parseRobotsTxt(
      "https://example.com",
      "User-agent: *\nAllow: /\n\nUser-agent: OpenSEO-Audit\nDisallow: /private/",
    );

    expect(robots.isAllowed("https://example.com/private/page")).toBe(false);
    expect(robots.isAllowed("https://example.com/public")).toBe(true);
  });
});
