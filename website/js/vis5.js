const DATA_URL = "../data/preprocessed/vis5/sentiment_analysis_wildfire_cleaned.csv";

const POSITIVE_THRESHOLD = 0.05;
const NEGATIVE_THRESHOLD = -0.05;

const svg = d3.select("#wordcloud-svg");
const tooltip = d3.select("#wordcloud-tooltip");
const statusLine = d3.select("#vis5-status");

const topNSlider = d3.select("#topn-slider");
const topNValue = d3.select("#topn-value");

const summaryTerms = d3.select("#summary-terms");
const summaryFrequency = d3.select("#summary-frequency");
const summarySentiment = d3.select("#summary-sentiment");
const topTermsList = d3.select("#top-terms");

let allWords = [];
let sortedWords = [];
let currentTopN = 200;
let renderToken = 0;
let resizeTimer = null;

function fmtInt(n) {
  return d3.format(",")(Math.round(n));
}

function fmtSentiment(v) {
  if (!Number.isFinite(v)) return "N/A";
  return v.toFixed(3);
}

function sentimentCategory(sentiment) {
  if (sentiment > POSITIVE_THRESHOLD) return "positive";
  if (sentiment < NEGATIVE_THRESHOLD) return "negative";
  return "neutral";
}

function sentimentColor(sentiment) {
  const category = sentimentCategory(sentiment);
  if (category === "positive") return "#2f9e63";
  if (category === "negative") return "#d94841";
  return "#6b7280";
}

function getCloudSize() {
  const panel = document.querySelector(".chart-panel");
  if (!panel) {
    return { width: 900, height: 620 };
  }

  const width = Math.max(460, Math.floor(panel.clientWidth - 24));
  const height = Math.max(500, Math.floor(panel.clientHeight - 24));
  return { width, height };
}

function updateTopTermsList(words) {
  topTermsList.html("");

  words.slice(0, 12).forEach((word) => {
    const li = topTermsList.append("li");
    li.append("span")
      .attr("class", "word-item-word")
      .text(word.text);
    li.append("span")
      .attr("class", "word-item-meta")
      .text(`  (freq: ${fmtInt(word.frequency)}, sentiment: ${fmtSentiment(word.sentiment)})`);
  });
}

function updateSummary(words) {
  const totalFrequency = d3.sum(words, (d) => d.frequency);
  const avgSentiment = d3.mean(words, (d) => d.sentiment);

  summaryTerms.text(fmtInt(words.length));
  summaryFrequency.text(fmtInt(totalFrequency));
  summarySentiment.text(fmtSentiment(avgSentiment));
}

function showTooltip(event, d) {
  const panel = document.querySelector(".chart-panel");
  if (!panel) return;

  const rect = panel.getBoundingClientRect();
  const category = sentimentCategory(d.sentiment);

  tooltip
    .style("opacity", 1)
    .style("left", `${event.clientX - rect.left}px`)
    .style("top", `${event.clientY - rect.top}px`)
    .html(
      `<strong>${d.text}</strong><br>` +
      `Frequency: ${fmtInt(d.frequency)}<br>` +
      `Sentiment: ${fmtSentiment(d.sentiment)} (${category})`
    );
}

function hideTooltip() {
  tooltip.style("opacity", 0);
}

function drawCloud(layoutWords, width, height) {
  svg.selectAll("*").remove();
  svg.attr("viewBox", `0 0 ${width} ${height}`);

  const cloudGroup = svg.append("g")
    .attr("transform", `translate(${width / 2}, ${height / 2})`);

  cloudGroup.selectAll("text")
    .data(layoutWords)
    .enter()
    .append("text")
    .style("font-family", "Space Grotesk, Manrope, sans-serif")
    .style("font-size", (d) => `${d.size}px`)
    .style("fill", (d) => sentimentColor(d.sentiment))
    .style("cursor", "pointer")
    .attr("text-anchor", "middle")
    .attr("transform", (d) => `translate(${d.x}, ${d.y}) rotate(${d.rotate || 0})`)
    .text((d) => d.text)
    .on("mouseover", function(d) {
      d3.select(this)
        .transition()
        .duration(120)
        .style("font-size", `${d.size * 1.15}px`);
      showTooltip(d3.event, d);
    })
    .on("mousemove", function(d) {
      showTooltip(d3.event, d);
    })
    .on("mouseout", function(d) {
      d3.select(this)
        .transition()
        .duration(120)
        .style("font-size", `${d.size}px`);
      hideTooltip();
    });
}

function renderCloud(topN) {
  if (!sortedWords.length) return;

  const words = sortedWords.slice(0, topN);
  const { width, height } = getCloudSize();

  const maxFreq = d3.max(words, (d) => d.frequency);
  const minFreq = d3.min(words, (d) => d.frequency);

  const sizeScale = d3.scaleSqrt()
    .domain([Math.max(1, minFreq), maxFreq])
    .range([14, Math.min(96, Math.max(52, width / 6.8))]);

  const layoutWords = words.map((d) => ({
    text: d.text,
    frequency: d.frequency,
    sentiment: d.sentiment,
    size: sizeScale(d.frequency)
  }));

  renderToken += 1;
  const token = renderToken;

  statusLine.text(`Rendering top ${topN} words...`);

  d3.layout.cloud()
    .size([width, height])
    .words(layoutWords)
    .padding(2)
    .rotate(() => 0)
    .font("Space Grotesk")
    .fontSize((d) => d.size)
    .on("end", (finalWords) => {
      if (token !== renderToken) return;
      drawCloud(finalWords, width, height);
      updateSummary(words);
      updateTopTermsList(words);
      statusLine.text(`Showing top ${topN} terms from ${fmtInt(sortedWords.length)} cleaned words.`);
    })
    .start();
}

function configureTopNSlider() {
  const sliderMax = Math.min(500, sortedWords.length);
  const sliderMin = Math.min(20, sliderMax);
  const defaultTopN = Math.max(sliderMin, Math.min(200, sliderMax));

  topNSlider
    .attr("min", sliderMin)
    .attr("max", sliderMax)
    .attr("step", 10)
    .property("value", defaultTopN);

  currentTopN = defaultTopN;
  topNValue.text(defaultTopN);

  topNSlider.on("input", function() {
    currentTopN = +this.value;
    topNValue.text(currentTopN);
    renderCloud(currentTopN);
  });
}

function onResize() {
  if (resizeTimer) window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    renderCloud(currentTopN);
  }, 180);
}

function loadData() {
  d3.csv(DATA_URL).then((rows) => {
    allWords = rows
      .map((d) => ({
        text: String(d.word || "").trim(),
        frequency: +(d.frequency || 0),
        sentiment: +(d.sentiment || 0)
      }))
      .filter((d) => d.text && Number.isFinite(d.frequency) && d.frequency > 0 && Number.isFinite(d.sentiment));

    sortedWords = allWords.sort((a, b) => b.frequency - a.frequency);

    if (!sortedWords.length) {
      throw new Error("No valid word records found in dataset.");
    }

    configureTopNSlider();
    renderCloud(currentTopN);

    window.addEventListener("resize", onResize);
  }).catch((err) => {
    console.error("Failed to load vis5 data:", err);
    statusLine.text(`Failed to load data: ${err.message}`);
  });
}

loadData();
