const fs = require("fs");
const cc = fs.readFileSync("D:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/src/components/corner/CrawlerControlPanel.tsx", "utf8");

// Show the full fetchMatches function around recvMainMarkets with line numbers
const lines = cc.split("\r\n");
const recvLine = lines.findIndex(l => l.includes("recvMainMarkets"));
console.log("=== Around recvMainMarkets (L" + (recvLine+1) + ") ===");
for (let i = recvLine - 10; i <= recvLine + 15 && i < lines.length; i++) {
  console.log("L" + (i+1) + ": " + lines[i]);
}

// Check the render section for main_markets
const renderLine = lines.findIndex(l => l.includes('activeTab === "main_markets"'));
if (renderLine > 0) {
  console.log("\n=== main_markets render (L" + (renderLine+1) + ") ===");
  for (let i = renderLine; i <= renderLine + 60 && i < lines.length; i++) {
    console.log("L" + (i+1) + ": " + lines[i]);
  }
} else {
  console.log("\nmain_markets render NOT in lines array");
}

// Check the soccerMarkets capture - what data does it return?
const crawlerJs = fs.readFileSync("D:/下载/足球竞彩量化分析系统/足球竞彩量化分析系统/backend/services/cornerCrawler.js", "utf8");
const soccerIdx = crawlerJs.indexOf("Captured main markets for");
if (soccerIdx > 0) {
  console.log("\n=== soccerMarkets capture result ===");
  console.log(crawlerJs.substring(soccerIdx - 10, soccerIdx + 80));
}
