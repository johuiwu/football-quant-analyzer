import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
puppeteer.use(StealthPlugin());
const page = (await puppeteer.launch({ headless: false, args: ["--no-sandbox","--disable-dev-shm-usage"] })).pages()[0] || (await (await puppeteer.launch({ headless: false, args: ["--no-sandbox","--disable-dev-shm-usage"] })).newPage());
async function run() {
  const browser = await puppeteer.launch({ headless: false, args: ["--no-sandbox","--disable-dev-shm-usage"] });
  const page = await browser.newPage();
  await page.goto("https://www.hga050.com", { waitUntil: "domcontentloaded", timeout: 30000 });
  await new Promise(r => setTimeout(r, 4000));
  // Check cookies
  const cookies = await page.cookies();
  console.log("All cookies:", cookies.map(c => c.name + "=" + (c.value||"").substring(0,20)).join(", "));
  const uidCookie = cookies.find(c => c.name === "uid" || c.name.includes("uid"));
  console.log("UID cookie:", uidCookie ? uidCookie.name + "=" + uidCookie.value.substring(0,30) : "NOT FOUND");
  console.log("Cookie count:", cookies.length);
  await browser.close();
}
run().catch(e => console.log(e.message));
