/**
 * Production entry: Puppeteer launch. Not imported by unit tests.
 */
import puppeteer from "puppeteer";

import { renderHtmlToPdf } from "./render";
import { createRendererServer } from "./server";

const port = Number(process.env.PORT ?? "8080");

const server = createRendererServer((request) =>
  renderHtmlToPdf(request, {
    async launch() {
      return puppeteer.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-dev-shm-usage",
          "--disable-extensions",
          "--disable-gpu",
        ],
      });
    },
  })
);

server.listen(port);
