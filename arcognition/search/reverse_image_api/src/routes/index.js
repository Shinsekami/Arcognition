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
        headers: form.getHeaders(),
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
      res.status(200).json({ links });
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    console.error("/reverse error:", error);
    res.status(500).json(new ErrorResponseObject("Failed to reverse image"));
  }
});
