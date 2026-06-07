console.log("=== find-hga-api start ===");
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
console.log("imports OK, launching...");
(async () => {
  const b = await puppeteer.launch({ headless: true, args: ["--no-sandbox","--disable-setuid-sandbox","--disable-dev-shm-usage","--disable-gpu","--disable-blink-features=AutomationControlled"] });
  console.log("launched: " + (await b.version()));
  await b.close();
  console.log("done");
})().catch(e => console.error("ERR:", e.message));