const { Router } = require("express");
const multer = require("multer");
const axios = require("axios");
const FormData = require("form-data");
const {
  SuccessResponseObject,
  ErrorResponseObject,
} = require("../common/http");
const { reverse } = require("../modules");
const cheerio = require("cheerio");

function parsePrice(text) {
  const m = text && text.match(/(?:€|EUR|Euro)\s*([0-9]+(?:[.,][0-9]+)?)/i);
  if (!m) return null;
  return parseFloat(m[1].replace(/,/g, "."));
}

async function scrapeInfo(url) {
  try {
    const page = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      },
    });
    const $ = cheerio.load(page.data);
    const title =
      $("meta[property='og:title']").attr("content") || $("title").first().text();
    const thumb = $("meta[property='og:image']").attr("content") || null;
    const priceMeta =
      $("meta[property='product:price:amount']").attr("content") ||
      $("meta[itemprop='price']").attr("content");
    const price = parsePrice(priceMeta || $.text());
    const site = new URL(url).hostname.replace(/^www\./, "");
    return { site, url, title, price_eur: price, thumbnail: thumb };
  } catch (err) {
    console.error("scrapeInfo", url, err.message);
    return null;
  }
}

const r = Router();
const upload = multer();

r.get("/", (req, res) =>
  res
    .status(200)
    .json(
      new SuccessResponseObject(
        "https://github.com/SOME-1HING/google-reverse-image-api"
      )
    )
);
module.exports = r;

r.post("/reverse", upload.single("image"), async (req, res) => {
  try {
    let { imageUrl } = req.body;
    if (!imageUrl && req.file) {
      // upload the file to a temporary hosting service to obtain a URL
      const form = new FormData();
      form.append("file", req.file.buffer, {
        filename: req.file.originalname || "image.jpg",
      });
      const upRes = await axios.post("https://0x0.st", form, {
        headers: { ...form.getHeaders(), 'User-Agent': 'curl/8.0' },
      });
      imageUrl = upRes.data.trim();
    }

    if (!imageUrl) {
      return res.status(400).json(new ErrorResponseObject("No image provided"));
    }

    const result = await reverse(imageUrl);
    if (result["success"]) {
      let links = [];
      if (result.data && result.data.similarUrl) {
        const page = await axios.get(result.data.similarUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
          },
        });
        const $ = cheerio.load(page.data);
        $("a").each((i, el) => {
          if (links.length >= 10) return false;
          const href = $(el).attr("href");
          if (href && href.startsWith("http")) {
            links.push(href);
          }
        });
      }
      const results = [];
      for (const url of links.slice(0, 5)) {
        const info = await scrapeInfo(url);
        if (info) results.push(info);
      }
      res.status(200).json({ results });
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    console.error("/reverse error:", error);
    res.status(500).json(new ErrorResponseObject("Failed to reverse image"));
  }
});
