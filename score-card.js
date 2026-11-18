/* Score card: a 1080x1350 image of the player's score, drawn on a canvas and
   shared as a picture (or downloaded when the browser cannot share files). */
(() => {
  "use strict";

  const W = 1080;
  const H = 1350;

  const COPY = {
    title: "Brew or False",
    points: "points",
    correct: "correct answers",
    cta: "Can you beat me?",
    url: "breworfalse.com"
  };

  const ESPRESSO = "#3e271c";
  const SLATE = "#26211f";
  const CREMA = "#deb887";
  const CREAM = "#fff7ed";

  function roundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  // A steaming cup, bottom-right of the slate card.
  function cup(ctx, cx, cy) {
    ctx.strokeStyle = CREMA;
    ctx.fillStyle = CREAM;
    ctx.lineWidth = 10;
    roundedRect(ctx, cx - 70, cy - 60, 140, 110, 26);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 80, cy - 10, 34, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 110, cy + 66);
    ctx.lineTo(cx + 110, cy + 66);
    ctx.stroke();
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    [-30, 0, 30].forEach((dx) => {
      ctx.beginPath();
      ctx.moveTo(cx + dx, cy - 80);
      ctx.quadraticCurveTo(cx + dx - 14, cy - 110, cx + dx, cy - 135);
      ctx.quadraticCurveTo(cx + dx + 14, cy - 160, cx + dx, cy - 185);
      ctx.stroke();
    });
    ctx.lineCap = "butt";
  }

  // Draws the card on any 2D context (a real canvas or a recording stub in tests).
  function draw(ctx, options) {
    const o = options || {};
    const score = Math.max(0, Math.floor(Number(o.score) || 0));

    ctx.fillStyle = ESPRESSO;
    ctx.fillRect(0, 0, W, H);

    // slate card
    ctx.fillStyle = SLATE;
    roundedRect(ctx, 90, 130, W - 180, 760, 36);
    ctx.fill();
    ctx.strokeStyle = CREMA;
    ctx.lineWidth = 8;
    ctx.stroke();

    // score
    ctx.textAlign = "center";
    ctx.fillStyle = CREAM;
    ctx.font = "800 330px Inter, Arial, sans-serif";
    ctx.fillText(String(score), W / 2 - 60, 520);
    ctx.font = "700 56px Inter, Arial, sans-serif";
    ctx.fillText(COPY.points.toUpperCase(), W / 2 - 60, 600);
    if (
      Number.isInteger(o.total) &&
      o.total > 0 &&
      Number.isInteger(o.correct) &&
      o.correct >= 0 &&
      o.correct <= o.total
    ) {
      ctx.font = "700 39px Inter, Arial, sans-serif";
      ctx.fillText(`${o.correct}/${o.total} ${COPY.correct}`, W / 2, 780);
    }

    cup(ctx, W - 260, 330);

    // texts below the card
    ctx.fillStyle = CREAM;
    ctx.font = "800 76px Inter, Arial, sans-serif";
    ctx.fillText(COPY.cta, W / 2, 1010);
    ctx.fillStyle = CREMA;
    ctx.font = "700 52px Inter, Arial, sans-serif";
    ctx.fillText(COPY.title, W / 2, 1100);
    ctx.fillStyle = CREAM;
    ctx.font = "700 46px Inter, Arial, sans-serif";
    ctx.fillText(COPY.url, W / 2, 1200);
    if (o.label) {
      ctx.font = "700 44px Inter, Arial, sans-serif";
      ctx.fillText(String(o.label), W / 2, 90);
    }
  }

  function toBlob(options) {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("canvas unavailable"));
        return;
      }
      draw(ctx, options);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("no image"))), "image/png");
    });
  }

  function fileName(score) {
    return `brew-or-false-score-${Math.max(0, Math.floor(Number(score) || 0))}.png`;
  }

  function download(blob, name) {
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }

  // options: { score, correct, total, label, text }. Shares the picture when the browser
  // can share files, otherwise downloads it.
  async function share(options) {
    const o = options || {};
    const blob = await toBlob(o);
    const name = fileName(o.score);
    try {
      const file = new File([blob], name, { type: "image/png" });
      const data = { files: [file], text: String(o.text || "") };
      if (navigator.canShare && navigator.canShare(data) && navigator.share) {
        await navigator.share(data);
        return "shared";
      }
    } catch (err) {
      if (err && err.name === "AbortError") return "cancelled";
    }
    download(blob, name);
    return "downloaded";
  }

  window.WT_ScoreCard = { W, H, draw, toBlob, share, fileName };
})();
