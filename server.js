require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");

const app = express();
app.use(cors());
app.use(express.json());

function auth(req, res, next) {
  const expected = `Bearer ${process.env.GPT_SHARED_SECRET}`;
  if (req.headers.authorization !== expected) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

app.get("/health", auth, (req, res) => {
  res.json({ ok: true, service: "gexit-gpt-api" });
});

app.get("/shopify/products", auth, async (req, res) => {
  try {
    const url = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2025-01/products.json?limit=10`;

    const r = await fetch(url, {
      headers: {
        "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_ACCESS_TOKEN,
        "Content-Type": "application/json"
      }
    });

    const data = await r.json();

    if (!r.ok) {
      return res.status(r.status).json({ error: "Shopify error", details: data });
    }

    const products = (data.products || []).map(p => ({
      id: p.id,
      title: p.title,
      status: p.status,
      vendor: p.vendor,
      handle: p.handle
    }));

    res.json({ products });
  } catch (err) {
    res.status(500).json({ error: "Internal error", details: err.message });
  }
});

app.post("/shopify/products", auth, async (req, res) => {
  try {
    const {
      title,
      body_html,
      vendor,
      product_type,
      price,
      inventory_quantity
    } = req.body;

    if (!title || !price) {
      return res.status(400).json({ error: "title and price are required" });
    }

    const payload = {
      product: {
        title,
        body_html: body_html || "",
        vendor: vendor || "Gexit",
        product_type: product_type || "General",
        variants: [
          {
            price: String(price),
            inventory_management: "shopify",
            inventory_quantity: Number(inventory_quantity || 0)
          }
        ]
      }
    };

    const url = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2025-01/products.json`;

    const r = await fetch(url, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": process.env.SHOPIFY_ADMIN_ACCESS_TOKEN,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await r.json();

    if (!r.ok) {
      return res.status(r.status).json({ error: "Shopify error", details: data });
    }

    res.json({
      success: true,
      product: {
        id: data.product?.id,
        title: data.product?.title,
        handle: data.product?.handle,
        status: data.product?.status
      }
    });
  } catch (err) {
    res.status(500).json({ error: "Internal error", details: err.message });
  }
});

app.post("/meta/campaign-draft", auth, async (req, res) => {
  try {
    const { campaign_name, objective, daily_budget, status } = req.body;

    if (!campaign_name || !objective || !daily_budget) {
      return res.status(400).json({
        error: "campaign_name, objective, daily_budget are required"
      });
    }

    const url = `https://graph.facebook.com/v23.0/${process.env.META_AD_ACCOUNT_ID}/campaigns`;

    const form = new URLSearchParams();
    form.append("name", campaign_name);
    form.append("objective", objective);
    form.append("status", status || "PAUSED");
    form.append("daily_budget", String(daily_budget));
    form.append("special_ad_categories", "[]");
    form.append("access_token", process.env.META_ACCESS_TOKEN);

    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: form.toString()
    });

    const data = await r.json();

    if (!r.ok) {
      return res.status(r.status).json({ error: "Meta error", details: data });
    }

    res.json({
      success: true,
      campaign_id: data.id,
      message: "Campaign draft created in paused state"
    });
  } catch (err) {
    res.status(500).json({ error: "Internal error", details: err.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Gexit GPT API läuft auf Port ${PORT}`);
});
