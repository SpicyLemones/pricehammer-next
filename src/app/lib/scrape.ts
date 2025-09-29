import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

puppeteer.use(StealthPlugin());

export async function fetchPriceFromLinkWithSellerSelectors(
  seller: { price_selector?: string; sale_selector?: string },
  link: string
): Promise<number | null> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
  );

  await page.goto(link, { waitUntil: "domcontentloaded", timeout: 30000 });

  const price = await page.evaluate(({ priceSel, saleSel }) => {
    const pick = (txt?: string | null) => {
      if (!txt) return null;
      const m = txt.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
      return m ? parseFloat(m[0]) : null;
    };
    const sale = saleSel ? document.querySelector(saleSel)?.textContent : "";
    const reg = priceSel ? document.querySelector(priceSel)?.textContent : "";
    const item =
      document.querySelector("[itemprop='price']")?.getAttribute?.("content") ||
      document.querySelector("[itemprop='price']")?.textContent ||
      "";

    return pick(sale) ?? pick(reg) ?? pick(item) ?? null;
  }, { priceSel: seller.price_selector, saleSel: seller.sale_selector });

  await page.close();
  await browser.close();
  return price;
}
