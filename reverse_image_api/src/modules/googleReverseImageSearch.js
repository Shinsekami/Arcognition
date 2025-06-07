import axios from 'axios';
import FormData from 'form-data';
import { load } from 'cheerio';

const GOOGLE_SEARCH_BY_IMAGE = 'https://www.google.com/searchbyimage/upload';

export default async function reverseSearch(buffer) {
  // 1) build the multipart/form-data payload
  const form = new FormData();
  form.append('encoded_image', buffer, { filename: 'image.jpg' });
  form.append('image_content', '');
  form.append('filename', '');

  // 2) POST to Google’s upload endpoint, telling axios not to follow redirects
  const uploadRes = await axios.post(GOOGLE_SEARCH_BY_IMAGE, form, {
    headers: {
      ...form.getHeaders(),
      // pretend to be a real browser
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    },
    maxRedirects: 0,
    validateStatus: status => status === 302,
  });

  // 3) Google responds with a 302 redirect to the actual search results page
  const redirectUrl = uploadRes.headers.location;
  if (!redirectUrl) {
    throw new Error('No redirect from Google Image upload');
  }

  // 4) Fetch the results page
  const resultsPage = await axios.get(redirectUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    },
  });
  const $ = load(resultsPage.data);

  // 5) Scrape the “best guess” & the result links
  const bestGuess = $('#topstuff .card-section a').first().text() || null;
  const links = [];
  $('#search a')
    .filter((_, a) => {
      const href = $(a).attr('href') || '';
      // only top‐level result links
      return href.startsWith('/url?');
    })
    .each((_, a) => {
      const href = $(a).attr('href');
      // Google wraps them in /url?q=ACTUAL_URL&sa=…
      const m = href.match(/\/url\?q=([^&]+)/);
      if (m) links.push(decodeURIComponent(m[1]));
    });

  return { bestGuess, links };
}
